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

  async updateContent(id: string, updates: { title?: string; description?: string; rating?: string }) {
    const { data } = await api.put(`/content/${id}`, updates);
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
    metadata: { title: string; description?: string; type?: string; rating?: string; transcode?: boolean; genreIds?: string[] },
    onProgress?: (percent: number) => void,
  ) {
    const token = await AsyncStorage.getItem('accessToken');

    let filePath = file.uri;
    if (filePath.startsWith('file://')) {
      filePath = filePath.replace('file://', '');
    }

    console.log('[Upload] Starting native upload, file:', filePath, file.name);

    const fields: any[] = [
      { name: 'video', filename: file.name, type: file.type || 'video/mp4', data: ReactNativeBlobUtil.wrap(filePath) },
      { name: 'title', data: metadata.title },
      { name: 'description', data: metadata.description || '' },
      { name: 'type', data: metadata.type || 'movie' },
      { name: 'rating', data: metadata.rating || 'U' },
      { name: 'transcode', data: metadata.transcode ? 'true' : 'false' },
    ];
    if (metadata.genreIds && metadata.genreIds.length > 0) {
      fields.push({ name: 'genreIds', data: JSON.stringify(metadata.genreIds) });
    }

    const resp = await ReactNativeBlobUtil.fetch(
      'POST',
      `${API_BASE_URL}/upload/video`,
      {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'multipart/form-data',
      },
      fields,
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

  async parseTorrent(file: { uri: string; name: string; type: string }) {
    const token = await AsyncStorage.getItem('accessToken');
    let filePath = file.uri;
    if (filePath.startsWith('file://')) filePath = filePath.replace('file://', '');

    const resp = await ReactNativeBlobUtil.fetch(
      'POST',
      `${API_BASE_URL}/upload/torrent/parse`,
      { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
      [{ name: 'torrent', filename: file.name, type: file.type || 'application/x-bittorrent', data: ReactNativeBlobUtil.wrap(filePath) }],
    );
    const result = resp.json();
    if (result.success) return result.data;
    throw new Error(result.error?.message || 'Failed to parse torrent');
  },

  async parseMagnet(magnetLink: string) {
    const { data } = await api.post('/upload/torrent/parse', { magnetLink });
    return data.data;
  },

  async startSeriesDownload(torrentId: string, metadata: {
    title: string; description?: string; rating?: string; selectedFiles: number[]; transcode?: boolean;
  }) {
    const { data } = await api.post('/upload/torrent/download', {
      torrentId,
      title: metadata.title,
      description: metadata.description || '',
      rating: metadata.rating || 'U',
      selectedFiles: metadata.selectedFiles,
      transcode: metadata.transcode || false,
    });
    return data.data;
  },

  async uploadMagnet(
    magnetLink: string,
    metadata: { title: string; description?: string; type?: string; rating?: string; transcode?: boolean },
  ) {
    const { data } = await api.post('/upload/magnet', {
      magnetLink,
      title: metadata.title,
      description: metadata.description || '',
      type: metadata.type || 'movie',
      rating: metadata.rating || 'U',
      transcode: metadata.transcode || false,
    });
    return data.data;
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

  async uploadSubtitle(
    contentId: string,
    file: { uri: string; name: string; type: string },
    lang?: string,
  ) {
    const token = await AsyncStorage.getItem('accessToken');

    let filePath = file.uri;
    if (filePath.startsWith('file://')) {
      filePath = filePath.replace('file://', '');
    }

    const fields: any[] = [
      { name: 'subtitle', filename: file.name, type: file.type || 'application/x-subrip', data: ReactNativeBlobUtil.wrap(filePath) },
    ];
    if (lang) {
      fields.push({ name: 'lang', data: lang });
    }

    const resp = await ReactNativeBlobUtil.fetch(
      'POST',
      `${API_BASE_URL}/upload/subtitle/${contentId}`,
      {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'multipart/form-data',
      },
      fields,
    );

    const result = resp.json();
    if (result.success) return result.data;
    throw new Error(result.error?.message || 'Subtitle upload failed');
  },

  async deleteSubtitle(contentId: string, lang: string) {
    const { data } = await api.delete(`/upload/subtitle/${contentId}/${encodeURIComponent(lang)}`);
    return data.data;
  },

  async uploadThumbnail(contentId: string, file: { uri: string; name: string; type: string }) {
    const token = await AsyncStorage.getItem('accessToken');
    let filePath = file.uri;
    if (filePath.startsWith('file://')) filePath = filePath.replace('file://', '');

    const resp = await ReactNativeBlobUtil.fetch(
      'POST',
      `${API_BASE_URL}/upload/thumbnail/${contentId}`,
      { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
      [{ name: 'thumbnail', filename: file.name, type: file.type || 'image/jpeg', data: ReactNativeBlobUtil.wrap(filePath) }],
    );
    const result = resp.json();
    if (result.success) return result.data;
    throw new Error(result.error?.message || 'Thumbnail upload failed');
  },

  async deleteContent(contentId: string) {
    const { data } = await api.delete(`/content/${contentId}`);
    return data.data;
  },

  async clearActivity() {
    const { data } = await api.post('/upload/activity/clear');
    return data.data;
  },

  async hideActivityItem(contentId: string) {
    const { data } = await api.post(`/upload/activity/hide/${contentId}`);
    return data.data;
  },

  async updateProfile(updates: { name?: string }) {
    const { data } = await api.put('/users/profile', updates);
    return data.data;
  },

  async deleteAccount() {
    const { data } = await api.delete('/users/account');
    return data.data;
  },
};
