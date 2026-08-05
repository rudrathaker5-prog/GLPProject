import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { AllParamList } from '@/app/navigation/types';
import { listDoctorNotes } from '@features/doctorNotes/api/doctorNotesRepository';
import { useTranslation } from '@i18n/useTranslation';
import { Badge, Button, Card, EmptyState, LoadingState, Row, Screen, Text } from '@ui/components';
import { Icon } from '@ui/components/Icon';
import { useTheme } from '@ui/theme/ThemeProvider';

type Nav = NativeStackNavigationProp<AllParamList>;

export function DoctorNotesScreen() {
  const navigation = useNavigation<Nav>();
  const { theme } = useTheme();
  const { t } = useTranslation();

  const notes = useQuery({ queryKey: ['doctorNotes'], queryFn: listDoctorNotes });

  return (
    <Screen
      title={t('treatment.doctorNotes')}
      subtitle="What your doctor wrote, explained in plain language."
      refreshing={notes.isRefetching}
      onRefresh={() => void notes.refetch()}
    >
      {notes.isLoading ? <LoadingState /> : null}

      {!notes.isLoading && (notes.data ?? []).length === 0 ? (
        <EmptyState
          title="No notes yet"
          message="After a consultation, your doctor's notes appear here — translated out of clinical shorthand so you can actually act on them."
          action={
            <Button label="Book a consultation" onPress={() => navigation.navigate('Appointments')} />
          }
        />
      ) : null}

      {(notes.data ?? []).map((note) => (
        <Card
          key={note.id}
          className="mb-3"
          onPress={() => navigation.navigate('DoctorNoteDetail', { noteId: note.id })}
        >
          <Row className="justify-between">
            <Row className="flex-1">
              <Icon name="doctor" size={18} color={theme.primary} />
              <Text variant="caption" className="ml-2">
                {new Date(note.createdAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
              </Text>
            </Row>
            {!note.acknowledgedAt ? <Badge label="New" tone="brand" /> : null}
          </Row>

          <Text variant="body" className="mt-2" numberOfLines={3}>
            {note.patientFriendlyText ?? note.clinicalText}
          </Text>

          <Row className="mt-2 justify-end">
            <Icon name="chevron" size={18} color={theme.textMuted} />
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
