import AsyncStorage from '@react-native-async-storage/async-storage';
import ReactNativeBlobUtil from 'react-native-blob-util';
import api, { API_BASE_URL } from './api';

export const contentService = {
  async getHomeRows() {
    const { data } = await api.get('/content/home/rows');
    return data.data;
  },

  async getContents(params?: { type?: string; genre?: string; page?: number }) {
    const { data } = await api.get('/content', { params });
    return data.data;
  },

  async getContentById(id: string) {
    const { data } = await api.get(`/content/${id}`);
    return data.data;
  },

  async search(q: string) {
    const { data } = await api.get('/search', { params: { q } });
    return data.data;
  },

  async autocomplete(q: string) {
    const { data } = await api.get('/search/autocomplete', { params: { q } });
    return data.data;
  },

  async getStreamUrl(contentId: string) {
    const { data } = await api.get(`/streaming/${contentId}/url`);
    return data.data;
  },

  async updateProgress(profileId: string, contentId: string, progressSeconds: number, duration: number) {
    const { data } = await api.post('/streaming/progress', { profileId, contentId, progressSeconds, duration });
    return data.data;
  },

  async getProfiles() {
    const { data } = await api.get('/users/profiles');
    return data.data;
  },

  async getFavorites(profileId: string) {
    const { data } = await api.get(`/users/favorites/${profileId}`);
    return data.data;
  },

  async addFavorite(profileId: string, contentId: string) {
    const { data } = await api.post('/users/favorites', { profileId, contentId });
    return data.data;
  },

  async removeFavorite(profileId: string, contentId: string) {
    const { data } = await api.delete(`/users/favorites/${profileId}/${contentId}`);
    return data.data;
  },

  async getContinueWatching(profileId: string) {
    const { data } = await api.get(`/users/continue-watching/${profileId}`);
    return data.data;
  },

  async uploadVideo(
    file: { uri: string; name: string; type: string },
    metadata: { title: string; description?: string; type?: string; rating?: string; transcode?: boolean },
    onProgress?: (percent: number) => void,
  ) {
    const token = await AsyncStorage.getItem('accessToken');

    // Normalize URI: strip file:// prefix for react-native-blob-util
    let filePath = file.uri;
    if (filePath.startsWith('file://')) {
      filePath = filePath.replace('file://', '');
    }

    console.log('[Upload] Starting native upload, file:', filePath, file.name);

    const resp = await ReactNativeBlobUtil.fetch(
      'POST',
      `${API_BASE_URL}/upload/video`,
      {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'multipart/form-data',
      },
      [
        { name: 'video', filename: file.name, type: file.type || 'video/mp4', data: ReactNativeBlobUtil.wrap(filePath) },
        { name: 'title', data: metadata.title },
        { name: 'description', data: metadata.description || '' },
        { name: 'type', data: metadata.type || 'movie' },
        { name: 'rating', data: metadata.rating || 'U' },
        { name: 'transcode', data: metadata.transcode ? 'true' : 'false' },
      ],
    ).uploadProgress((written, total) => {
      if (onProgress) {
        onProgress(Math.round((written / total) * 100));
      }
    });

    const result = resp.json();
    console.log('[Upload] Done, status:', resp.respInfo.status);

    if (result.success) return result.data;
    throw new Error(result.error?.message || 'Upload failed');
  },

  async uploadTorrent(
    file: { uri: string; name: string; type: string },
    metadata: { title: string; description?: string; type?: string; rating?: string; transcode?: boolean },
    onProgress?: (percent: number) => void,
  ) {
    const token = await AsyncStorage.getItem('accessToken');

    let filePath = file.uri;
    if (filePath.startsWith('file://')) {
      filePath = filePath.replace('file://', '');
    }

    console.log('[Upload] Starting torrent upload, file:', filePath, file.name);

    const resp = await ReactNativeBlobUtil.fetch(
      'POST',
      `${API_BASE_URL}/upload/torrent`,
      {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'multipart/form-data',
      },
      [
        { name: 'torrent', filename: file.name, type: file.type || 'application/x-bittorrent', data: ReactNativeBlobUtil.wrap(filePath) },
        { name: 'title', data: metadata.title },
        { name: 'description', data: metadata.description || '' },
        { name: 'type', data: metadata.type || 'movie' },
        { name: 'rating', data: metadata.rating || 'U' },
        { name: 'transcode', data: metadata.transcode ? 'true' : 'false' },
      ],
    ).uploadProgress((written, total) => {
      if (onProgress) {
        onProgress(Math.round((written / total) * 100));
      }
    });

    const result = resp.json();
    console.log('[Upload] Torrent upload done, status:', resp.respInfo.status);

    if (result.success) return result.data;
    throw new Error(result.error?.message || 'Torrent upload failed');
  },

  async getTranscodeStatus(contentId: string) {
    const { data } = await api.get(`/upload/status/${contentId}`);
    return data.data;
  },

  async getGenres() {
    const { data } = await api.get('/content/genres');
    return data.data;
  },

  async cancelTorrent(contentId: string) {
    const { data } = await api.post(`/upload/torrent/${contentId}/cancel`);
    return data.data;
  },

  async getActivity() {
    const { data } = await api.get('/upload/activity');
    return data.data;
  },
};
