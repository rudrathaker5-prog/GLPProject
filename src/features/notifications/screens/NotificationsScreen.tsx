import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Alert, View } from 'react-native';

import type { AllParamList } from '@/app/navigation/types';
import type { NotificationCategory } from '@core/domain/types';
import {
  cancelAllReminders,
  getPendingSystemNotifications,
  listScheduledReminders,
  requestNotificationPermission,
} from '@features/notifications/service/notificationService';
import { useTranslation } from '@i18n/useTranslation';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingState,
  Row,
  Screen,
  SectionTitle,
  Text,
} from '@ui/components';
import { Icon, type IconName } from '@ui/components/Icon';
import { useTheme } from '@ui/theme/ThemeProvider';

type Nav = NativeStackNavigationProp<AllParamList>;

const CATEGORY_ICON: Record<NotificationCategory, IconName> = {
  medication: 'pill',
  refill: 'refresh',
  appointment: 'calendar',
  checkin: 'heart',
  motivation: 'sparkle',
  milestone: 'trophy',
  relapse: 'warning',
  doctor_note: 'doctor',
  system: 'bell',
};

/**
 * Shows exactly what is scheduled, from the reminder store and from the OS.
 * A reminder the user cannot see is a reminder they cannot trust.
 */
export function NotificationsScreen() {
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();
  const { theme } = useTheme();
  const { t } = useTranslation();

  const reminders = useQuery({ queryKey: ['reminders'], queryFn: listScheduledReminders });
  const system = useQuery({
    queryKey: ['systemNotifications'],
    queryFn: getPendingSystemNotifications,
  });

  const clearAll = () => {
    Alert.alert(
      'Cancel every reminder?',
      'This removes all scheduled notifications. You can re-enable them per medicine afterwards.',
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: 'Cancel all',
          style: 'destructive',
          onPress: async () => {
            await cancelAllReminders();
            void queryClient.invalidateQueries({ queryKey: ['reminders'] });
            void queryClient.invalidateQueries({ queryKey: ['systemNotifications'] });
          },
        },
      ],
    );
  };

  return (
    <Screen
      title={t('settings.notifications')}
      subtitle="Everything currently scheduled on this device."
      refreshing={reminders.isRefetching}
      onRefresh={() => {
        void reminders.refetch();
        void system.refetch();
      }}
    >
      {reminders.isLoading ? <LoadingState /> : null}

      {!reminders.isLoading && (reminders.data ?? []).length === 0 ? (
        <EmptyState
          title="Nothing scheduled"
          message="Reminders are created when you add a medicine, book an appointment, or a check-in falls due."
          action={
            <View className="gap-2">
              <Button label="Add a medicine" onPress={() => navigation.navigate('AddMedication', {})} />
              <Button
                label="Allow notifications"
                variant="secondary"
                onPress={() => void requestNotificationPermission()}
              />
            </View>
          }
        />
      ) : null}

      {(reminders.data ?? []).map((reminder) => (
        <Card key={reminder.id} className="mb-3">
          <Row className="justify-between">
            <Row className="flex-1">
              <View
                className="h-10 w-10 items-center justify-center rounded-2xl"
                style={{ backgroundColor: `${theme.primary}18` }}
              >
                <Icon name={CATEGORY_ICON[reminder.category]} size={20} color={theme.primary} />
              </View>
              <View className="ml-3 flex-1">
                <Text variant="subheading">{reminder.title}</Text>
                <Text variant="caption" className="mt-0.5">
                  {reminder.body}
                </Text>
              </View>
            </Row>
          </Row>

          <Row className="mt-3 flex-wrap gap-2">
            <Badge
              label={new Date(reminder.nextFireAt).toLocaleString('en-IN', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
              tone="brand"
            />
            {reminder.repeatRule ? (
              <Badge
                label={
                  reminder.repeatRule.frequency === 'weekly'
                    ? 'Every week'
                    : reminder.repeatRule.frequency === 'daily'
                      ? 'Every day'
                      : reminder.repeatRule.frequency
                }
                tone="neutral"
              />
            ) : (
              <Badge label="Once" tone="neutral" />
            )}
            {reminder.channels.map((channel) => (
              <Badge key={channel} label={channel} tone="neutral" />
            ))}
          </Row>
        </Card>
      ))}

      <SectionTitle title="Registered with the operating system" />
      <Card>
        <Text variant="body">
          {(system.data ?? []).length} notification
          {(system.data ?? []).length === 1 ? '' : 's'} handed to Android/iOS. These fire even if the
          app is closed and the phone is offline.
        </Text>
        <Text variant="caption" className="mt-2">
          If this number is zero but reminders are listed above, notification permission is likely
          off in your phone settings.
        </Text>
        <Button
          className="mt-3"
          label="Check permission"
          variant="secondary"
          fullWidth
          onPress={async () => {
            const granted = await requestNotificationPermission();
            Alert.alert(
              granted ? 'Notifications allowed' : 'Notifications blocked',
              granted
                ? 'Reminders will be delivered.'
                : 'Open your phone settings and allow notifications for GLP Care.',
            );
          }}
        />
      </Card>

      {(reminders.data ?? []).length > 0 ? (
        <Button
          className="mt-6"
          label="Cancel all reminders"
          variant="ghost"
          fullWidth
          onPress={clearAll}
        />
      ) : null}
    </Screen>
  );
}
