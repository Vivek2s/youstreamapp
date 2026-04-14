import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Switch between local dev and production API
const DEV_URL = Platform.OS === 'android' ? 'http://10.0.2.2:3000/api/v1' : 'http://127.0.0.1:3000/api/v1';
const PROD_URL = 'http://13.200.190.1:3000/api/v1';
const BASE_URL = PROD_URL;

console.log('[API] Base URL:', BASE_URL);

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
});

export const API_BASE_URL = BASE_URL;

// Add auth token + log outgoing requests
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`);
  return config;
});

// Log responses + handle 401 refresh
api.interceptors.response.use(
  (response) => {
    console.log(`[API] ${response.status} ${response.config.url}`);
    return response;
  },
  async (error) => {
    console.log('[API] Error:', error.message, error.config?.url, error.response?.status);

    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshToken = await AsyncStorage.getItem('refreshToken');
        if (refreshToken) {
          const { data } = await axios.post(`${BASE_URL}/auth/refresh-token`, { refreshToken });
          if (data.success) {
            await AsyncStorage.setItem('accessToken', data.data.accessToken);
            await AsyncStorage.setItem('refreshToken', data.data.refreshToken);
            originalRequest.headers.Authorization = `Bearer ${data.data.accessToken}`;
            return api(originalRequest);
          }
        }
      } catch {
        await AsyncStorage.multiRemove(['accessToken', 'refreshToken', 'user']);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
