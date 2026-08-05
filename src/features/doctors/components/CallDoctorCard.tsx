import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { View } from 'react-native';

import type { AllParamList } from '@/app/navigation/types';
import { PRIMARY_DOCTORS } from '@features/doctors/api/fallbackDirectory';
import { callNumber } from '@integrations/communication/communicationAdapter';
import { Badge, Button, Card, Row, Text } from '@ui/components';
import { Icon } from '@ui/components/Icon';
import { useTheme } from '@ui/theme/ThemeProvider';

/**
 * One-tap access to a real doctor.
 *
 * Used in every stage — awareness "Talk to a doctor", the treatment dashboard,
 * and the vigilance tab — because a person in trouble should never be more than
 * one tap from a human. Every Call button opens the OS dialler with the number
 * already filled in.
 */
export function CallDoctorCard({
  title = 'Talk to a doctor',
  subtitle = 'Call now, or book a consultation.',
  urgent = false,
  compact = false,
}: {
  title?: string;
  subtitle?: string;
  urgent?: boolean;
  compact?: boolean;
}) {
  const navigation = useNavigation<NativeStackNavigationProp<AllParamList>>();
  const { theme } = useTheme();

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
              {title}
            </Text>
          </Row>
          <Text variant="body" className="mt-1">
            {subtitle}
          </Text>
        </View>
        {urgent ? <Badge label="Now" tone="danger" /> : null}
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
            <Button
              label="Call"
              size="sm"
              variant={urgent ? 'danger' : 'primary'}
              accessibilityHint={`Dials ${doctor.phone}`}
              icon={<Icon name="phone" size={15} color="#ffffff" />}
              onPress={() => void callNumber(doctor.phone)}
            />
          </Row>
        ))}
      </View>

      {!compact ? (
        <Button
          className="mt-1"
          label="Book a consultation"
          variant="secondary"
          fullWidth
          onPress={() => navigation.navigate('Doctors')}
        />
      ) : null}
    </Card>
  );
}
