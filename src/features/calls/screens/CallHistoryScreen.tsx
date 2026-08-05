import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import {
  callKindLabel,
  callReasonLabel,
  listCallLog,
  noteCallOutcome,
  type CallLogEntry,
} from '@features/calls/api/callService';
import { CallButton } from '@features/calls/components/CallButton';
import { EmergencyCallCard } from '@features/calls/components/EmergencyCallCard';
import { useTranslation } from '@i18n/useTranslation';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Row,
  Screen,
  SectionTitle,
  Text,
} from '@ui/components';

/**
 * Every call the app placed, and what came of it.
 *
 * This exists because "did you speak to your doctor about the nausea?" is a
 * question the coach, the doctor and the patient all ask, and until now nobody
 * had the answer written down. Adding a note after the call turns a dialled
 * number into a clinical fact.
 *
 * It records calls this app started. It is not the phone's call log — reading
 * that needs a permission this app does not ask for, and the screen says so
 * rather than letting the absence look like a bug.
 */
export function CallHistoryScreen() {
  const { t } = useTranslation();
  const calls = useQuery({ queryKey: ['callLog'], queryFn: () => listCallLog(100) });

  return (
    <Screen
      title={t('calls.title')}
      refreshing={calls.isRefetching}
      onRefresh={() => void calls.refetch()}
    >
      <EmergencyCallCard />

      <SectionTitle title={t('calls.recent')} />

      {calls.isLoading ? null : (calls.data ?? []).length === 0 ? (
        <EmptyState
          title={t('calls.emptyTitle')}
          message={t('calls.emptyBody')}
        />
      ) : (
        (calls.data ?? []).map((call) => <CallRow key={call.id} call={call} />)
      )}

      <Text variant="caption" className="mt-6">
        {t('calls.disclaimer')}
      </Text>
    </Screen>
  );
}

function CallRow({ call }: { call: CallLogEntry }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(call.outcomeNote ?? '');

  const save = useMutation({
    mutationFn: () => noteCallOutcome(call.id, note),
    onSuccess: () => {
      setEditing(false);
      void queryClient.invalidateQueries({ queryKey: ['callLog'] });
    },
  });

  const when = new Date(call.placedAt).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <Card className="mb-3">
      <Row className="justify-between">
        <View className="flex-1 pr-2">
          <Text variant="subheading">{call.contactName ?? call.number}</Text>
          <Text variant="caption" className="mt-0.5">
            {when} · {call.number}
          </Text>
        </View>
        <CallButton
          number={call.number}
          contactName={call.contactName}
          kind={call.kind}
          reason={call.reason}
          label={t('calls.callAgain')}
        />
      </Row>

      <Row className="mt-2 flex-wrap gap-2">
        <Badge label={callKindLabel(call.kind)} tone="brand" />
        {call.reason !== 'unknown' ? (
          <Badge label={callReasonLabel(call.reason)} tone="neutral" />
        ) : null}
        {/* An honest label: we know the dialler opened, not that anyone answered. */}
        {call.dialled ? null : <Badge label={t('calls.notDialled')} tone="warning" />}
      </Row>

      {editing ? (
        <View className="mt-3">
          <Input
            value={note}
            onChangeText={setNote}
            placeholder={t('calls.notePlaceholder')}
            multiline
            accessibilityLabel={t('calls.noteLabel')}
          />
          <Row className="mt-2 gap-2">
            <Button
              label={t('common.save')}
              size="sm"
              loading={save.isPending}
              onPress={() => save.mutate()}
            />
            <Button
              label={t('common.cancel')}
              size="sm"
              variant="ghost"
              onPress={() => {
                setNote(call.outcomeNote ?? '');
                setEditing(false);
              }}
            />
          </Row>
        </View>
      ) : call.outcomeNote ? (
        <View className="mt-3">
          <Text variant="label">{t('calls.outcome')}</Text>
          <Text variant="body" className="mt-0.5">
            {call.outcomeNote}
          </Text>
          <Button
            className="mt-2 self-start"
            label={t('common.edit')}
            size="sm"
            variant="ghost"
            onPress={() => setEditing(true)}
          />
        </View>
      ) : (
        <Button
          className="mt-3 self-start"
          label={t('calls.addNote')}
          size="sm"
          variant="secondary"
          onPress={() => setEditing(true)}
        />
      )}
    </Card>
  );
}
