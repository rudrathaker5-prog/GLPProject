import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Alert, Image, View } from 'react-native';

import type { RootStackParamList } from '@/app/navigation/types';
import { supabase } from '@core/supabase/client';
import { useAuthStore } from '@features/auth/store/authStore';
import {
  createPrescription,
  listPrescriptions,
} from '@features/medication/api/medicationRepository';
import { useTranslation } from '@i18n/useTranslation';
import { Badge, Button, Card, Field, Input, Row, Screen, SectionTitle, Text } from '@ui/components';
import { Icon } from '@ui/components/Icon';
import { useTheme } from '@ui/theme/ThemeProvider';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface ExtractionResponse {
  degraded?: boolean;
  reason?: string;
  message?: string;
  confidence?: number;
  medications?: { name: string; strength?: string; frequency?: string }[];
}

/**
 * Prescription capture.
 *
 * The image (or typed text) goes to the `prescription-extract` edge function,
 * which returns structured medicines and creates the reminder schedule via a
 * database trigger. When the AI service is unavailable the screen routes to
 * manual entry rather than failing — the reminders are the point, not the OCR.
 */
export function PrescriptionUploadScreen() {
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const ensureIdentity = useAuthStore((s) => s.ensureIdentity);

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [rawText, setRawText] = useState('');
  const [doctorName, setDoctorName] = useState('');

  const prescriptions = useQuery({ queryKey: ['prescriptions'], queryFn: listPrescriptions });

  const pick = async (source: 'camera' | 'library') => {
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        'Permission needed',
        source === 'camera'
          ? 'Allow camera access to photograph your prescription.'
          : 'Allow photo access to attach a prescription.',
      );
      return;
    }

    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: true })
        : await ImagePicker.launchImageLibraryAsync({
            quality: 0.7,
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
          });

    if (!result.canceled && result.assets[0]) setImageUri(result.assets[0].uri);
  };

  const extract = useMutation({
    mutationFn: async (): Promise<ExtractionResponse> => {
      const identity = await ensureIdentity();

      // Store the record first so a failed extraction still leaves a trail.
      const prescription = await createPrescription({
        doctorName: doctorName.trim() || null,
        rawText: rawText.trim() || null,
      });

      if (!supabase || !identity) {
        return {
          degraded: true,
          reason:
            'No backend configured, so automatic reading is off. Add the medicines by hand — reminders work exactly the same.',
        };
      }

      let imageUrl: string | null = null;
      let imageBase64: string | null = null;

      if (imageUri) {
        const path = `${identity}/${prescription.id}.jpg`;
        const bytes = await FileSystem.readAsStringAsync(imageUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        imageBase64 = bytes;

        const { error } = await supabase.storage
          .from('prescriptions')
          .upload(path, decodeBase64(bytes), { contentType: 'image/jpeg', upsert: true });
        if (!error) imageUrl = path;
      }

      const { data, error } = await supabase.functions.invoke<ExtractionResponse>(
        'prescription-extract',
        {
          body: {
            prescriptionId: prescription.id,
            imageBase64,
            imageUrl,
            rawText: rawText.trim() || null,
          },
        },
      );

      if (error) return { degraded: true, reason: error.message };
      return data ?? { degraded: true, reason: 'Empty response' };
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['medications'] });
      void queryClient.invalidateQueries({ queryKey: ['prescriptions'] });
      void queryClient.invalidateQueries({ queryKey: ['doses'] });

      if (result.degraded || !result.medications?.length) {
        Alert.alert(
          'Add the medicines manually',
          result.reason ??
            result.message ??
            'I could not read that clearly. Adding them by hand takes a minute and the reminders work the same.',
          [
            { text: 'Later', style: 'cancel' },
            { text: 'Add now', onPress: () => navigation.navigate('AddMedication', {}) },
          ],
        );
        return;
      }

      Alert.alert(
        'Prescription read',
        `${result.medications.length} medicine${
          result.medications.length === 1 ? '' : 's'
        } added with reminders:\n\n${result.medications
          .map((m) => `• ${m.name} ${m.strength ?? ''}`.trim())
          .join('\n')}\n\nPlease check them against the paper before relying on the schedule.`,
        [{ text: 'Review', onPress: () => navigation.navigate('Medication') }],
      );
    },
    onError: (error) =>
      Alert.alert(
        'Could not process',
        error instanceof Error ? error.message : 'Please try again.',
      ),
  });

  return (
    <Screen
      title={t('treatment.prescription')}
      subtitle="Photograph it, or type what it says. Medicines and reminders are created for you."
    >
      <Card>
        {imageUri ? (
          <View className="mb-3">
            <Image
              source={{ uri: imageUri }}
              style={{ width: '100%', height: 220, borderRadius: 16 }}
              resizeMode="cover"
              accessibilityLabel="Prescription photo"
            />
            <Button
              className="mt-2"
              label="Remove photo"
              variant="ghost"
              size="sm"
              onPress={() => setImageUri(null)}
            />
          </View>
        ) : (
          <View className="mb-3 items-center rounded-2xl border border-dashed border-slate-300 py-8 dark:border-slate-600">
            <Icon name="camera" size={28} color={theme.textMuted} />
            <Text variant="caption" className="mt-2">
              No photo attached
            </Text>
          </View>
        )}

        <Row className="gap-2">
          <View className="flex-1">
            <Button label="Take photo" fullWidth onPress={() => void pick('camera')} />
          </View>
          <View className="flex-1">
            <Button
              label="Choose photo"
              variant="secondary"
              fullWidth
              onPress={() => void pick('library')}
            />
          </View>
        </Row>
      </Card>

      <Card className="mt-3">
        <Field label="Doctor's name" hint="Optional.">
          <Input value={doctorName} onChangeText={setDoctorName} placeholder="Dr." autoCapitalize="words" />
        </Field>
        <Field
          label="Or type what the prescription says"
          hint="Useful if the handwriting is hard to read. Indian shorthand like OD, BD, TDS is understood."
        >
          <Input
            value={rawText}
            onChangeText={setRawText}
            placeholder={'e.g. Tab Metformin 500mg BD x 30 days\nInj Semaglutide 0.25mg weekly, Sunday'}
            multiline
          />
        </Field>
      </Card>

      <Button
        className="mt-6"
        label="Read prescription and set reminders"
        fullWidth
        size="lg"
        disabled={!imageUri && !rawText.trim()}
        loading={extract.isPending}
        onPress={() => extract.mutate()}
      />

      <Button
        className="mt-2"
        label="Add medicines manually instead"
        variant="ghost"
        fullWidth
        onPress={() => navigation.navigate('AddMedication', {})}
      />

      <Text variant="caption" className="mt-3 text-center">
        Always check the extracted schedule against the paper prescription. Automatic reading is an
        aid, not a substitute.
      </Text>

      {(prescriptions.data ?? []).length > 0 ? (
        <>
          <SectionTitle title="Uploaded prescriptions" />
          {(prescriptions.data ?? []).map((prescription) => (
            <Card key={prescription.id} className="mb-2">
              <Row className="justify-between">
                <View className="flex-1">
                  <Text variant="bodyStrong">
                    {prescription.doctorName ?? 'Prescription'}
                  </Text>
                  <Text variant="caption">
                    {new Date(prescription.issuedOn).toLocaleDateString('en-IN', {
                      dateStyle: 'medium',
                    })}
                  </Text>
                </View>
                <Badge
                  label={prescription.status}
                  tone={prescription.status === 'active' ? 'success' : 'neutral'}
                />
              </Row>
              {prescription.extractionConfidence !== null ? (
                <Text variant="caption" className="mt-1">
                  Read with {Math.round((prescription.extractionConfidence ?? 0) * 100)}% confidence
                </Text>
              ) : null}
            </Card>
          ))}
        </>
      ) : null}
    </Screen>
  );
}

/** base64 -> bytes, for Supabase Storage which does not accept base64 directly. */
function decodeBase64(base64: string): Uint8Array {
  const binary = global.atob ? global.atob(base64) : Buffer.from(base64, 'base64').toString('binary');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
