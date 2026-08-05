import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Alert, View } from 'react-native';

import type { RootStackParamList } from '@/app/navigation/types';
import { appInfo } from '@core/config/env';
import { useAuthStore } from '@features/auth/store/authStore';
import { getDoctor } from '@features/doctors/api/doctorsRepository';
import { listPatients } from '@features/doctorPortal/api/doctorPortalRepository';
import { Badge, Button, Card, LoadingState, Row, Screen, SectionTitle, StatTile, Text } from '@ui/components';
import { Icon } from '@ui/components/Icon';
import { useTheme } from '@ui/theme/ThemeProvider';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function DoctorProfileScreen() {
  const navigation = useNavigation<Nav>();
  const { theme } = useTheme();

  const doctorId = useAuthStore((s) => s.doctorId);
  const signOut = useAuthStore((s) => s.signOut);

  const doctor = useQuery({
    queryKey: ['doctorSelf', doctorId],
    queryFn: () => (doctorId ? getDoctor(doctorId) : Promise.resolve(null)),
    enabled: Boolean(doctorId),
  });

  const patients = useQuery({
    queryKey: ['doctorPatients'],
    queryFn: listPatients,
    enabled: Boolean(doctorId),
  });

  if (doctor.isLoading) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  const onTreatment = (patients.data ?? []).filter((p) => p.stage === 'treatment').length;
  const inVigilance = (patients.data ?? []).filter((p) => p.stage === 'vigilance').length;
  const lowAdherence = (patients.data ?? []).filter(
    (p) => p.adherence28d !== null && p.adherence28d < 80,
  ).length;

  return (
    <Screen title={doctor.data?.fullName ?? 'Doctor'} subtitle={doctor.data?.speciality}>
      <Row className="mb-4 flex-wrap gap-2">
        <Badge label="Doctor account" tone="success" />
        {doctor.data?.registrationNumber ? (
          <Badge label={doctor.data.registrationNumber} tone="neutral" />
        ) : null}
      </Row>

      <Row className="gap-2">
        <StatTile label="Patients" value={(patients.data ?? []).length} tone="brand" />
        <StatTile label="On treatment" value={onTreatment} tone="success" />
        <StatTile
          label="Adherence < 80%"
          value={lowAdherence}
          tone={lowAdherence > 0 ? 'warning' : 'neutral'}
        />
      </Row>

      {inVigilance > 0 ? (
        <Card className="mt-3">
          <Text variant="body">
            {inVigilance} patient{inVigilance === 1 ? ' is' : 's are'} in post-treatment maintenance.
            Their relapse-risk scores update automatically as they check in.
          </Text>
        </Card>
      ) : null}

      <SectionTitle title="Your listing" />
      <Card>
        <Detail label="Qualifications" value={doctor.data?.qualifications ?? '—'} />
        <Detail label="City" value={doctor.data?.city ?? '—'} />
        <Detail
          label="Languages"
          value={(doctor.data?.languages ?? []).join(', ').toUpperCase() || '—'}
        />
        <Detail
          label="Consultation fee"
          value={doctor.data?.consultationFee ? `₹${doctor.data.consultationFee}` : '—'}
        />
        <Detail
          label="Video consultation"
          value={doctor.data?.teleconsultAvailable ? 'Available' : 'Not offered'}
        />
        <Text variant="caption" className="mt-2">
          Directory details and clinic hours are maintained by your hospital administrator. Ask them
          to update the `doctors` and `doctor_availability` records.
        </Text>
      </Card>

      <SectionTitle title="How patient data works" />
      <Card>
        {[
          'You see a patient only while an active care relationship exists.',
          'A patient can switch off sharing at any time, and you immediately lose read access.',
          'You can never edit a patient’s measurements, medicines or check-ins — only add notes.',
          'Every AI action taken on a patient’s behalf is written to an audit table.',
        ].map((rule) => (
          <Row key={rule} className="mb-2">
            <Icon name="shield" size={16} color={theme.primary} />
            <Text variant="body" className="ml-2 flex-1">
              {rule}
            </Text>
          </Row>
        ))}
      </Card>

      <View className="mt-6 gap-2">
        <Button label="About this app" variant="secondary" fullWidth onPress={() => navigation.navigate('About')} />
        <Button
          label="Sign out"
          variant="ghost"
          fullWidth
          onPress={() =>
            Alert.alert('Sign out', 'You will need to sign in again to see your patients.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Sign out',
                style: 'destructive',
                onPress: () => {
                  void signOut();
                  navigation.reset({ index: 0, routes: [{ name: 'Awareness' }] });
                },
              },
            ])
          }
        />
      </View>

      <Text variant="caption" className="mt-4 text-center">
        {appInfo.name} {appInfo.version}
      </Text>
    </Screen>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <Row className="mb-3 justify-between">
      <Text variant="caption">{label}</Text>
      <Text variant="body" className="flex-1 text-right">
        {value}
      </Text>
    </Row>
  );
}
