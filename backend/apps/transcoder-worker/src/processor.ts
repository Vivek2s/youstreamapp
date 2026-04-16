import path from 'path';
import fs from 'fs';
import { exec, execSync } from 'child_process';
import { Content } from '../../api/src/models/content.model';
import { config } from '../../api/src/config';
import { updateHeartbeat, completeJob, failJob, isJobCancelled } from '../../api/src/queues/jobQueue';
import { uploadDirectoryToS3, uploadFileToS3, deleteLocalDirectory } from '../../api/src/utils/s3';
import { ITranscodeData } from '../../api/src/models/job.model';

const UPLOADS_DIR = path.join(config.storageRoot, 'uploads');
const STREAMS_DIR = path.join(config.storageRoot, 'streams');

fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(STREAMS_DIR, { recursive: true });

let activeTranscodes = 0;

export function getActiveTranscodeCount(): number {
  return activeTranscodes;
}

export async function processTranscodeJob(jobId: string, contentId: string, data: ITranscodeData) {
  const { inputPath, videoInfo } = data;

  if (!fs.existsSync(inputPath)) {
    await failJob(jobId, `Input file not found: ${inputPath}`);
    await Content.findByIdAndUpdate(contentId, {
      $set: { status: 'error', 'torrent.errorMessage': 'Transcode input file not found' },
    });
    return;
  }

  activeTranscodes++;

  try {
    await Content.findByIdAndUpdate(contentId, {
      $set: { status: 'transcoding', duration: Math.round(videoInfo.duration), isPortrait: videoInfo.isPortrait },
    });

    await transcodeToHLS(jobId, contentId, inputPath, videoInfo);
  } catch (err: any) {
    console.error(`❌ Transcode error for ${contentId}:`, err.message);
    await failJob(jobId, err.message);
    await Content.findByIdAndUpdate(contentId, {
      $set: { status: 'error', 'torrent.errorMessage': `Transcode failed: ${err.message}` },
    });
  } finally {
    activeTranscodes--;
  }
}

async function transcodeToHLS(jobId: string, contentId: string, inputPath: string, videoInfo: ITranscodeData['videoInfo']) {
  const outputDir = path.join(STREAMS_DIR, contentId);
  fs.mkdirSync(outputDir, { recursive: true });

  const tiers = videoInfo.isPortrait
    ? [
        { name: '480p', w: 480, h: 854, bitrate: '1500k' },
        { name: '720p', w: 720, h: 1280, bitrate: '4000k' },
        { name: '1080p', w: 1080, h: 1920, bitrate: '8000k' },
      ]
    : [
        { name: '480p', w: 854, h: 480, bitrate: '1500k' },
        { name: '720p', w: 1280, h: 720, bitrate: '4000k' },
        { name: '1080p', w: 1920, h: 1080, bitrate: '8000k' },
      ];

  const srcShort = Math.min(videoInfo.width, videoInfo.height);
  const applicableTiers = tiers.filter((t) => Math.min(t.w, t.h) <= srcShort);
  if (applicableTiers.length === 0) applicableTiers.push(tiers[0]);

  console.log(`\n🔄 Transcoding ${contentId}: ${videoInfo.width}x${videoInfo.height} ${videoInfo.isPortrait ? 'portrait' : 'landscape'}`);
  console.log(`   Tiers: ${applicableTiers.map((t) => t.name).join(', ')}`);

  applicableTiers.forEach((_, i) => fs.mkdirSync(path.join(outputDir, String(i)), { recursive: true }));

  const maps = applicableTiers.map((tier, i) =>
    `-map 0:v:0 -map 0:a:0? -filter:v:${i} "scale=${tier.w}:${tier.h}:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2" -c:v:${i} libx264 -b:v:${i} ${tier.bitrate} -maxrate:v:${i} ${tier.bitrate} -bufsize:v:${i} ${parseInt(tier.bitrate) * 2}k -preset slow -profile:v:${i} high -level:v:${i} 4.1`
  ).join(' ');

  const varStreamMap = applicableTiers.map((_, i) => `v:${i},a:${i}`).join(' ');

  const ffmpegCmd = [
    `ffmpeg -i "${inputPath}" -y`,
    maps,
    `-c:a aac -b:a 192k`,
    `-f hls -hls_time 4 -hls_playlist_type vod`,
    `-hls_segment_filename "${outputDir}/%v/segment_%03d.ts"`,
    `-master_pl_name master.m3u8`,
    `-var_stream_map "${varStreamMap}"`,
    `"${outputDir}/%v/stream.m3u8"`,
  ].join(' ');

  // Start heartbeat during transcode
  const heartbeatInterval = setInterval(() => updateHeartbeat(jobId), 30000);

  try {
    await new Promise<void>((resolve, reject) => {
      exec(ffmpegCmd, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    // Rename directories from 0,1,2 to meaningful names
    applicableTiers.forEach((tier, i) => {
      const src = path.join(outputDir, String(i));
      const dst = path.join(outputDir, tier.name);
      if (fs.existsSync(src)) fs.renameSync(src, dst);
    });

    // Fix master playlist paths
    const masterPath = path.join(outputDir, 'master.m3u8');
    if (fs.existsSync(masterPath)) {
      let master = fs.readFileSync(masterPath, 'utf-8');
      applicableTiers.forEach((tier, i) => {
        master = master.replace(new RegExp(`${i}/stream\\.m3u8`, 'g'), `${tier.name}/stream.m3u8`);
      });
      fs.writeFileSync(masterPath, master);
    }

    // Generate seek preview sprites
    await generateSprites(contentId, inputPath, videoInfo.duration);

  } catch (error: any) {
    console.error(`❌ Multi-variant transcode failed for ${contentId}:`, error.message);
    console.log('🔄 Retrying with single quality...');

    // Fallback: single quality
    const fallbackTier = applicableTiers[0];
    const simpleFfmpeg = [
      `ffmpeg -i "${inputPath}" -y`,
      `-vf "scale=${fallbackTier.w}:${fallbackTier.h}:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2"`,
      `-c:v libx264 -b:v ${fallbackTier.bitrate} -preset fast -profile:v main -level:v 4.0`,
      `-c:a aac -b:a 192k`,
      `-f hls -hls_time 4 -hls_playlist_type vod`,
      `-hls_segment_filename "${outputDir}/segment_%03d.ts"`,
      `"${outputDir}/stream.m3u8"`,
    ].join(' ');

    try {
      await new Promise<void>((resolve, reject) => {
        exec(simpleFfmpeg, (error) => {
          if (error) reject(error);
          else resolve();
        });
      });

      const masterContent = `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-STREAM-INF:BANDWIDTH=${parseInt(fallbackTier.bitrate) * 1000 + 128000},RESOLUTION=${fallbackTier.w}x${fallbackTier.h}\nstream.m3u8`;
      fs.writeFileSync(path.join(outputDir, 'master.m3u8'), masterContent);
    } catch (err2: any) {
      clearInterval(heartbeatInterval);
      console.error('❌ Simple transcode also failed:', err2.message);
      await failJob(jobId, `Transcode failed: ${err2.message}`);
      await Content.findByIdAndUpdate(contentId, {
        $set: { status: 'error', 'torrent.errorMessage': `Transcode failed: ${err2.message}` },
      });
      return;
    }
  }

  clearInterval(heartbeatInterval);

  // Upload to S3 and finalize
  if (config.storageMode === 's3') {
    await uploadDirectoryToS3(outputDir, config.awsS3StreamingBucket, contentId);
    deleteLocalDirectory(outputDir);
    deleteLocalDirectory(path.join(UPLOADS_DIR, contentId));
  }

  await finalizeContent(contentId, videoInfo.duration);
  await completeJob(jobId);
}

async function generateSprites(contentId: string, inputPath: string, duration: number): Promise<string> {
  try {
    const spritesDir = path.join(STREAMS_DIR, contentId, 'sprites');
    fs.mkdirSync(spritesDir, { recursive: true });

    const INTERVAL = 10;
    const THUMB_W = 160;
    const COLS = 10;
    const ROWS = 10;
    const PER_SHEET = COLS * ROWS;
    const totalThumbs = Math.ceil(duration / INTERVAL);
    const totalSheets = Math.ceil(totalThumbs / PER_SHEET);

    const spriteCmd = `ffmpeg -i "${inputPath}" -vf "fps=1/${INTERVAL},scale=${THUMB_W}:-1,tile=${COLS}x${ROWS}" -q:v 5 -y "${spritesDir}/sprite_%d.jpg"`;
    execSync(spriteCmd, { stdio: 'pipe', timeout: 300000 });

    let thumbH = 90;
    try {
      const probeOut = execSync(
        `ffprobe -v quiet -print_format json -show_streams "${spritesDir}/sprite_1.jpg"`,
        { stdio: ['pipe', 'pipe', 'pipe'] }
      ).toString();
      const probeData = JSON.parse(probeOut);
      const s = probeData.streams?.[0];
      if (s && s.width && s.height) thumbH = Math.round(s.height / ROWS);
    } catch {}

    let vtt = 'WEBVTT\n\n';
    let thumbIndex = 0;

    for (let sheetIdx = 0; sheetIdx < totalSheets; sheetIdx++) {
      const sheetFile = `sprite_${sheetIdx + 1}.jpg`;
      const thumbsInSheet = Math.min(PER_SHEET, totalThumbs - sheetIdx * PER_SHEET);

      for (let i = 0; i < thumbsInSheet; i++) {
        const startSec = thumbIndex * INTERVAL;
        const endSec = Math.min((thumbIndex + 1) * INTERVAL, duration);

        const col = i % COLS;
        const row = Math.floor(i / COLS);
        const x = col * THUMB_W;
        const y = row * thumbH;

        const fmtTime = (sec: number) => {
          const h = Math.floor(sec / 3600);
          const m = Math.floor((sec % 3600) / 60);
          const s = Math.floor(sec % 60);
          const ms = Math.round((sec % 1) * 1000);
          return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
        };

        vtt += `${fmtTime(startSec)} --> ${fmtTime(endSec)}\n`;
        vtt += `sprites/${sheetFile}#xywh=${x},${y},${THUMB_W},${thumbH}\n\n`;
        thumbIndex++;
      }
    }

    const vttPath = path.join(STREAMS_DIR, contentId, 'sprites.vtt');
    fs.writeFileSync(vttPath, vtt);

    let vttUrl = '';
    if (config.storageMode === 's3') {
      const spriteFiles = fs.readdirSync(spritesDir).filter(f => f.endsWith('.jpg'));
      for (const file of spriteFiles) {
        await uploadFileToS3(path.join(spritesDir, file), config.awsS3StreamingBucket, `${contentId}/sprites/${file}`, 'image/jpeg');
      }
      await uploadFileToS3(vttPath, config.awsS3StreamingBucket, `${contentId}/sprites.vtt`, 'text/vtt');
      vttUrl = `${config.cloudfrontDomain}/${contentId}/sprites.vtt`;
    } else {
      vttUrl = `/streams/${contentId}/sprites.vtt`;
    }

    await Content.findByIdAndUpdate(contentId, { $set: { 'streaming.spriteVttUrl': vttUrl } });
    console.log(`🎞️  Sprites: ${totalThumbs} thumbnails in ${totalSheets} sheet(s)`);
    return vttUrl;
  } catch (err) {
    console.warn('⚠️  Sprite generation failed:', (err as Error).message);
    return '';
  }
}

async function finalizeContent(contentId: string, duration: number) {
  const hlsUrl = config.storageMode === 's3'
    ? `${config.cloudfrontDomain}/${contentId}/master.m3u8`
    : `/streams/${contentId}/master.m3u8`;

  await Content.findByIdAndUpdate(contentId, {
    $set: {
      status: 'published',
      duration: Math.round(duration),
      'streaming.hlsUrl': hlsUrl,
    },
  });
  console.log(`✅ Transcode complete: ${contentId}`);
  console.log(`   HLS URL: ${hlsUrl}`);
}
