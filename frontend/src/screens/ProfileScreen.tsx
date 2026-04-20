import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import Svg, { Path, Circle, Rect, Line } from 'react-native-svg';
import { colors, spacing, borderRadius } from '../theme';
import { useAuth, useAppDispatch } from '../hooks/useAuth';
import { logout } from '../store/authSlice';

function MenuIcon({ name, color = '#fff' }: { name: string; color?: string }) {
  const props = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (name) {
    case 'profiles':
      return (
        <Svg {...props}>
          <Path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
          <Circle cx="9" cy="7" r="4" />
          <Path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
        </Svg>
      );
    case 'subscription':
      return (
        <Svg {...props}>
          <Rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
          <Line x1="1" y1="10" x2="23" y2="10" />
        </Svg>
      );
    case 'downloads':
      return (
        <Svg {...props}>
          <Path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
          <Path d="M7 10l5 5 5-5" />
          <Line x1="12" y1="15" x2="12" y2="3" />
        </Svg>
      );
    case 'settings':
      return (
        <Svg {...props}>
          <Circle cx="12" cy="12" r="3" />
          <Path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
        </Svg>
      );
    case 'help':
      return (
        <Svg {...props}>
          <Circle cx="12" cy="12" r="10" />
          <Path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
          <Line x1="12" y1="17" x2="12.01" y2="17" />
        </Svg>
      );
    default:
      return null;
  }
}

export default function ProfileScreen() {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const [showManageProfiles, setShowManageProfiles] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState(user?.name || '');

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

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to delete your account? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, Delete My Account',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Final Confirmation',
              'This will permanently delete your account and all your data.',
              [
                { text: 'Go Back', style: 'cancel' },
                {
                  text: 'Delete Forever',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      const { contentService } = require('../services/content.service');
                      await contentService.deleteAccount();
                      dispatch(logout());
                    } catch (err: any) {
                      Alert.alert('Error', err.message || 'Failed to delete account');
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  const handleSaveName = async () => {
    const trimmed = editName.trim();
    if (!trimmed) {
      setEditingName(false);
      return;
    }
    try {
      const { contentService } = require('../services/content.service');
      await contentService.updateProfile({ name: trimmed });
      setEditingName(false);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update name');
    }
  };

  // Manage Profiles sub-page
  if (showManageProfiles) {
    return (
      <ScrollView style={styles.container}>
        {/* Header */}
        <TouchableOpacity style={styles.backHeader} onPress={() => setShowManageProfiles(false)} activeOpacity={0.7}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M15 18l-6-6 6-6" />
          </Svg>
          <Text style={styles.backHeaderText}>Manage Profiles</Text>
        </TouchableOpacity>

        {/* Profile card */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.name ? user.name[0].toUpperCase() : user?.phone?.slice(-2) || 'U'}
            </Text>
          </View>

          {editingName ? (
            <TextInput
              style={styles.nameInput}
              value={editName}
              onChangeText={setEditName}
              onSubmitEditing={handleSaveName}
              onBlur={handleSaveName}
              autoFocus
              returnKeyType="done"
              placeholder="Enter name"
              placeholderTextColor={colors.textMuted}
            />
          ) : (
            <TouchableOpacity onPress={() => { setEditName(user?.name || ''); setEditingName(true); }}>
              <Text style={styles.profileCardName}>{user?.name || 'User'}</Text>
              <Text style={styles.tapToEdit}>Tap to edit name</Text>
            </TouchableOpacity>
          )}

          <Text style={styles.profileCardPhone}>{user?.phone}</Text>
        </View>

        {/* Delete Account — at bottom with danger zone styling */}
        <View style={styles.dangerZone}>
          <Text style={styles.dangerTitle}>Danger Zone</Text>
          <TouchableOpacity style={styles.deleteAccountBtn} onPress={handleDeleteAccount} activeOpacity={0.8}>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.error} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
            </Svg>
            <Text style={styles.deleteAccountText}>Delete Account</Text>
          </TouchableOpacity>
          <Text style={styles.dangerHint}>This will permanently remove your account, watch history, and all data.</Text>
        </View>
      </ScrollView>
    );
  }

  const menuItems = [
    { label: 'Manage Profiles', icon: 'profiles', onPress: () => setShowManageProfiles(true) },
    { label: 'Help', icon: 'help' },
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
          <TouchableOpacity key={index} style={styles.menuItem} activeOpacity={0.7} onPress={(item as any).onPress}>
            <View style={styles.menuIconWrap}>
              <MenuIcon name={item.icon} color={(item as any).destructive ? colors.error : '#fff'} />
            </View>
            <Text style={[styles.menuLabel, (item as any).destructive && { color: colors.error }]}>{item.label}</Text>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M9 18l6-6-6-6" />
            </Svg>
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
  menuIconWrap: {
    width: 32,
    alignItems: 'center',
  },
  menuLabel: {
    color: colors.text,
    fontSize: 16,
    flex: 1,
    marginLeft: spacing.sm,
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
  // Manage Profiles sub-page
  backHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing.xxl,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  backHeaderText: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  profileCard: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    marginHorizontal: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
  },
  profileCardName: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    marginTop: spacing.md,
    textAlign: 'center',
  },
  tapToEdit: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 2,
  },
  nameInput: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    marginTop: spacing.md,
    textAlign: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.primary,
    paddingVertical: 4,
    minWidth: 150,
  },
  profileCardPhone: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: spacing.sm,
  },
  dangerZone: {
    marginTop: spacing.xxl,
    marginHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
  },
  dangerTitle: {
    color: colors.error,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },
  deleteAccountBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.error,
  },
  deleteAccountText: {
    color: colors.error,
    fontSize: 15,
    fontWeight: '600',
  },
  dangerHint: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: spacing.sm,
    lineHeight: 16,
  },
});
