import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Image,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import Svg, { Path, Rect as SvgRect } from 'react-native-svg';
import { pick } from '@react-native-documents/picker';
import { colors, spacing, borderRadius, screen } from '../theme';
import { contentService } from '../services/content.service';
import { Content, HomeStackParamList } from '../types';
import LoadingSpinner from '../components/LoadingSpinner';

type Props = {
  navigation: NativeStackNavigationProp<HomeStackParamList, 'ContentDetail'>;
  route: RouteProp<HomeStackParamList, 'ContentDetail'>;
};

export default function ContentDetailScreen({ navigation, route }: Props) {
  const { contentId } = route.params;
  const [content, setContent] = useState<Content | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadingSub, setUploadingSub] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState('');

  useEffect(() => {
    loadContent();
  }, [contentId]);

  const loadContent = async () => {
    try {
      const data = await contentService.getContentById(contentId);
      setContent(data);
    } catch (err) {
      console.error('Failed to load content:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubtitleUpload = async () => {
    try {
      const [result] = await pick({ mode: 'open' });
      if (!result) return;

      const ext = (result.name || '').split('.').pop()?.toLowerCase();
      if (!['srt', 'vtt', 'ass', 'ssa'].includes(ext || '')) {
        Alert.alert('Invalid File', 'Please select a subtitle file (.srt, .vtt, .ass)');
        return;
      }

      setUploadingSub(true);
      const langName = (result.name || 'subtitle').replace(/\.[^.]+$/, '');
      await contentService.uploadSubtitle(
        contentId,
        { uri: result.uri, name: result.name || 'subtitle.srt', type: result.type || 'application/x-subrip' },
        langName,
      );

      // Reload content to reflect new subtitles
      const updated = await contentService.getContentById(contentId);
      setContent(updated);

      Alert.alert('Success', 'Subtitle uploaded successfully');
    } catch (err: any) {
      if (err?.message?.includes('cancel')) return;
      Alert.alert('Error', err.message || 'Failed to upload subtitle');
    } finally {
      setUploadingSub(false);
    }
  };

  const handleRename = async () => {
    const trimmed = editTitle.trim();
    if (!trimmed || trimmed === content?.title) {
      setEditingTitle(false);
      return;
    }
    try {
      await contentService.updateContent(contentId, { title: trimmed });
      setContent((prev) => prev ? { ...prev, title: trimmed } : prev);
      setEditingTitle(false);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to rename');
    }
  };

  if (loading || !content) return <LoadingSpinner />;

  const hasSubs = content.streaming?.subtitles && content.streaming.subtitles.length > 0;

  return (
    <ScrollView style={styles.container}>
      {/* Backdrop */}
      <View style={styles.backdropContainer}>
        <Image
          source={{ uri: content.backdropUrl || content.posterUrl }}
          style={styles.backdrop}
          resizeMode="cover"
        />
        <View style={styles.backdropOverlay} />
      </View>

      {/* Content info */}
      <View style={styles.content}>
        {editingTitle ? (
          <TextInput
            style={[styles.title, styles.titleInput]}
            value={editTitle}
            onChangeText={setEditTitle}
            onSubmitEditing={handleRename}
            onBlur={handleRename}
            autoFocus
            returnKeyType="done"
          />
        ) : (
          <TouchableOpacity onLongPress={() => { setEditTitle(content.title); setEditingTitle(true); }}>
            <Text style={styles.title}>{content.title}</Text>
          </TouchableOpacity>
        )}

        <View style={styles.metaRow}>
          <Text style={styles.metaGreen}>{content.releaseYear}</Text>
          <Text style={styles.metaBadge}>{content.rating}</Text>
          {content.type === 'movie' && (
            <Text style={styles.meta}>{content.duration > 0 ? (content.duration >= 3600 ? `${Math.floor(content.duration/3600)}h ${Math.floor((content.duration%3600)/60)}m` : content.duration >= 60 ? `${Math.floor(content.duration/60)}m` : `${content.duration}s`).trim() : ''}</Text>
          )}
          <Text style={styles.meta}>{content.type === 'series' ? 'Series' : 'Movie'}</Text>
        </View>

        {/* Play button */}
        <TouchableOpacity
          style={styles.playButton}
          onPress={() => navigation.navigate('Player', { contentId: content._id, title: content.title })}
          activeOpacity={0.8}
        >
          <Text style={styles.playText}>▶  Play</Text>
        </TouchableOpacity>

        {/* Upload Subtitle button */}
        <TouchableOpacity
          style={styles.subtitleButton}
          onPress={handleSubtitleUpload}
          activeOpacity={0.8}
          disabled={uploadingSub}
        >
          {uploadingSub ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <SvgRect x="2" y="4" width="20" height="16" rx="2" />
              <Path d="M7 15h4M15 15h2M7 11h2M13 11h4" />
            </Svg>
          )}
          <Text style={styles.subtitleButtonText}>
            {uploadingSub ? 'Uploading...' : hasSubs ? 'Add Subtitle' : 'Upload Subtitle'}
          </Text>
        </TouchableOpacity>

        {/* Show existing subtitles */}
        {hasSubs && (
          <View style={styles.subsRow}>
            <Text style={styles.subsLabel}>Subtitles: </Text>
            {content.streaming.subtitles.map((s, i) => (
              <View key={i} style={styles.subBadge}>
                <Text style={styles.subBadgeText}>{s.lang}</Text>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.description}>{content.description}</Text>

        {/* Cast */}
        {content.cast && content.cast.length > 0 && (
          <Text style={styles.castText}>
            <Text style={styles.castLabel}>Cast: </Text>
            {content.cast.join(', ')}
          </Text>
        )}

        {/* Genres */}
        {content.genres && content.genres.length > 0 && (
          <View style={styles.genreRow}>
            {content.genres.map((g) => (
              <View key={g._id} style={styles.genreBadge}>
                <Text style={styles.genreText}>{g.name}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Episodes (for series) */}
        {content.type === 'series' && content.seasons && content.seasons.length > 0 && (
          <View style={styles.episodesSection}>
            {content.seasons.map((season) => (
              <View key={season.seasonNumber}>
                <Text style={styles.seasonTitle}>{season.title || `Season ${season.seasonNumber}`}</Text>
                {season.episodes.map((ep) => (
                  <TouchableOpacity
                    key={ep.episodeNumber}
                    style={styles.episodeRow}
                    onPress={() => {
                      if (ep.hlsUrl) {
                        navigation.navigate('Player', {
                          contentId: content._id,
                          title: `${content.title} - ${ep.title}`,
                          episodeUrl: ep.hlsUrl,
                          episodeSubs: ep.subtitles,
                        });
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.epNum}>
                      <Text style={styles.epNumText}>{ep.episodeNumber}</Text>
                    </View>
                    <View style={styles.epInfo}>
                      <Text style={styles.epTitle}>{ep.title}</Text>
                      <Text style={styles.epDesc} numberOfLines={2}>{ep.description}</Text>
                      <Text style={styles.epDuration}>{ep.duration >= 3600 ? `${Math.floor(ep.duration/3600)}h ${Math.floor((ep.duration%3600)/60)}m` : ep.duration >= 60 ? `${Math.floor(ep.duration/60)}m` : `${ep.duration}s`}</Text>
                    </View>
                    {ep.hlsUrl ? (
                      <Text style={{ color: colors.text, fontSize: 16 }}>▶</Text>
                    ) : null}
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  backdropContainer: {
    width: screen.width,
    height: screen.width * 0.56,
    position: 'relative',
  },
  backdrop: {
    width: '100%',
    height: '100%',
  },
  backdropOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '50%',
    backgroundColor: 'rgba(20,20,20,0.7)',
  },
  content: {
    padding: spacing.lg,
    marginTop: -spacing.xl,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
  },
  titleInput: {
    borderBottomWidth: 1,
    borderBottomColor: colors.primary,
    paddingVertical: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    gap: spacing.md,
  },
  metaGreen: {
    color: colors.success,
    fontSize: 14,
    fontWeight: '600',
  },
  metaBadge: {
    color: colors.text,
    fontSize: 12,
    borderWidth: 1,
    borderColor: colors.textMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  meta: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  playButton: {
    backgroundColor: colors.text,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  playText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '700',
  },
  subtitleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    marginTop: spacing.sm,
  },
  subtitleButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  subsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  subsLabel: {
    color: colors.textMuted,
    fontSize: 13,
  },
  subBadge: {
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  subBadgeText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  description: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.lg,
  },
  castText: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: spacing.md,
  },
  castLabel: {
    color: colors.textSecondary,
  },
  genreRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  genreBadge: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  genreText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  episodesSection: {
    marginTop: spacing.xl,
  },
  seasonTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  episodeRow: {
    flexDirection: 'row',
    paddingVertical: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  epNum: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  epNumText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  epInfo: {
    flex: 1,
  },
  epTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  epDesc: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: spacing.xs,
  },
  epDuration: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: spacing.xs,
  },
});
