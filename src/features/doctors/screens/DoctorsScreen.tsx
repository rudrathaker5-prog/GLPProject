import { useQuery } from '@tanstack/react-query';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { View } from 'react-native';

import type { AllParamList } from '@/app/navigation/types';
import { INDIAN_CITIES, listDoctors } from '@features/doctors/api/doctorsRepository';
import { callNumber } from '@integrations/communication/communicationAdapter';
import { useTranslation } from '@i18n/useTranslation';
import {
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Row,
  Screen,
  Text,
} from '@ui/components';
import { Icon } from '@ui/components/Icon';
import { useTheme } from '@ui/theme/ThemeProvider';

type Nav = NativeStackNavigationProp<AllParamList>;
type Props = RouteProp<AllParamList, 'Doctors'>;

export function DoctorsScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Props>();
  const { theme } = useTheme();
  const { t, language } = useTranslation();

  const [city, setCity] = useState<string | undefined>();
  const [search, setSearch] = useState('');
  const [teleconsultOnly, setTeleconsultOnly] = useState(false);
  const [sameLanguage, setSameLanguage] = useState(false);

  const query = useQuery({
    queryKey: ['doctors', city, search, teleconsultOnly, sameLanguage, language],
    queryFn: () =>
      listDoctors({
        city,
        search: search.trim() || undefined,
        teleconsultOnly,
        language: sameLanguage ? language : undefined,
      }),
  });

  return (
    <Screen
      title={t('awareness.talkToDoctor')}
      subtitle={
        route.params?.reason ??
        'Doctors who run obesity and metabolic clinics. Only a doctor can prescribe.'
      }
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
    >
      <Input
        value={search}
        onChangeText={setSearch}
        placeholder="Search by name"
        autoCapitalize="words"
      />

      <View className="mt-3 flex-row flex-wrap">
        <Chip label="All cities" selected={!city} onPress={() => setCity(undefined)} />
        {INDIAN_CITIES.map((name) => (
          <Chip
            key={name}
            label={name}
            selected={city === name}
            onPress={() => setCity(city === name ? undefined : name)}
          />
        ))}
      </View>

      <View className="mt-1 flex-row flex-wrap">
        <Chip
          label="Video consultation"
          selected={teleconsultOnly}
          onPress={() => setTeleconsultOnly((v) => !v)}
        />
        <Chip
          label={`Speaks my language`}
          selected={sameLanguage}
          onPress={() => setSameLanguage((v) => !v)}
        />
      </View>

      {query.isLoading ? <LoadingState label="Finding doctors…" /> : null}

      {query.isError ? (
        <ErrorState message="Could not load the directory." onRetry={() => void query.refetch()} />
      ) : null}

      {query.data?.offline ? (
        <View className="mt-4 rounded-2xl bg-warn-100 px-3 py-2 dark:bg-amber-900/30">
          <Text variant="caption" className="text-warn-600 dark:text-amber-200">
            Showing the bundled directory. Connect the backend for live availability and booking.
          </Text>
        </View>
      ) : null}

      <View className="mt-4">
        {query.data?.doctors.map((doctor) => (
          <Card key={doctor.id} className="mb-3">
            <Row className="justify-between">
              <View className="flex-1 pr-2">
                <Text variant="subheading">{doctor.fullName}</Text>
                <Text variant="caption" className="mt-0.5">
                  {doctor.qualifications}
                </Text>
              </View>
              {doctor.rating ? (
                <Badge label={`★ ${doctor.rating}`} tone="success" />
              ) : null}
            </Row>

            <Row className="mt-2 flex-wrap gap-x-3">
              <Text variant="caption">{doctor.speciality}</Text>
              <Text variant="caption">{doctor.city}</Text>
              {doctor.yearsExperience ? (
                <Text variant="caption">{doctor.yearsExperience} yrs</Text>
              ) : null}
              {doctor.consultationFee ? (
                <Text variant="caption">₹{doctor.consultationFee}</Text>
              ) : null}
            </Row>

            {doctor.hospital ? (
              <Row className="mt-2">
                <Icon name="map" size={14} color={theme.textMuted} />
                <Text variant="caption" className="ml-1.5 flex-1">
                  {doctor.hospital.name}
                </Text>
              </Row>
            ) : null}

            <Row className="mt-1">
              <Icon name="globe" size={14} color={theme.textMuted} />
              <Text variant="caption" className="ml-1.5">
                {doctor.languages.join(', ').toUpperCase()}
              </Text>
            </Row>

            <Row className="mt-3 gap-2">
              <View className="flex-1">
                <Button
                  label="Book"
                  fullWidth
                  onPress={() => navigation.navigate('BookAppointment', { doctorId: doctor.id })}
                />
              </View>
              <View className="flex-1">
                <Button
                  label="Details"
                  variant="secondary"
                  fullWidth
                  onPress={() => navigation.navigate('DoctorDetail', { doctorId: doctor.id })}
                />
              </View>
              {doctor.phone ? (
                <Button
                  label="Call"
                  variant="ghost"
                  onPress={() => void callNumber(doctor.phone)}
                />
              ) : null}
            </Row>
          </Card>
        ))}

        {query.data && query.data.doctors.length === 0 ? (
          <EmptyState
            title="No doctors matched"
            message="Try clearing the filters, or ask the coach which kind of specialist fits your situation."
            action={
              <Button
                label="Ask the coach"
                onPress={() =>
                  navigation.navigate('Chat', {
                    initialPrompt: 'What kind of doctor should I see about my weight?',
                  })
                }
              />
            }
          />
        ) : null}
      </View>
    </Screen>
  );
}
