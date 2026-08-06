import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { View } from 'react-native';

import type { AllParamList } from '@/app/navigation/types';
import type { CallReason } from '@features/calls/api/callService';
import { CallButton } from '@features/calls/components/CallButton';
import { PRIMARY_DOCTORS } from '@features/doctors/api/fallbackDirectory';
import { useTranslation } from '@i18n/useTranslation';
import { Badge, Button, Card, Row, Text } from '@ui/components';
import { Icon } from '@ui/components/Icon';
import { useTheme } from '@ui/theme/ThemeProvider';

/**
 * One-tap access to a real doctor.
 *
 * Used in every stage — awareness "Talk to a doctor", the treatment dashboard,
 * the side-effect screen and the vigilance tab — because a person in trouble
 * should never be more than one tap from a human.
 *
 * `reason` is passed through to the call log so the record says *why* the
 * patient rang. "Called Dr Sharma" is an event; "called Dr Sharma about a side
 * effect, twenty minutes after logging severe nausea" is a clinical note.
 */
export function CallDoctorCard({
  title,
  subtitle,
  urgent = false,
  compact = false,
  reason = 'routine',
}: {
  title?: string;
  subtitle?: string;
  urgent?: boolean;
  compact?: boolean;
  reason?: CallReason;
}) {
  const navigation = useNavigation<NativeStackNavigationProp<AllParamList>>();
  const { theme } = useTheme();
  const { t } = useTranslation();

  return (
    <Card className={urgent ? 'border-danger-400 bg-danger-100/40 dark:bg-rose-900/20' : undefined}>
      <Row className="justify-between">
        <View className="flex-1 pr-2">
          <Row>
            <Icon
              name={urgent ? 'warning' : 'phone'}
              size={18}
              color={urgent ? theme.danger : theme.primary}
            />
            <Text variant="subheading" className="ml-2">
              {title ?? t('callCard.title')}
            </Text>
          </Row>
          <Text variant="body" className="mt-1">
            {subtitle ?? t('callCard.subtitle')}
          </Text>
        </View>
        {urgent ? <Badge label={t('callCard.now')} tone="danger" /> : null}
      </Row>

      <View className="mt-3">
        {PRIMARY_DOCTORS.map((doctor) => (
          <Row key={doctor.id} className="mb-2 justify-between">
            <View className="flex-1 pr-3">
              <Text variant="bodyStrong">{doctor.fullName}</Text>
              <Text variant="caption" className="mt-0.5">
                {compact ? doctor.phone : `${doctor.speciality} · ${doctor.phone}`}
              </Text>
            </View>
            <CallButton
              number={doctor.phone}
              contactName={doctor.fullName}
              kind="doctor"
              /*
                The caller's reason wins. `urgent` used to overwrite it with
                'red_flag', which fired precisely when the specific reason was
                most informative: the side-effect screen passes
                urgent={flagged} reason="side_effect", the maintenance screen
                passes urgent={crossed} reason="relapse". Overwriting both meant
                lastCallFor('side_effect') could never find the call the app
                itself prompted. Only an unspecified reason falls back.
              */
              reason={reason === 'routine' && urgent ? 'red_flag' : reason}
              label={t('callCard.call')}
              variant={urgent ? 'danger' : 'primary'}
            />
          </Row>
        ))}
      </View>

      {!compact ? (
        <Button
          className="mt-1"
          label={t('callCard.book')}
          variant="secondary"
          fullWidth
          onPress={() => navigation.navigate('Doctors')}
        />
      ) : null}
    </Card>
  );
}
