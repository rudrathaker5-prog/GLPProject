import { useQuery } from '@tanstack/react-query';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { View } from 'react-native';

import type { RootStackParamList } from '@/app/navigation/types';
import { getDoctor } from '@features/doctors/api/doctorsRepository';
import { callNumber, openDirections } from '@integrations/communication/communicationAdapter';
import { Badge, Button, Card, EmptyState, LoadingState, Row, Screen, Text } from '@ui/components';
import { Icon } from '@ui/components/Icon';
import { useTheme } from '@ui/theme/ThemeProvider';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Props = RouteProp<RootStackParamList, 'DoctorDetail'>;

export function DoctorDetailScreen() {
  const route = useRoute<Props>();
  const navigation = useNavigation<Nav>();

  const query = useQuery({
    queryKey: ['doctor', route.params.doctorId],
    queryFn: () => getDoctor(route.params.doctorId),
  });

  if (query.isLoading) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  const doctor = query.data;
  if (!doctor) {
    return (
      <Screen>
        <EmptyState
          title="Doctor not found"
          message="This profile is no longer listed."
          action={<Button label="Back" onPress={() => navigation.goBack()} />}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Row className="justify-between">
        <View className="flex-1 pr-3">
          <Text variant="title">{doctor.fullName}</Text>
          <Text variant="body" className="mt-1">
            {doctor.speciality}
          </Text>
          <Text variant="caption" className="mt-1">
            {doctor.qualifications}
          </Text>
        </View>
        {doctor.rating ? <Badge label={`★ ${doctor.rating}`} tone="success" /> : null}
      </Row>

      {doctor.bio ? (
        <Card className="mt-4">
          <Text variant="body">{doctor.bio}</Text>
        </Card>
      ) : null}

      <Card className="mt-3">
        <DetailRow icon="doctor" label="Experience" value={doctor.yearsExperience ? `${doctor.yearsExperience} years` : 'Not listed'} />
        <DetailRow icon="globe" label="Speaks" value={doctor.languages.join(', ').toUpperCase()} />
        <DetailRow
          icon="calendar"
          label="Consultation fee"
          value={doctor.consultationFee ? `₹${doctor.consultationFee}` : 'Ask the clinic'}
        />
        <DetailRow
          icon="video"
          label="Video consultation"
          value={doctor.teleconsultAvailable ? 'Available' : 'In person only'}
        />
        {doctor.registrationNumber ? (
          <DetailRow icon="shield" label="Registration" value={doctor.registrationNumber} />
        ) : null}
      </Card>

      {doctor.hospital ? (
        <Card className="mt-3">
          <Text variant="label">Clinic</Text>
          <Text variant="bodyStrong" className="mt-1">
            {doctor.hospital.name}
          </Text>
          <Text variant="body" className="mt-1">
            {doctor.hospital.address}
          </Text>
          <Row className="mt-3 gap-2">
            <Button
              label="Directions"
              variant="secondary"
              size="sm"
              onPress={() => void openDirections(doctor.hospital!)}
            />
            {doctor.hospital.phone ? (
              <Button
                label="Call clinic"
                variant="ghost"
                size="sm"
                onPress={() => void callNumber(doctor.hospital!.phone)}
              />
            ) : null}
          </Row>
          <Row className="mt-3 flex-wrap gap-2">
            {doctor.hospital.hasObesityClinic ? (
              <Badge label="Obesity clinic" tone="brand" />
            ) : null}
            {doctor.hospital.hasPharmacy ? <Badge label="On-site pharmacy" tone="success" /> : null}
          </Row>
        </Card>
      ) : null}

      <View className="mt-5 gap-2">
        <Button
          label="Book in person"
          fullWidth
          size="lg"
          onPress={() =>
            navigation.navigate('BookAppointment', { doctorId: doctor.id, mode: 'in_person' })
          }
        />
        {doctor.teleconsultAvailable ? (
          <Button
            label="Book video consultation"
            variant="secondary"
            fullWidth
            onPress={() =>
              navigation.navigate('BookAppointment', { doctorId: doctor.id, mode: 'video' })
            }
          />
        ) : null}
        {doctor.phone ? (
          <Button label="Call doctor" variant="ghost" fullWidth onPress={() => void callNumber(doctor.phone)} />
        ) : null}
      </View>

      <Text variant="caption" className="mt-4 text-center">
        Bring your recent reports and a list of medicines you take.
      </Text>
    </Screen>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ComponentProps<typeof Icon>['name'];
  label: string;
  value: string;
}) {
  const { theme } = useTheme();
  return (
    <Row className="mb-3 last:mb-0">
      <Icon name={icon} size={18} color={theme.textMuted} />
      <View className="ml-3 flex-1">
        <Text variant="caption">{label}</Text>
        <Text variant="body">{value}</Text>
      </View>
    </Row>
  );
}
