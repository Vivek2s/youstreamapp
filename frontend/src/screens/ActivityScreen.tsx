import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  RefreshControl,
} from 'react-native';
import { colors, spacing, borderRadius } from '../theme';
import { contentService } from '../services/content.service';

interface ActivityItem {
  _id: string;
  title: string;
  status: string;
  type: string;
  duration: number;
  updatedAt: string;
  torrent?: {
    downloadProgress: number;
    downloadSpeed: number;
    fileSize: number;
    errorMessage?: string;
  };
}

export default function ActivityScreen() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchActivity = useCallback(async () => {
    try {
      const data = await contentService.getActivity();
      setItems(data || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchActivity();
    // Poll every 3s while there are active downloads/transcodes
    pollRef.current = setInterval(fetchActivity, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchActivity]);

  const handleCancel = (contentId: string, title: string) => {
    Alert.alert(
      'Cancel Download',
      `Stop downloading "${title}" and remove it?`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              await contentService.cancelTorrent(contentId);
              setItems((prev) => prev.filter((i) => i._id !== contentId));
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to cancel');
            }
          },
        },
      ],
    );
  };

  const formatSpeed = (bytesPerSec: number) => {
    if (bytesPerSec > 1024 * 1024) return `${(bytesPerSec / 1024 / 1024).toFixed(1)} MB/s`;
    if (bytesPerSec > 1024) return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
    return `${bytesPerSec} B/s`;
  };

  const formatSize = (bytes: number) => {
    if (bytes > 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
    if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'downloading': return '#3B82F6';
      case 'transcoding': return colors.warning;
      case 'published': return colors.success;
      case 'error': return colors.error;
      default: return colors.textMuted;
    }
  };

  const renderItem = ({ item }: { item: ActivityItem }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
          <View style={[styles.badge, { backgroundColor: statusColor(item.status) }]}>
            <Text style={styles.badgeText}>
              {item.status === 'downloading' ? 'Downloading' :
               item.status === 'transcoding' ? 'Transcoding' :
               item.status === 'published' ? 'Done' :
               item.status === 'error' ? 'Error' : item.status}
            </Text>
          </View>
        </View>
        <Text style={styles.cardMeta}>
          {item.type === 'movie' ? 'Movie' : 'Series'}
          {item.torrent?.fileSize ? ` · ${formatSize(item.torrent.fileSize)}` : ''}
          {item.status === 'published' ? ` · ${timeAgo(item.updatedAt)}` : ''}
        </Text>
      </View>

      {/* Progress bar for downloading */}
      {item.status === 'downloading' && item.torrent && (
        <View style={styles.progressSection}>
          <View style={styles.progressBarOuter}>
            <View style={[styles.progressBarInner, { width: `${item.torrent.downloadProgress}%` }]} />
          </View>
          <View style={styles.progressInfo}>
            <Text style={styles.progressText}>{item.torrent.downloadProgress}%</Text>
            <Text style={styles.progressText}>
              {item.torrent.downloadSpeed > 0 ? formatSpeed(item.torrent.downloadSpeed) : 'Connecting...'}
            </Text>
          </View>
        </View>
      )}

      {/* Transcoding indicator */}
      {item.status === 'transcoding' && (
        <Text style={styles.statusHint}>Converting to HLS stream...</Text>
      )}

      {/* Error message */}
      {item.status === 'error' && item.torrent?.errorMessage && (
        <Text style={styles.errorText} numberOfLines={2}>{item.torrent.errorMessage}</Text>
      )}

      {/* Cancel button for downloading */}
      {item.status === 'downloading' && (
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={() => handleCancel(item._id, item.title)}
          activeOpacity={0.7}
        >
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  if (!loading && items.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.header}>Activity</Text>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No active downloads or recent uploads</Text>
          <Text style={styles.emptyHint}>Upload a video or torrent to see activity here</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Activity</Text>
      <FlatList
        data={items}
        keyExtractor={(item) => item._id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={fetchActivity} tintColor={colors.textMuted} />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    color: colors.text, fontSize: 22, fontWeight: '700',
    paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: spacing.md,
  },
  list: { paddingHorizontal: spacing.xl, paddingBottom: 40 },

  card: {
    backgroundColor: colors.surface, borderRadius: borderRadius.md,
    padding: spacing.lg, marginBottom: spacing.md,
  },
  cardHeader: { marginBottom: spacing.sm },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: '700', flex: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  cardMeta: { color: colors.textMuted, fontSize: 12, marginTop: 4 },

  progressSection: { marginTop: spacing.sm },
  progressBarOuter: {
    height: 4, backgroundColor: colors.surfaceLight, borderRadius: 2, overflow: 'hidden',
  },
  progressBarInner: { height: '100%', backgroundColor: '#3B82F6', borderRadius: 2 },
  progressInfo: {
    flexDirection: 'row', justifyContent: 'space-between', marginTop: 4,
  },
  progressText: { color: colors.textMuted, fontSize: 11 },

  statusHint: { color: colors.warning, fontSize: 12, marginTop: spacing.sm },
  errorText: { color: colors.error, fontSize: 12, marginTop: spacing.sm },

  cancelBtn: {
    alignSelf: 'flex-end', marginTop: spacing.sm,
    paddingHorizontal: spacing.lg, paddingVertical: 6,
    borderRadius: borderRadius.full, borderWidth: 1, borderColor: colors.error,
  },
  cancelBtnText: { color: colors.error, fontSize: 12, fontWeight: '700' },

  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xl },
  emptyText: { color: colors.textSecondary, fontSize: 16, fontWeight: '600' },
  emptyHint: { color: colors.textMuted, fontSize: 13, marginTop: spacing.sm, textAlign: 'center' },
});
