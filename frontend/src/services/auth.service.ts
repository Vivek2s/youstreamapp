import api from './api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User } from '../types';

export const authService = {
  async sendOTP(phone: string) {
    const { data } = await api.post('/auth/send-otp', { phone });
    return data;
  },

  async verifyOTP(phone: string, otp: string) {
    const { data } = await api.post('/auth/verify-otp', { phone, otp });
    if (data.success) {
      await AsyncStorage.setItem('accessToken', data.data.accessToken);
      await AsyncStorage.setItem('refreshToken', data.data.refreshToken);
      await AsyncStorage.setItem('user', JSON.stringify(data.data.user));
    }
    return data;
  },

  async getMe(): Promise<User | null> {
    try {
      const { data } = await api.get('/auth/me');
      return data.success ? data.data : null;
    } catch {
      return null;
    }
  },

  async logout() {
    await AsyncStorage.multiRemove(['accessToken', 'refreshToken', 'user']);
  },

  async isLoggedIn(): Promise<boolean> {
    const token = await AsyncStorage.getItem('accessToken');
    return !!token;
  },

  async getStoredUser(): Promise<User | null> {
    const userStr = await AsyncStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  },
};
