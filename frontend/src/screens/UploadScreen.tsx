import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { pick, isCancel } from '@react-native-documents/picker';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, borderRadius } from '../theme';
import { contentService } from '../services/content.service';
import { HomeStackParamList } from '../types';

type UploadStep = 'pick' | 'details' | 'uploading' | 'downloading' | 'transcoding' | 'done' | 'error';

export default function UploadScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();

  const [step, setStep] = useState<UploadStep>('pick');
  const [file, setFile] = useState<{ uri: string; name: string; type: string; size: number } | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [contentType, setContentType] = useState<'movie' | 'series'>('movie');
  const [rating, setRating] = useState('U');
  const [transcode, setTranscode] = useState(false);
  const [isTorrent, setIsTorrent] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadSpeed, setDownloadSpeed] = useState(0);
  const [contentId, setContentId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const pickVideo = async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'video',
        selectionLimit: 1,
      });

      if (result.didCancel) return;
      if (result.errorCode) {
        Alert.alert('Error', result.errorMessage || 'Failed to pick video');
        return;
      }

      const asset = result.assets?.[0];
      if (asset?.uri) {
        setFile({
          uri: asset.uri,
          name: asset.fileName || 'video.mp4',
          type: asset.type || 'video/mp4',
          size: asset.fileSize || 0,
        });
        setTitle(asset.fileName?.replace(/\.[^/.]+$/, '') || '');
        setStep('details');
      }
    } catch (err: any) {
      Alert.alert('Error', 'Failed to pick video');
    }
  };

  const pickTorrent = async () => {
    try {
      const [result] = await pick({
        type: ['application/x-bittorrent', 'application/octet-stream'],
        allowMultiSelection: false,
      });
      if (result?.uri) {
        setFile({
          uri: result.uri,
          name: result.name || 'file.torrent',
          type: result.type || 'application/x-bittorrent',
          size: result.size || 0,
        });
        setIsTorrent(true);
        setTitle(result.name?.replace(/\.torrent$/, '') || '');
        setStep('details');
      }
    } catch (err: any) {
      if (!isCancel(err)) {
        Alert.alert('Error', 'Failed to pick torrent file');
      }
    }
  };

  const startUpload = async () => {
    if (!file || !title.trim()) {
      Alert.alert('Missing info', 'Please add a title');
      return;
    }

    setUploadProgress(0);
    setDownloadProgress(0);
    setDownloadSpeed(0);
    setError('');

    try {
      let result: any;

      if (isTorrent) {
        setStep('uploading');
        result = await contentService.uploadTorrent(
          { uri: file.uri, name: file.name, type: file.type },
          { title: title.trim(), description: description.trim(), type: contentType, rating, transcode },
          (percent) => setUploadProgress(percent),
        );
        console.log('[Upload] Torrent upload done:', result);
        setContentId(result.contentId);
        setStep('downloading');
      } else {
        setStep('uploading');
        result = await contentService.uploadVideo(
          { uri: file.uri, name: file.name, type: file.type },
          { title: title.trim(), description: description.trim(), type: contentType, rating, transcode },
          (percent) => setUploadProgress(percent),
        );
        console.log('[Upload] Upload done:', result);
        setContentId(result.contentId);

        if (result.status === 'published') {
          setStep('done');
          return;
        }
        setStep('transcoding');
      }

      // Poll for status transitions
      pollRef.current = setInterval(async () => {
        try {
          const status = await contentService.getTranscodeStatus(result.contentId);
          console.log('[Upload] Status:', status.status);

          if (status.status === 'downloading') {
            setDownloadProgress(status.downloadProgress || 0);
            setDownloadSpeed(status.downloadSpeed || 0);
          } else if (status.status === 'transcoding') {
            setStep('transcoding');
          } else if (status.status === 'published' && status.streamReady) {
            if (pollRef.current) clearInterval(pollRef.current);
            setStep('done');
          } else if (status.status === 'error') {
            if (pollRef.current) clearInterval(pollRef.current);
            setError(status.errorMessage || 'Processing failed');
            setStep('error');
          }
        } catch {
          // ignore polling errors
        }
      }, 3000);

    } catch (err: any) {
      console.log('[Upload] Error:', err.message);
      setError(err.response?.data?.error?.message || err.message || 'Upload failed');
      setStep('error');
    }
  };

  const playContent = () => {
    if (contentId) {
      navigation.navigate('Player', { contentId, title });
    }
  };

  const reset = () => {
    setStep('pick');
    setFile(null);
    setTitle('');
    setDescription('');
    setContentType('movie');
    setRating('U');
    setTranscode(false);
    setIsTorrent(false);
    setUploadProgress(0);
    setDownloadProgress(0);
    setDownloadSpeed(0);
    setContentId(null);
    setError('');
    if (pollRef.current) clearInterval(pollRef.current);
  };

  // --- STEP: Pick Video ---
  if (step === 'pick') {
    return (
      <View style={styles.container}>
        <Text style={styles.header}>Upload</Text>
        <View style={styles.centerContent}>
          <TouchableOpacity style={styles.pickButton} onPress={pickVideo} activeOpacity={0.8}>
            <Text style={styles.pickIcon}>+</Text>
            <Text style={styles.pickText}>Select Video</Text>
            <Text style={styles.pickHint}>MP4, MKV, AVI, MOV, WebM</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.pickButton, { marginTop: spacing.lg }]} onPress={pickTorrent} activeOpacity={0.8}>
            <Text style={styles.pickIcon}>↓</Text>
            <Text style={styles.pickText}>Select Torrent</Text>
            <Text style={styles.pickHint}>.torrent file</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // --- STEP: Fill Details ---
  if (step === 'details') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.header}>Upload Video</Text>

        {/* Selected file info */}
        <View style={styles.fileInfo}>
          <Text style={styles.fileName} numberOfLines={1}>{file?.name}</Text>
          <Text style={styles.fileSize}>
            {file?.size ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : ''}
          </Text>
          <TouchableOpacity onPress={reset}>
            <Text style={styles.changeFile}>Change</Text>
          </TouchableOpacity>
        </View>

        {/* Title */}
        <Text style={styles.label}>Title *</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter title"
          placeholderTextColor={colors.placeholder}
          value={title}
          onChangeText={setTitle}
        />

        {/* Description */}
        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Enter description"
          placeholderTextColor={colors.placeholder}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={3}
        />

        {/* Type */}
        <Text style={styles.label}>Type</Text>
        <View style={styles.toggleRow}>
          {(['movie', 'series'] as const).map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.toggleBtn, contentType === t && styles.toggleActive]}
              onPress={() => setContentType(t)}
            >
              <Text style={[styles.toggleText, contentType === t && styles.toggleTextActive]}>
                {t === 'movie' ? 'Movie' : 'Series'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Rating */}
        <Text style={styles.label}>Rating</Text>
        <View style={styles.toggleRow}>
          {['U', 'U/A 13+', 'A'].map((r) => (
            <TouchableOpacity
              key={r}
              style={[styles.toggleBtn, rating === r && styles.toggleActive]}
              onPress={() => setRating(r)}
            >
              <Text style={[styles.toggleText, rating === r && styles.toggleTextActive]}>{r}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Processing toggle */}
        <Text style={styles.label}>Processing</Text>
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.toggleBtn, !transcode && styles.toggleActive]}
            onPress={() => setTranscode(false)}
          >
            <Text style={[styles.toggleText, !transcode && styles.toggleTextActive]}>
              {isTorrent ? 'Direct Serve' : 'Direct Upload'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, transcode && styles.toggleActive]}
            onPress={() => setTranscode(true)}
          >
            <Text style={[styles.toggleText, transcode && styles.toggleTextActive]}>Transcode HLS</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.transcodeHint}>
          {transcode
            ? 'Video will be converted to adaptive HLS stream (takes longer)'
            : isTorrent
              ? 'Original quality, auto-remuxed to MP4 if needed (fastest)'
              : 'Original video will be uploaded as-is (fastest)'}
        </Text>

        {/* Upload button */}
        <TouchableOpacity style={styles.uploadBtn} onPress={startUpload} activeOpacity={0.8}>
          <Text style={styles.uploadBtnText}>
            {isTorrent
              ? transcode ? 'Download & Transcode' : 'Download & Serve'
              : transcode ? 'Upload & Transcode' : 'Upload'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // --- STEP: Uploading ---
  if (step === 'uploading') {
    return (
      <View style={styles.container}>
        <Text style={styles.header}>Uploading...</Text>
        <View style={styles.centerContent}>
          <Text style={styles.progressPercent}>{uploadProgress}%</Text>
          <View style={styles.progressBarOuter}>
            <View style={[styles.progressBarInner, { width: `${uploadProgress}%` }]} />
          </View>
          <Text style={styles.statusText}>Uploading {file?.name}</Text>
        </View>
      </View>
    );
  }

  // --- STEP: Downloading (torrent) ---
  if (step === 'downloading') {
    return (
      <View style={styles.container}>
        <Text style={styles.header}>Downloading...</Text>
        <View style={styles.centerContent}>
          <Text style={styles.progressPercent}>{downloadProgress}%</Text>
          <View style={styles.progressBarOuter}>
            <View style={[styles.progressBarInner, { width: `${downloadProgress}%` }]} />
          </View>
          <Text style={styles.statusText}>Downloading torrent content</Text>
          <Text style={styles.hintText}>
            {downloadSpeed > 0
              ? `${(downloadSpeed / 1024 / 1024).toFixed(1)} MB/s`
              : 'Connecting to peers...'}
          </Text>
        </View>
      </View>
    );
  }

  // --- STEP: Transcoding ---
  if (step === 'transcoding') {
    return (
      <View style={styles.container}>
        <Text style={styles.header}>Transcoding...</Text>
        <View style={styles.centerContent}>
          <Text style={styles.transcodeIcon}>⚙</Text>
          <Text style={styles.statusText}>Converting to HLS stream</Text>
          <Text style={styles.hintText}>This may take a minute depending on file size</Text>
        </View>
      </View>
    );
  }

  // --- STEP: Done ---
  if (step === 'done') {
    return (
      <View style={styles.container}>
        <Text style={styles.header}>Ready!</Text>
        <View style={styles.centerContent}>
          <Text style={styles.doneIcon}>✓</Text>
          <Text style={styles.doneTitle}>{title}</Text>
          <Text style={styles.statusText}>Uploaded and transcoded successfully</Text>

          <TouchableOpacity style={styles.playButton} onPress={playContent} activeOpacity={0.8}>
            <Text style={styles.playButtonText}>▶  Play Now</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryBtn} onPress={reset} activeOpacity={0.8}>
            <Text style={styles.secondaryBtnText}>Upload Another</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // --- STEP: Error ---
  return (
    <View style={styles.container}>
      <Text style={styles.header}>Upload Failed</Text>
      <View style={styles.centerContent}>
        <Text style={styles.errorIcon}>!</Text>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.secondaryBtn} onPress={reset} activeOpacity={0.8}>
          <Text style={styles.secondaryBtnText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  header: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },

  // Pick step
  pickButton: {
    width: '100%',
    paddingVertical: 48,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickIcon: {
    fontSize: 48,
    color: colors.primary,
    fontWeight: '300',
  },
  pickText: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
    marginTop: spacing.md,
  },
  pickHint: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: spacing.xs,
  },

  // Details step
  fileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    marginHorizontal: spacing.xl,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  fileName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  fileSize: {
    color: colors.textMuted,
    fontSize: 12,
  },
  changeFile: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  label: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    marginLeft: spacing.xl,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.inputBg,
    color: colors.text,
    fontSize: 15,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    marginHorizontal: spacing.xl,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  toggleRow: {
    flexDirection: 'row',
    marginHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  toggleBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  toggleText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  toggleTextActive: {
    color: colors.text,
  },
  transcodeHint: {
    color: colors.textMuted,
    fontSize: 11,
    marginHorizontal: spacing.xl,
    marginTop: spacing.xs,
  },
  uploadBtn: {
    backgroundColor: colors.primary,
    marginHorizontal: spacing.xl,
    marginTop: spacing.xxl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  uploadBtnText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },

  // Uploading step
  progressPercent: {
    color: colors.text,
    fontSize: 48,
    fontWeight: '800',
  },
  progressBarOuter: {
    width: '80%',
    height: 6,
    backgroundColor: colors.surface,
    borderRadius: 3,
    marginTop: spacing.xl,
    overflow: 'hidden',
  },
  progressBarInner: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 3,
  },
  statusText: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: spacing.lg,
    textAlign: 'center',
  },
  hintText: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: spacing.sm,
  },

  // Transcoding step
  transcodeIcon: {
    fontSize: 56,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },

  // Done step
  doneIcon: {
    fontSize: 56,
    color: colors.success,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  doneTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  playButton: {
    backgroundColor: colors.text,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    marginTop: spacing.xl,
  },
  playButtonText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryBtn: {
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: colors.textMuted,
  },
  secondaryBtnText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },

  // Error step
  errorIcon: {
    fontSize: 48,
    color: colors.primary,
    fontWeight: '800',
    marginBottom: spacing.md,
  },
  errorText: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
});
