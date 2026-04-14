import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, cardSize, borderRadius } from '../theme';
import { Content } from '../types';

interface Props {
  content: Content;
  onPlay: () => void;
  onInfo: () => void;
}

export default function HeroBanner({ content, onPlay, onInfo }: Props) {
  return (
    <View style={styles.container}>
      <Image
        source={{ uri: content.backdropUrl || content.posterUrl }}
        style={styles.image}
        resizeMode="cover"
      />
      <View style={styles.gradient} />
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={2}>{content.title}</Text>
        <Text style={styles.meta}>
          {content.releaseYear} • {content.rating} • {content.type === 'movie' ? `${content.duration} min` : 'Series'}
        </Text>
        <Text style={styles.description} numberOfLines={2}>{content.description}</Text>
        <View style={styles.buttons}>
          <TouchableOpacity style={styles.playButton} onPress={onPlay} activeOpacity={0.8}>
            <Text style={styles.playText}>▶ Play</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.infoButton} onPress={onInfo} activeOpacity={0.8}>
            <Text style={styles.infoText}>ⓘ More Info</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: cardSize.hero.width,
    height: cardSize.hero.height,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  gradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '60%',
    backgroundColor: 'transparent',
    // Simulated gradient with overlapping layers
  },
  content: {
    position: 'absolute',
    bottom: spacing.xl,
    left: spacing.lg,
    right: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  meta: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: spacing.xs,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  description: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: spacing.sm,
    lineHeight: 18,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  buttons: {
    flexDirection: 'row',
    marginTop: spacing.md,
    gap: spacing.md,
  },
  playButton: {
    backgroundColor: colors.text,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  playText: {
    color: colors.background,
    fontSize: 15,
    fontWeight: '700',
  },
  infoButton: {
    backgroundColor: 'rgba(109,109,110,0.7)',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  infoText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
});
