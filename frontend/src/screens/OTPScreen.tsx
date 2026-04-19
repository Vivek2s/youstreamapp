import React, { useState, useRef } from 'react';
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
import { RouteProp } from '@react-navigation/native';
import Svg, { Path } from 'react-native-svg';
import { colors, spacing, borderRadius } from '../theme';
import { useAppDispatch } from '../hooks/useAuth';
import { verifyOTP } from '../store/authSlice';
import { AuthStackParamList } from '../types';

const isTV = Platform.isTV;
const { width: SCREEN_W } = Dimensions.get('window');

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'OTP'>;
  route: RouteProp<AuthStackParamList, 'OTP'>;
};

export default function OTPScreen({ navigation, route }: Props) {
  const { phone } = route.params;
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const dispatch = useAppDispatch();
  const inputRefs = useRef<(TextInput | null)[]>([]);

  const handleChange = (text: string, index: number) => {
    const newOtp = [...otp];
    newOtp[index] = text;
    setOtp(newOtp);

    if (text && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    if (index === 5 && text) {
      const code = [...newOtp.slice(0, 5), text].join('');
      if (code.length === 6) {
        handleVerify(code);
      }
    }
  };

  const handleKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async (code?: string) => {
    const otpCode = code || otp.join('');
    if (otpCode.length !== 6) {
      setError('Enter 6-digit OTP');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await dispatch(verifyOTP({ phone, otp: otpCode })).unwrap();
    } catch (err: any) {
      const msg = typeof err === 'string' ? err : err?.message || 'Invalid OTP';
      setError(msg);
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const ButtonComponent = isTV ? Pressable : TouchableOpacity;

  const formContent = (
    <>
      {/* Back button inside card for TV */}
      {isTV && (
        <Pressable
          focusable={true}
          style={styles.tvBackBtn}
          onPress={() => navigation.goBack()}
        >
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M15 18l-6-6 6-6" />
          </Svg>
          <Text style={styles.tvBackText}>Back</Text>
        </Pressable>
      )}

      <Text style={styles.title}>Enter OTP</Text>
      <Text style={styles.subtitle}>Sent to {phone}</Text>

      <View style={styles.otpContainer}>
        {otp.map((digit, index) => (
          <TextInput
            key={index}
            ref={(ref) => { inputRefs.current[index] = ref; }}
            style={[styles.otpInput, isTV && styles.tvOtpInput, digit ? styles.otpInputFilled : null]}
            value={digit}
            onChangeText={(text) => handleChange(text, index)}
            onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, index)}
            keyboardType="number-pad"
            maxLength={1}
            selectTextOnFocus
            autoFocus={index === 0}
          />
        ))}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <ButtonComponent
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={() => handleVerify()}
        disabled={loading}
        {...(!isTV && { activeOpacity: 0.8 })}
        {...(isTV && { focusable: true })}
      >
        <Text style={styles.buttonText}>{loading ? 'Verifying...' : 'Verify'}</Text>
      </ButtonComponent>

      {/* <Text style={styles.hint}>Default OTP: 123456</Text> */}
    </>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.content, isTV && styles.tvContent]}>
        {isTV ? <View style={styles.tvCard}>{formContent}</View> : formContent}
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
    width: SCREEN_W * 0.35,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 32,
    paddingVertical: 36,
  },
  tvBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginBottom: spacing.lg,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  tvBackText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xxl,
  },
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  otpInput: {
    width: 48,
    height: 56,
    borderRadius: borderRadius.md,
    backgroundColor: colors.inputBg,
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  tvOtpInput: {
    width: 40,
    height: 48,
    fontSize: 20,
  },
  otpInputFilled: {
    borderColor: colors.primary,
  },
  error: {
    color: colors.error,
    fontSize: 13,
    marginTop: spacing.md,
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
