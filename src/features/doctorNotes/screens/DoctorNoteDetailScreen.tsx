import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';

import type { AllParamList } from '@/app/navigation/types';
import {
  acknowledgeNote,
  getDoctorNote,
  simplifyClinicalText,
} from '@features/doctorNotes/api/doctorNotesRepository';
import { useTranslation } from '@i18n/useTranslation';
import { Badge, Button, Card, EmptyState, LoadingState, Row, Screen, Text } from '@ui/components';

type Nav = NativeStackNavigationProp<AllParamList>;
type Props = RouteProp<AllParamList, 'DoctorNoteDetail'>;

export function DoctorNoteDetailScreen() {
  const route = useRoute<Props>();
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();
  const { language } = useTranslation();
  const [showClinical, setShowClinical] = useState(false);

  const note = useQuery({
    queryKey: ['doctorNote', route.params.noteId],
    queryFn: () => getDoctorNote(route.params.noteId),
  });

  const acknowledge = useMutation({
    mutationFn: () => acknowledgeNote(route.params.noteId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['doctorNotes'] });
      void note.refetch();
    },
  });

  // Reading the note is the acknowledgement.
  useEffect(() => {
    if (note.data && !note.data.acknowledgedAt && !acknowledge.isPending) {
      acknowledge.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.data?.id]);

  if (note.isLoading) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  const data = note.data;
  if (!data) {
    return (
      <Screen>
        <EmptyState
          title="Note not found"
          message="It may have been removed."
          action={<Button label="Back" onPress={() => navigation.goBack()} />}
        />
      </Screen>
    );
  }

  const friendly =
    data.translatedText?.[language] ??
    data.patientFriendlyText ??
    simplifyClinicalText(data.clinicalText);

  return (
    <Screen>
      <Row className="justify-between">
        <Text variant="caption">
          {new Date(data.createdAt).toLocaleString('en-IN', {
            dateStyle: 'full',
            timeStyle: 'short',
          })}
        </Text>
        <Badge label="From your doctor" tone="brand" />
      </Row>

      <Card className="mt-4">
        <Text variant="label">What this means for you</Text>
        <Text variant="body" className="mt-2">
          {friendly}
        </Text>
      </Card>

      <Button
        className="mt-3"
        label={showClinical ? 'Hide the original note' : 'Show the original clinical note'}
        variant="ghost"
        fullWidth
        onPress={() => setShowClinical((v) => !v)}
      />

      {showClinical ? (
        <Card className="mt-1 bg-surface-sunken dark:bg-dark-surface-sunken">
          <Text variant="caption" className="mb-1">
            As written by your doctor
          </Text>
          <Text variant="body" selectable>
            {data.clinicalText}
          </Text>
        </Card>
      ) : null}

      <Card className="mt-4">
        <Text variant="label">Not sure about something?</Text>
        <Text variant="body" className="mt-1">
          Ask the coach to explain any part of this. For anything about changing a dose, ask your
          doctor directly — that decision is theirs.
        </Text>
        <Button
          className="mt-3"
          label="Ask about this note"
          onPress={() =>
            navigation.navigate('Chat', {
              initialPrompt: `My doctor wrote: "${data.clinicalText}". Can you explain what this means for me day to day?`,
            })
          }
        />
      </Card>
    </Screen>
  );
}
