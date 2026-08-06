import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Alert, View } from 'react-native';

import type { AllParamList } from '@/app/navigation/types';
import type { PeerGroup } from '@core/domain/types';
import {
  COMMUNITY_GUIDELINES,
  joinGroup,
  leaveGroup,
  listGroups,
  membershipFor,
} from '@features/peer/api/peerRepository';
import { useTranslation } from '@i18n/useTranslation';
import { Badge, Button, Card, LoadingState, Row, Screen, SectionTitle, Text } from '@ui/components';
import { Icon } from '@ui/components/Icon';
import { useTheme } from '@ui/theme/ThemeProvider';

type Nav = NativeStackNavigationProp<AllParamList>;

export function PeerSupportScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();

  const groups = useQuery({ queryKey: ['peerGroups'], queryFn: listGroups });

  return (
    <Screen
      title={t('treatment.peerSupport')}
      subtitle={t('peer.subtitle')}
      refreshing={groups.isRefetching}
      onRefresh={() => void groups.refetch()}
    >
      {groups.isLoading ? <LoadingState /> : null}

      {groups.data?.offline ? (
        <View className="mb-4 rounded-2xl bg-warn-100 px-3 py-2 dark:bg-amber-900/30">
          <Text variant="caption" className="text-warn-600 dark:text-amber-200">
            {t('peer.offlineNotice')}
          </Text>
        </View>
      ) : null}

      {(groups.data?.groups ?? []).map((group) => (
        <GroupCard key={group.id} group={group} />
      ))}

      <SectionTitle title={t('peer.houseRules')} />
      <Card>
        {COMMUNITY_GUIDELINES.map((rule) => (
          <Row key={rule} className="mb-2">
            <Icon name="shield" size={16} color={theme.primary} />
            <Text variant="body" className="ml-2 flex-1">
              {rule}
            </Text>
          </Row>
        ))}
        <Text variant="caption" className="mt-2">
          {t('peer.enforcedNote')}
        </Text>
      </Card>
    </Screen>
  );
}

/**
 * One group, with an explicit Join.
 *
 * Opening a group used to join it silently as a side effect. That is the wrong
 * default for a support group: reading the room before deciding to be in it is
 * exactly what most people want to do, and an alias assigned without being
 * asked is an identity you did not choose. Joining is now a decision, and the
 * card shows which side of it you are on.
 */
function GroupCard({ group }: { group: PeerGroup }) {
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const membership = useQuery({
    queryKey: ['peerMembership', group.id],
    queryFn: () => membershipFor(group.id),
  });

  const joined = Boolean(membership.data);

  const join = useMutation({
    mutationFn: () => joinGroup(group.id),
    onSuccess: (alias) => {
      void queryClient.invalidateQueries({ queryKey: ['peerMembership', group.id] });
      // The tab shortcuts read the membership list, not this one group.
      void queryClient.invalidateQueries({ queryKey: ['peerMemberships'] });
      Alert.alert(
        t('peer.joinedTitle', { group: group.name }),
        t('peer.joinedBody', { alias }),
        [
          { text: t('common.notNow'), style: 'cancel' },
          {
            text: t('peer.openGroup'),
            onPress: () => navigation.navigate('PeerGroup', { groupId: group.id }),
          },
        ],
      );
    },
    // Membership is stored locally, so a failure here means it was not stored
    // at all. Saying nothing would show "Joined" over a group the app forgets.
    onError: () => Alert.alert(t('peer.joinFailedTitle'), t('peer.joinFailedBody')),
  });

  const leave = useMutation({
    mutationFn: () => leaveGroup(group.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['peerMembership', group.id] });
      void queryClient.invalidateQueries({ queryKey: ['peerMemberships'] });
    },
  });

  const confirmLeave = () =>
    Alert.alert(t('peer.leaveTitle'), t('peer.leaveBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('peer.leave'), style: 'destructive', onPress: () => leave.mutate() },
    ]);

  return (
    <Card className="mb-3">
      <Row className="justify-between">
        <View className="flex-1 pr-2">
          <Text variant="subheading">{group.name}</Text>
          <Text variant="body" className="mt-1">
            {group.description}
          </Text>
        </View>
        {joined ? <Badge label={t('peer.joined')} tone="success" /> : null}
      </Row>

      <Row className="mt-3 flex-wrap gap-2">
        <Badge label={t('peer.members', { count: group.memberCount })} tone="neutral" />
        <Badge
          label={group.stage === 'all' ? t('peer.anyStage') : t(`stage.${group.stage}`)}
          tone="brand"
        />
        <Badge label={group.language.toUpperCase()} tone="neutral" />
        {group.isModerated ? <Badge label={t('peer.moderated')} tone="success" /> : null}
      </Row>

      {joined && membership.data ? (
        <Text variant="caption" className="mt-2">
          {t('peer.yourAlias', { alias: membership.data.alias })}
        </Text>
      ) : null}

      <Row className="mt-3 gap-2">
        {joined ? (
          <>
            <Button
              label={t('peer.openGroup')}
              size="sm"
              onPress={() => navigation.navigate('PeerGroup', { groupId: group.id })}
            />
            <Button
              label={t('peer.leave')}
              size="sm"
              variant="ghost"
              loading={leave.isPending}
              onPress={confirmLeave}
            />
          </>
        ) : (
          <>
            <Button
              label={t('peer.join')}
              size="sm"
              loading={join.isPending}
              icon={<Icon name="people" size={15} color="#ffffff" />}
              onPress={() => join.mutate()}
            />
            <Button
              label={t('peer.readFirst')}
              size="sm"
              variant="secondary"
              onPress={() => navigation.navigate('PeerGroup', { groupId: group.id })}
            />
          </>
        )}
      </Row>
    </Card>
  );
}
