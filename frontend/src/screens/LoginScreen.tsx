import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, borderRadius } from '../theme';
import { useAppDispatch } from '../hooks/useAuth';
import { sendOTP } from '../store/authSlice';
import { AuthStackParamList } from '../types';

const isTV = Platform.isTV;
const { width: SCREEN_W } = Dimensions.get('window');

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Login'>;
};

export default function LoginScreen({ navigation }: Props) {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const dispatch = useAppDispatch();

  const handleSendOTP = async () => {
    const cleaned = phone.replace(/\s/g, '');
    if (cleaned.length < 10) {
      setError('Enter a valid phone number');
      return;
    }

    const fullPhone = cleaned.startsWith('+') ? cleaned : `+91${cleaned}`;

    setLoading(true);
    setError('');

    try {
      await dispatch(sendOTP(fullPhone)).unwrap();
      navigation.navigate('OTP', { phone: fullPhone });
    } catch (err: any) {
      console.log('[LoginScreen] OTP error:', JSON.stringify(err));
      const msg = typeof err === 'string' ? err : err?.message || 'Failed to send OTP';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const ButtonComponent = isTV ? Pressable : TouchableOpacity;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.content, isTV && styles.tvContent]}>
        {isTV && <View style={styles.tvCard}>
          <Text style={[styles.logo, isTV && styles.tvLogo]}>YouStream</Text>
          <Text style={styles.subtitle}>Sign in to start watching</Text>

          <View style={styles.inputContainer}>
            <Text style={styles.prefix}>+91</Text>
            <TextInput
              style={styles.input}
              placeholder="Mobile number"
              placeholderTextColor={colors.placeholder}
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
              maxLength={10}
              autoFocus
            />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <ButtonComponent
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSendOTP}
            disabled={loading}
            {...(!isTV && { activeOpacity: 0.8 })}
            {...(isTV && { focusable: true })}
          >
            <Text style={styles.buttonText}>{loading ? 'Sending...' : 'Get OTP'}</Text>
          </ButtonComponent>

          {/* <Text style={styles.hint}>Mock mode: OTP is always 123456</Text> */}
        </View>}

        {!isTV && <>
          <Text style={styles.logo}>YouStream</Text>
          <Text style={styles.subtitle}>Sign in to start watching</Text>

          <View style={styles.inputContainer}>
            <Text style={styles.prefix}>+91</Text>
            <TextInput
              style={styles.input}
              placeholder="Mobile number"
              placeholderTextColor={colors.placeholder}
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
              maxLength={10}
              autoFocus
            />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <ButtonComponent
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSendOTP}
            disabled={loading}
            {...(!isTV && { activeOpacity: 0.8 })}
          >
            <Text style={styles.buttonText}>{loading ? 'Sending...' : 'Get OTP'}</Text>
          </ButtonComponent>

          {/* <Text style={styles.hint}>Mock mode: OTP is always 123456</Text> */}
        </>}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
  },
  tvContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tvCard: {
    width: SCREEN_W * 0.32,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xxl,
    paddingVertical: 40,
  },
  logo: {
    fontSize: 40,
    fontWeight: '900',
    color: colors.primary,
    textAlign: 'center',
    letterSpacing: -1,
  },
  tvLogo: {
    fontSize: 36,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xxl,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBg,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
    height: 52,
  },
  prefix: {
    color: colors.textSecondary,
    fontSize: 16,
    marginRight: spacing.sm,
    fontWeight: '600',
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    height: '100%',
  },
  error: {
    color: colors.error,
    fontSize: 13,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    marginTop: spacing.xl,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  hint: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
