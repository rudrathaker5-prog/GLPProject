import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import type { AllParamList } from '@/app/navigation/types';
import {
  createPost,
  joinGroup,
  listGroups,
  listPosts,
  membershipFor,
  moderatePost,
} from '@features/peer/api/peerRepository';
import { useTranslation } from '@i18n/useTranslation';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  LoadingState,
  Row,
  Screen,
  Text,
} from '@ui/components';

type Props = RouteProp<AllParamList, 'PeerGroup'>;

/**
 * Inside one group.
 *
 * Opening this screen used to join the group as a side effect of rendering it,
 * which meant "read first" was impossible and an alias was assigned to people
 * who had only looked. Reading is now free and joining is a button — which is
 * also what makes the alias meaningful, because it is attached to a decision
 * rather than to a page view.
 */
export function PeerGroupScreen() {
  const route = useRoute<Props>();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const [draft, setDraft] = useState('');

  const groups = useQuery({ queryKey: ['peerGroups'], queryFn: listGroups });
  const posts = useQuery({
    queryKey: ['peerPosts', route.params.groupId],
    queryFn: () => listPosts(route.params.groupId),
  });
  const membership = useQuery({
    queryKey: ['peerMembership', route.params.groupId],
    queryFn: () => membershipFor(route.params.groupId),
  });

  const group = groups.data?.groups.find((g) => g.id === route.params.groupId);
  const alias = membership.data?.alias ?? null;

  const join = useMutation({
    mutationFn: () => joinGroup(route.params.groupId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['peerMembership', route.params.groupId] });
      void queryClient.invalidateQueries({ queryKey: ['peerMemberships'] });
    },
    onError: () => Alert.alert(t('peer.joinFailedTitle'), t('peer.joinFailedBody')),
  });

  const post = useMutation({
    // Guarded by `alias` below — the composer does not render without one.
    mutationFn: () => createPost(route.params.groupId, draft.trim(), alias!),
    onSuccess: () => {
      setDraft('');
      void queryClient.invalidateQueries({ queryKey: ['peerPosts', route.params.groupId] });
    },
    onError: (error) =>
      Alert.alert(
        t('peer.postFailedTitle'),
        error instanceof Error ? error.message : t('peer.postFailedBody'),
      ),
  });

  const submit = () => {
    const check = moderatePost(draft.trim());
    if (!check.allowed) {
      Alert.alert(t('peer.notPostedTitle'), check.reason ?? t('peer.postBlocked'));
      return;
    }
    post.mutate();
  };

  return (
    <Screen
      title={group?.name ?? t('screens.group')}
      subtitle={group?.description}
      refreshing={posts.isRefetching}
      onRefresh={() => void posts.refetch()}
    >
      {alias ? (
        <View className="mb-4">
          <Badge label={t('peer.yourAlias', { alias })} tone="brand" />
        </View>
      ) : null}

      {alias ? (
        <Card>
          <Field label={t('peer.shareLabel')} hint={t('peer.shareHint')}>
            <Input
              value={draft}
              onChangeText={setDraft}
              placeholder={t('peer.sharePlaceholder')}
              multiline
            />
          </Field>
          <Button
            label={t('peer.post')}
            fullWidth
            disabled={draft.trim().length < 5}
            loading={post.isPending}
            onPress={submit}
          />
        </Card>
      ) : (
        /*
          Reading without joining is the point of this state, so it invites
          rather than blocks — the posts below are already visible behind it.
        */
        <Card className="border-brand-200 bg-brand-50 dark:border-brand-800 dark:bg-brand-900/20">
          <Text variant="subheading">{t('peer.readingTitle')}</Text>
          <Text variant="body" className="mt-1">
            {t('peer.readingBody')}
          </Text>
          <Button
            className="mt-3"
            label={t('peer.join')}
            fullWidth
            loading={join.isPending}
            onPress={() => join.mutate()}
          />
        </Card>
      )}

      {posts.isLoading ? <LoadingState /> : null}

      <View className="mt-4">
        {(posts.data ?? []).map((item) => (
          <Card key={item.id} className="mb-3">
            <Row className="justify-between">
              <Text variant="bodyStrong">{item.authorAlias}</Text>
              <Text variant="caption">
                {new Date(item.createdAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
              </Text>
            </Row>
            <Text variant="body" className="mt-2">
              {item.body}
            </Text>
          </Card>
        ))}

        {!posts.isLoading && (posts.data ?? []).length === 0 ? (
          <EmptyState title={t('peer.noPostsTitle')} message={t('peer.noPostsBody')} />
        ) : null}
      </View>

      <Text variant="caption" className="mt-4 text-center">
        {t('peer.disclaimer')}
      </Text>
    </Screen>
  );
}
