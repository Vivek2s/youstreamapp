import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  Animated,
  StyleSheet,
  Dimensions,
  ScrollView,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import Svg, { Path, Polygon } from 'react-native-svg';
import { colors, spacing, borderRadius } from '../theme';
import { contentService } from '../services/content.service';
import { Content, HomeStackParamList } from '../types';
import LoadingSpinner from '../components/LoadingSpinner';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

function fmtDuration(secs: number): string {
  if (!secs || secs <= 0) return '';
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60 > 0 ? `${secs % 60}s` : ''}`.trim();
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${h}h ${m > 0 ? `${m}m` : ''}`.trim();
}

type Props = {
  navigation: NativeStackNavigationProp<HomeStackParamList, 'ContentDetail'>;
  route: RouteProp<HomeStackParamList, 'ContentDetail'>;
};

function FocusButton({ label, onPress, primary, icon, autoFocus }: { label: string; onPress: () => void; primary?: boolean; icon?: React.ReactNode; autoFocus?: boolean }) {
  const [focused, setFocused] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;

  const handleFocus = () => {
    setFocused(true);
    Animated.spring(scale, { toValue: 1.06, friction: 6, tension: 80, useNativeDriver: true }).start();
  };
  const handleBlur = () => {
    setFocused(false);
    Animated.spring(scale, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }).start();
  };

  return (
    <Animated.View style={{ transform: [{ scale }], overflow: 'visible' }}>
      <Pressable
        focusable={true}
        hasTVPreferredFocus={autoFocus}
        style={[
          primary ? styles.playBtn : styles.infoBtn,
          focused && styles.btnFocused,
        ]}
        onPress={onPress}
        onFocus={handleFocus}
        onBlur={handleBlur}
      >
        {icon && <View style={styles.btnIcon}>{icon}</View>}
        <Text style={primary ? styles.playBtnText : styles.infoBtnText}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

function EpisodeCard({ ep, onPress }: { ep: any; onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;
  const handleFocus = () => { setFocused(true); Animated.spring(scale, { toValue: 1.08, friction: 6, tension: 80, useNativeDriver: true }).start(); };
  const handleBlur = () => { setFocused(false); Animated.spring(scale, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }).start(); };

  return (
    <Animated.View style={{ transform: [{ scale }], marginRight: 12 }}>
      <Pressable
        focusable={true}
        style={[styles.epCard, focused && styles.epCardFocused]}
        onPress={onPress}
        onFocus={handleFocus}
        onBlur={handleBlur}
      >
        {ep.thumbnailUrl ? (
          <Image source={{ uri: ep.thumbnailUrl }} style={styles.epThumb} resizeMode="cover" />
        ) : (
          <View style={[styles.epThumb, styles.epThumbPlaceholder]}>
            <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800' }}>{ep.episodeNumber}</Text>
          </View>
        )}
        <View style={styles.epCardInfo}>
          <Text style={styles.epCardTitle} numberOfLines={1}>Ep {ep.episodeNumber}: {ep.title}</Text>
          <Text style={styles.epCardDuration}>{fmtDuration(ep.duration)}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function TVContentDetailScreen({ navigation, route }: Props) {
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

  const hasSubs = content.streaming?.subtitles && content.streaming.subtitles.length > 0;

  return (
    <View style={styles.container}>
      {/* Full background image */}
      <Image
        source={{ uri: content.backdropUrl || content.posterUrl || (content as any).thumbnailUrl }}
        style={styles.bgImage}
        resizeMode="cover"
        blurRadius={2}
      />
      <View style={styles.bgOverlay} />

      {/* Content — side by side layout */}
      <View style={styles.layout}>
        {/* Left side — info */}
        <ScrollView style={styles.infoSide} contentContainerStyle={styles.infoContent}>
          <Text style={styles.title} numberOfLines={3}>{content.title}</Text>

          <View style={styles.metaRow}>
            <Text style={styles.metaGreen}>{content.releaseYear}</Text>
            <Text style={styles.metaBadge}>{content.rating}</Text>
            {content.type === 'movie' && (
              <Text style={styles.meta}>{fmtDuration(content.duration)}</Text>
            )}
            <Text style={styles.meta}>{content.type === 'series' ? 'Series' : 'Movie'}</Text>
          </View>

          {/* Buttons */}
          <View style={styles.buttons}>
            <FocusButton
              label="Play"
              onPress={() => navigation.navigate('Player', { contentId: content._id, title: content.title })}
              primary
              autoFocus={true}
              icon={<Svg width={18} height={18} viewBox="0 0 24 24" fill="#000"><Polygon points="6,3 20,12 6,21" /></Svg>}
            />
            <FocusButton
              label="Back"
              onPress={() => navigation.goBack()}
              icon={<Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><Path d="M15 18l-6-6 6-6" /></Svg>}
            />
          </View>

          <Text style={styles.description} numberOfLines={5}>{content.description}</Text>

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

          {/* Subtitles info */}
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

          {/* Episodes list for series */}
          {content.type === 'series' && content.seasons && content.seasons.length > 0 && (
            <View style={styles.episodesSection}>
              {content.seasons.map((season) => (
                <View key={season.seasonNumber}>
                  <Text style={styles.seasonTitle}>{season.title || `Season ${season.seasonNumber}`}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {season.episodes.map((ep) => (
                      <EpisodeCard
                        key={ep.episodeNumber}
                        ep={ep}
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
                      />
                    ))}
                  </ScrollView>
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        {/* Right side — poster/thumbnail */}
        <View style={styles.posterSide}>
          <Image
            source={{ uri: (content as any).thumbnailUrl || content.posterUrl || content.backdropUrl }}
            style={styles.poster}
            resizeMode="cover"
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  bgImage: {
    position: 'absolute',
    width: SCREEN_W,
    height: SCREEN_H,
    opacity: 0.3,
  },
  bgOverlay: {
    position: 'absolute',
    width: SCREEN_W,
    height: SCREEN_H,
    backgroundColor: 'rgba(20,20,20,0.7)',
  },

  // Side by side layout
  layout: {
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: spacing.xxl * 2,
    paddingVertical: spacing.xxl,
    alignItems: 'center',
    overflow: 'visible',
  },

  // Left info
  infoSide: {
    flex: 1,
    marginRight: spacing.xxl,
    overflow: 'visible',
  },
  infoContent: {
    justifyContent: 'center',
    overflow: 'visible',
  },
  title: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '800',
    lineHeight: 38,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    gap: spacing.md,
  },
  metaGreen: {
    color: colors.success,
    fontSize: 16,
    fontWeight: '600',
  },
  metaBadge: {
    color: '#fff',
    fontSize: 14,
    borderWidth: 1,
    borderColor: colors.textMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  meta: {
    color: colors.textSecondary,
    fontSize: 16,
  },

  // Buttons
  buttons: {
    flexDirection: 'row',
    marginTop: spacing.xl,
    gap: spacing.md,
    overflow: 'visible',
  },
  btnIcon: {
    marginRight: spacing.sm,
  },
  playBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: spacing.xxl * 1.5,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.sm,
  },
  playBtnText: {
    color: '#000',
    fontSize: 18,
    fontWeight: '700',
  },
  infoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(109,109,110,0.7)',
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.sm,
  },
  infoBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  btnFocused: {
    opacity: 0.9,
  },

  description: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    marginTop: spacing.xl,
  },
  castText: {
    color: colors.textMuted,
    fontSize: 14,
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
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  genreText: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  subsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  subsLabel: {
    color: colors.textMuted,
    fontSize: 14,
  },
  subBadge: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  subBadgeText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },

  // Right poster
  posterSide: {
    width: SCREEN_W * 0.3,
    height: SCREEN_H * 0.7,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  poster: {
    width: '100%',
    height: '100%',
  },

  // Episodes
  episodesSection: {
    marginTop: spacing.xl,
  },
  seasonTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  epCard: {
    width: SCREEN_W * 0.15,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  epCardFocused: {
    borderColor: '#fff',
  },
  epThumb: {
    width: '100%',
    height: SCREEN_W * 0.15 * 0.56,
    borderTopLeftRadius: borderRadius.md,
    borderTopRightRadius: borderRadius.md,
  },
  epThumbPlaceholder: {
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  epCardInfo: {
    padding: spacing.sm,
  },
  epCardTitle: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  epCardDuration: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
});
