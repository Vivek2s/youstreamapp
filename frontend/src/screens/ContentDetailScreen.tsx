import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
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

  if (loading || !content) return <LoadingSpinner />;

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
        <Text style={styles.title}>{content.title}</Text>

        <View style={styles.metaRow}>
          <Text style={styles.metaGreen}>{content.releaseYear}</Text>
          <Text style={styles.metaBadge}>{content.rating}</Text>
          {content.type === 'movie' && (
            <Text style={styles.meta}>{content.duration} min</Text>
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
                  <TouchableOpacity key={ep.episodeNumber} style={styles.episodeRow}>
                    <View style={styles.epNum}>
                      <Text style={styles.epNumText}>{ep.episodeNumber}</Text>
                    </View>
                    <View style={styles.epInfo}>
                      <Text style={styles.epTitle}>{ep.title}</Text>
                      <Text style={styles.epDesc} numberOfLines={2}>{ep.description}</Text>
                      <Text style={styles.epDuration}>{ep.duration} min</Text>
                    </View>
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
