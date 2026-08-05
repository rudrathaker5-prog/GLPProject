import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import type { AllParamList } from '@/app/navigation/types';
import {
  createPost,
  generateAlias,
  joinGroup,
  listGroups,
  listPosts,
  moderatePost,
} from '@features/peer/api/peerRepository';
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

export function PeerGroupScreen() {
  const route = useRoute<Props>();
  const queryClient = useQueryClient();

  const [alias, setAlias] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const groups = useQuery({ queryKey: ['peerGroups'], queryFn: listGroups });
  const posts = useQuery({
    queryKey: ['peerPosts', route.params.groupId],
    queryFn: () => listPosts(route.params.groupId),
  });

  const group = groups.data?.groups.find((g) => g.id === route.params.groupId);

  useEffect(() => {
    void (async () => {
      const joined = await joinGroup(route.params.groupId);
      setAlias(joined || generateAlias());
    })();
  }, [route.params.groupId]);

  const post = useMutation({
    mutationFn: () => createPost(route.params.groupId, draft.trim(), alias ?? generateAlias()),
    onSuccess: () => {
      setDraft('');
      void queryClient.invalidateQueries({ queryKey: ['peerPosts', route.params.groupId] });
    },
    onError: (error) =>
      Alert.alert('Could not post', error instanceof Error ? error.message : 'Try again.'),
  });

  const submit = () => {
    const check = moderatePost(draft.trim());
    if (!check.allowed) {
      Alert.alert('Not posted', check.reason ?? 'That post breaks the group rules.');
      return;
    }
    post.mutate();
  };

  return (
    <Screen
      title={group?.name ?? 'Group'}
      subtitle={group?.description}
      refreshing={posts.isRefetching}
      onRefresh={() => void posts.refetch()}
    >
      {alias ? (
        <View className="mb-4">
          <Badge label={`You post as ${alias}`} tone="brand" />
        </View>
      ) : null}

      <Card>
        <Field label="Share something" hint="No dose advice, no numbers, no selling.">
          <Input
            value={draft}
            onChangeText={setDraft}
            placeholder="What has this week been like?"
            multiline
          />
        </Field>
        <Button
          label="Post"
          fullWidth
          disabled={draft.trim().length < 5}
          loading={post.isPending}
          onPress={submit}
        />
      </Card>

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
          <EmptyState
            title="No posts yet"
            message="Be the first. Saying the hard part out loud is usually what helps someone else."
          />
        ) : null}
      </View>

      <Text variant="caption" className="mt-4 text-center">
        Peer support is not medical advice. For anything clinical, ask your doctor or the care coach.
      </Text>
    </Screen>
  );
}
