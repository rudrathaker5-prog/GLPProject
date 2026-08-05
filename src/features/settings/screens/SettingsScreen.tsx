import { useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, Switch, View } from 'react-native';

import type { RootStackParamList } from '@/app/navigation/types';
import { appInfo, capabilities } from '@core/config/env';
import { useAuthStore } from '@features/auth/store/authStore';
import { listMedications } from '@features/medication/api/medicationRepository';
import {
  cancelAllReminders,
  reapplyReminders,
  requestNotificationPermission,
} from '@features/notifications/service/notificationService';
import { LanguagePicker } from '@features/settings/components/LanguagePicker';
import { useSettingsStore } from '@features/settings/store/settingsStore';
import { languageDisplayName } from '@i18n/index';
import { useTranslation } from '@i18n/useTranslation';
import { Badge, Button, Card, Chip, Row, Screen, SectionTitle, Text } from '@ui/components';
import { Icon } from '@ui/components/Icon';
import { useTheme } from '@ui/theme/ThemeProvider';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function SettingsScreen() {
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();
  const { theme } = useTheme();
  const { t, language } = useTranslation();

  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const deleteEverything = useAuthStore((s) => s.deleteEverything);

  const [languageOpen, setLanguageOpen] = useState(false);

  const toggleReminders = async (key: keyof typeof settings, value: boolean) => {
    update({ [key]: value } as Partial<typeof settings>);

    if (value) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        Alert.alert(
          'Notifications are off',
          'Reminders need notification permission. Turn it on in your phone settings for GLP Care.',
        );
        return;
      }
      const medications = await listMedications();
      await reapplyReminders(medications);
    } else if (key === 'medicationRemindersEnabled') {
      await cancelAllReminders();
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      t('settings.deleteData'),
      'This permanently erases your profile, measurements, medicines, reminders and conversations. It cannot be undone.',
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: async () => {
            await cancelAllReminders();
            await deleteEverything();
            queryClient.clear();
            navigation.reset({ index: 0, routes: [{ name: 'Awareness' }] });
          },
        },
      ],
    );
  };

  return (
    <Screen title={t('settings.title')}>
      <Card onPress={() => setLanguageOpen(true)}>
        <Row className="justify-between">
          <Row className="flex-1">
            <Icon name="globe" size={20} color={theme.primary} />
            <View className="ml-3">
              <Text variant="subheading">{t('settings.language')}</Text>
              <Text variant="caption">{languageDisplayName(language)}</Text>
            </View>
          </Row>
          <Icon name="chevron" size={18} color={theme.textMuted} />
        </Row>
      </Card>

      <SectionTitle title={t('settings.theme')} />
      <Card>
        <Row className="flex-wrap">
          <Chip
            label={t('settings.themeSystem')}
            selected={settings.theme === 'system'}
            onPress={() => setTheme('system')}
          />
          <Chip
            label={t('settings.themeLight')}
            selected={settings.theme === 'light'}
            onPress={() => setTheme('light')}
          />
          <Chip
            label={t('settings.themeDark')}
            selected={settings.theme === 'dark'}
            onPress={() => setTheme('dark')}
          />
        </Row>
      </Card>

      <SectionTitle title={t('settings.notifications')} />
      <Card>
        <Toggle
          label="Medication reminders"
          value={settings.medicationRemindersEnabled}
          onChange={(v) => void toggleReminders('medicationRemindersEnabled', v)}
        />
        <Toggle
          label="Refill reminders"
          value={settings.refillRemindersEnabled}
          onChange={(v) => void toggleReminders('refillRemindersEnabled', v)}
        />
        <Toggle
          label="Appointment reminders"
          value={settings.appointmentRemindersEnabled}
          onChange={(v) => void toggleReminders('appointmentRemindersEnabled', v)}
        />
        <Toggle
          label="Check-in reminders"
          value={settings.checkInRemindersEnabled}
          onChange={(v) => void toggleReminders('checkInRemindersEnabled', v)}
        />
        <Toggle
          label="Motivation & milestones"
          value={settings.motivationNudgesEnabled}
          onChange={(v) => update({ motivationNudgesEnabled: v })}
        />
        <Text variant="caption" className="mt-2">
          Quiet hours: {settings.quietHoursStart}–{settings.quietHoursEnd}. Reminders that fall inside
          quiet hours are delayed, never dropped.
        </Text>
        <Button
          className="mt-3"
          label="See scheduled reminders"
          variant="secondary"
          fullWidth
          onPress={() => navigation.navigate('Notifications')}
        />
      </Card>

      <SectionTitle title={t('settings.whatsapp')} />
      <Card>
        <Toggle
          label="Send updates on WhatsApp"
          value={settings.whatsappOptIn}
          onChange={(v) => update({ whatsappOptIn: v })}
        />
        <Text variant="caption" className="mt-1">
          Medication, refill, appointment and doctor-note updates can be sent to WhatsApp. Requires
          the WhatsApp Business API to be connected on the server — see docs/INTEGRATIONS.md.
        </Text>
      </Card>

      <SectionTitle title={t('settings.accessibility')} />
      <Card>
        <Toggle
          label={t('settings.largeText')}
          value={settings.largeText}
          onChange={(v) => update({ largeText: v })}
        />
        <Toggle
          label={t('settings.reduceMotion')}
          value={settings.reduceMotion}
          onChange={(v) => update({ reduceMotion: v })}
        />
      </Card>

      <SectionTitle title={t('settings.privacy')} />
      <Card>
        <Toggle
          label="Share my data with my doctor"
          value={settings.shareDataWithDoctor}
          onChange={(v) => update({ shareDataWithDoctor: v })}
        />
        <Text variant="caption" className="mt-1">
          When off, no doctor can read your measurements, check-ins or medicines — enforced in the
          database, not just the app.
        </Text>
        <Button
          className="mt-4"
          label={t('settings.deleteData')}
          variant="ghost"
          fullWidth
          onPress={confirmDelete}
        />
      </Card>

      <SectionTitle title={t('settings.about')} />
      <Card onPress={() => navigation.navigate('About')}>
        <Row className="justify-between">
          <View>
            <Text variant="subheading">{appInfo.name}</Text>
            <Text variant="caption">
              Version {appInfo.version} · {appInfo.variant}
            </Text>
          </View>
          <Icon name="chevron" size={18} color={theme.textMuted} />
        </Row>
        <Row className="mt-3 flex-wrap gap-2">
          <Badge
            label={capabilities.backend ? 'Backend connected' : 'Local only'}
            tone={capabilities.backend ? 'success' : 'warning'}
          />
          <Badge
            label={capabilities.remoteAi ? 'AI service on' : 'Offline care library'}
            tone={capabilities.remoteAi ? 'success' : 'warning'}
          />
        </Row>
      </Card>

      <LanguagePicker visible={languageOpen} onClose={() => setLanguageOpen(false)} />
    </Screen>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const { theme } = useTheme();
  return (
    <Row className="mb-4 justify-between">
      <Text variant="body" className="flex-1 pr-3">
        {label}
      </Text>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={label}
        trackColor={{ true: theme.primary, false: theme.border }}
        thumbColor="#ffffff"
      />
    </Row>
  );
}
