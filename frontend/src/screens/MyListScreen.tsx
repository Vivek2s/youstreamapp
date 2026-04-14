import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, borderRadius, screen } from '../theme';
import { contentService } from '../services/content.service';
import { HomeStackParamList } from '../types';
import LoadingSpinner from '../components/LoadingSpinner';

export default function MyListScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const [favorites, setFavorites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFavorites();
  }, []);

  const loadFavorites = async () => {
    try {
      const profiles = await contentService.getProfiles();
      if (profiles && profiles.length > 0) {
        const data = await contentService.getFavorites(profiles[0]._id);
        setFavorites(data || []);
      }
    } catch (err) {
      console.error('Failed to load favorites:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  const renderItem = ({ item }: { item: any }) => {
    const content = item.contentId;
    if (!content) return null;

    return (
      <TouchableOpacity
        style={styles.item}
        onPress={() => navigation.navigate('ContentDetail', { contentId: content._id })}
        activeOpacity={0.7}
      >
        <Image
          source={{ uri: content.posterUrl || 'https://picsum.photos/150/225' }}
          style={styles.poster}
        />
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>{content.title}</Text>
          <Text style={styles.meta}>{content.type} • {content.rating}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>My List</Text>
      <FlatList
        data={favorites}
        keyExtractor={(item) => item._id}
        renderItem={renderItem}
        numColumns={3}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>+</Text>
            <Text style={styles.emptyText}>Your list is empty</Text>
            <Text style={styles.emptySubtext}>
              Add movies and shows to your list to watch later
            </Text>
          </View>
        }
      />
    </View>
  );
}

const itemWidth = (screen.width - spacing.lg * 2 - spacing.sm * 2) / 3;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  list: {
    paddingHorizontal: spacing.lg,
  },
  row: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  item: {
    width: itemWidth,
  },
  poster: {
    width: itemWidth,
    height: itemWidth * 1.5,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surface,
  },
  info: {
    marginTop: spacing.xs,
  },
  title: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  meta: {
    color: colors.textMuted,
    fontSize: 10,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyIcon: {
    fontSize: 48,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  emptyText: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
  },
  emptySubtext: {
    color: colors.textMuted,
    fontSize: 14,
    marginTop: spacing.sm,
    textAlign: 'center',
    paddingHorizontal: spacing.xxl,
  },
});
