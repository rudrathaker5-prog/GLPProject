import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import type { AllParamList } from '@/app/navigation/types';
import { isBackendConfigured } from '@core/supabase/client';
import { useAuthStore } from '@features/auth/store/authStore';
import { migrateLocalProfileToAccount } from '@features/profile/api/profileRepository';
import { registerForPush } from '@features/notifications/service/notificationService';
import { useTranslation } from '@i18n/useTranslation';
import { Badge, Button, Card, Chip, Field, Input, Row, Screen, Text } from '@ui/components';

type Nav = NativeStackNavigationProp<AllParamList>;
type Props = RouteProp<AllParamList, 'Auth'>;

type Method = 'phone' | 'email';

export function AuthScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Props>();
  const { t } = useTranslation();

  const mode = route.params?.mode ?? 'sign_up';
  const signUpWithEmail = useAuthStore((s) => s.signUpWithEmail);
  const signInWithEmail = useAuthStore((s) => s.signInWithEmail);
  const signInWithPhone = useAuthStore((s) => s.signInWithPhone);
  const verifyOtp = useAuthStore((s) => s.verifyOtp);
  const loading = useAuthStore((s) => s.loading);
  const accountMode = useAuthStore((s) => s.mode);

  const [method, setMethod] = useState<Method>('phone');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);

  const afterAuth = async () => {
    await migrateLocalProfileToAccount();
    void registerForPush();
    navigation.goBack();
  };

  const submitEmail = async () => {
    try {
      if (mode === 'sign_in') {
        await signInWithEmail(email.trim(), password);
      } else {
        await signUpWithEmail(email.trim(), password, name.trim());
      }
      await afterAuth();
    } catch (error) {
      Alert.alert(
        'Could not sign you in',
        error instanceof Error ? error.message : 'Please check your details.',
      );
    }
  };

  const submitPhone = async () => {
    try {
      if (!otpSent) {
        await signInWithPhone(phone.trim());
        setOtpSent(true);
        Alert.alert('Code sent', `We sent a verification code to ${phone.trim()}.`);
        return;
      }
      await verifyOtp(phone.trim(), otp.trim());
      await afterAuth();
    } catch (error) {
      Alert.alert(
        'Verification failed',
        error instanceof Error ? error.message : 'Check the code and try again.',
      );
    }
  };

  if (!isBackendConfigured) {
    return (
      <Screen title="Accounts are not enabled">
        <Card>
          <Text variant="body">
            This build has no backend configured, so everything is stored on this device only. That
            is a complete, working experience — reminders, tracking, the coach and the offline
            library all work.
          </Text>
          <Text variant="body" className="mt-3">
            To sync across devices and share with a doctor, set{' '}
            <Text variant="bodyStrong">EXPO_PUBLIC_SUPABASE_URL</Text> and{' '}
            <Text variant="bodyStrong">EXPO_PUBLIC_SUPABASE_ANON_KEY</Text> and rebuild. See
            docs/INSTALLATION.md.
          </Text>
        </Card>
        <Button className="mt-4" label="Back" fullWidth onPress={() => navigation.goBack()} />
      </Screen>
    );
  }

  return (
    <Screen
      title={mode === 'sign_in' ? t('auth.signIn') : t('auth.upgradeTitle')}
      subtitle={mode === 'sign_in' ? undefined : t('auth.upgradeBody')}
    >
      {accountMode === 'guest' ? (
        <View className="mb-4">
          <Badge label="Your existing progress will be kept" tone="success" />
        </View>
      ) : null}

      <Row className="mb-4">
        <Chip label="Mobile number" selected={method === 'phone'} onPress={() => setMethod('phone')} />
        <Chip label="Email" selected={method === 'email'} onPress={() => setMethod('email')} />
      </Row>

      <Card>
        {method === 'phone' ? (
          <>
            <Field label={t('auth.phone')} hint="Indian numbers: 10 digits, or with +91.">
              <Input
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                placeholder="9876543210"
                editable={!otpSent}
              />
            </Field>
            {otpSent ? (
              <Field label={t('auth.otp')}>
                <Input
                  value={otp}
                  onChangeText={setOtp}
                  keyboardType="number-pad"
                  placeholder="6-digit code"
                  maxLength={6}
                />
              </Field>
            ) : null}
            <Button
              label={otpSent ? 'Verify and continue' : 'Send code'}
              fullWidth
              loading={loading}
              onPress={() => void submitPhone()}
            />
            {otpSent ? (
              <Button
                className="mt-2"
                label="Change number"
                variant="ghost"
                fullWidth
                onPress={() => {
                  setOtpSent(false);
                  setOtp('');
                }}
              />
            ) : null}
          </>
        ) : (
          <>
            {mode !== 'sign_in' ? (
              <Field label={t('auth.name')}>
                <Input
                  value={name}
                  onChangeText={setName}
                  placeholder="Your name"
                  autoCapitalize="words"
                />
              </Field>
            ) : null}
            <Field label={t('auth.email')}>
              <Input
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholder="you@example.com"
              />
            </Field>
            <Field label={t('auth.password')} hint="At least 8 characters.">
              <Input
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                placeholder="••••••••"
              />
            </Field>
            <Button
              label={mode === 'sign_in' ? t('auth.signIn') : t('auth.createAccount')}
              fullWidth
              loading={loading}
              onPress={() => void submitEmail()}
            />
          </>
        )}
      </Card>

      <Button
        className="mt-4"
        label={mode === 'sign_in' ? 'Create an account instead' : 'I already have an account'}
        variant="ghost"
        fullWidth
        onPress={() =>
          navigation.replace('Auth', { mode: mode === 'sign_in' ? 'sign_up' : 'sign_in' })
        }
      />

      <Card className="mt-4">
        <Text variant="label">Doctors</Text>
        <Text variant="body" className="mt-1">
          Sign in with the email your clinic registered. Your account is matched to your entry in the
          doctor directory automatically and the app switches to the clinical portal.
        </Text>
      </Card>

      <Text variant="caption" className="mt-4 text-center">
        Your health data stays private. It is only visible to a doctor you have an active
        relationship with, and only while you allow sharing in Settings.
      </Text>
    </Screen>
  );
}
