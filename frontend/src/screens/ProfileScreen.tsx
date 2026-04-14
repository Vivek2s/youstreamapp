import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { colors, spacing, borderRadius } from '../theme';
import { useAuth, useAppDispatch } from '../hooks/useAuth';
import { logout } from '../store/authSlice';

export default function ProfileScreen() {
  const { user } = useAuth();
  const dispatch = useAppDispatch();

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: () => dispatch(logout()),
      },
    ]);
  };

  const menuItems = [
    { label: 'Manage Profiles', icon: '👤' },
    { label: 'Subscription', icon: '💳' },
    { label: 'Downloads', icon: '⬇' },
    { label: 'App Settings', icon: '⚙' },
    { label: 'Help', icon: '❓' },
  ];

  return (
    <View style={styles.container}>
      {/* Profile avatar */}
      <View style={styles.avatarSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {user?.name ? user.name[0].toUpperCase() : user?.phone?.slice(-2) || 'U'}
          </Text>
        </View>
        <Text style={styles.name}>{user?.name || 'User'}</Text>
        <Text style={styles.phone}>{user?.phone}</Text>
      </View>

      {/* Menu items */}
      <View style={styles.menu}>
        {menuItems.map((item, index) => (
          <TouchableOpacity key={index} style={styles.menuItem} activeOpacity={0.7}>
            <Text style={styles.menuIcon}>{item.icon}</Text>
            <Text style={styles.menuLabel}>{item.label}</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Logout */}
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.8}>
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>

      <Text style={styles.version}>YouStream v1.0.0</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  avatarSection: {
    alignItems: 'center',
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xl,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 8,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
  },
  name: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
    marginTop: spacing.md,
  },
  phone: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: spacing.xs,
  },
  menu: {
    marginTop: spacing.md,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  menuIcon: {
    fontSize: 20,
    width: 32,
  },
  menuLabel: {
    color: colors.text,
    fontSize: 16,
    flex: 1,
  },
  chevron: {
    color: colors.textMuted,
    fontSize: 22,
  },
  logoutButton: {
    marginTop: spacing.xxl,
    marginHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.textMuted,
    alignItems: 'center',
  },
  logoutText: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: '600',
  },
  version: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
