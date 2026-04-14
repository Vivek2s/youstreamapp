import React from 'react';
import { View, Image, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, cardSize, borderRadius, spacing } from '../theme';
import { Content } from '../types';

interface Props {
  item: Content;
  onPress: (item: Content) => void;
  size?: 'poster' | 'backdrop';
}

export default function ContentCard({ item, onPress, size = 'poster' }: Props) {
  const dimensions = size === 'poster' ? cardSize.poster : cardSize.backdrop;

  return (
    <TouchableOpacity
      style={[styles.container, { width: dimensions.width, height: dimensions.height }]}
      onPress={() => onPress(item)}
      activeOpacity={0.7}
    >
      <Image
        source={{ uri: item.posterUrl || 'https://picsum.photos/300/450' }}
        style={[styles.image, { width: dimensions.width, height: dimensions.height }]}
        resizeMode="cover"
      />
      {size === 'backdrop' && (
        <View style={styles.overlay}>
          <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    marginRight: spacing.sm,
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  image: {
    borderRadius: borderRadius.sm,
  },
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  title: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
});
