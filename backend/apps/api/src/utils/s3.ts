import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';
import { config } from '../config';

const s3Client = new S3Client({ region: config.awsRegion });

function getContentType(filePath: string): string {
  if (filePath.endsWith('.m3u8')) return 'application/vnd.apple.mpegurl';
  if (filePath.endsWith('.ts')) return 'video/mp2t';
  return 'application/octet-stream';
}

function getAllFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

export async function uploadDirectoryToS3(
  localDir: string,
  bucket: string,
  prefix: string
): Promise<number> {
  const files = getAllFiles(localDir);
  const BATCH_SIZE = 5;
  let uploaded = 0;

  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (filePath) => {
        const relativePath = path.relative(localDir, filePath);
        const s3Key = `${prefix}/${relativePath}`;
        await s3Client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: s3Key,
            Body: fs.createReadStream(filePath),
            ContentType: getContentType(filePath),
          })
        );
        uploaded++;
      })
    );
  }

  console.log(`☁️  Uploaded ${uploaded} files to s3://${bucket}/${prefix}/`);
  return uploaded;
}

export async function uploadFileToS3(
  localPath: string,
  bucket: string,
  s3Key: string,
  contentType: string
): Promise<string> {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: s3Key,
      Body: fs.createReadStream(localPath),
      ContentType: contentType,
    })
  );
  console.log(`☁️  Uploaded file to s3://${bucket}/${s3Key}`);
  return s3Key;
}

export function deleteLocalDirectory(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
