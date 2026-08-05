import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useLayoutEffect } from 'react';
import { View } from 'react-native';

import type { RootStackParamList } from '@/app/navigation/types';
import { getTopic } from '@features/awareness/content/education';
import { Badge, Button, Card, EmptyState, Screen, Text } from '@ui/components';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Props = RouteProp<RootStackParamList, 'EducationTopic'>;

export function EducationTopicScreen() {
  const route = useRoute<Props>();
  const navigation = useNavigation<Nav>();
  const topic = route.params.topic ?? getTopic(route.params.topicId);

  useLayoutEffect(() => {
    navigation.setOptions({ title: topic ? '' : 'Not found' });
  }, [navigation, topic]);

  if (!topic) {
    return (
      <Screen>
        <EmptyState
          title="Topic not found"
          message="This article is no longer available."
          action={<Button label="Back to Learn" onPress={() => navigation.goBack()} />}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Badge label={`${topic.readMinutes} min read`} tone="brand" />
      <Text variant="display" className="mt-3">
        {topic.title}
      </Text>
      <Text variant="body" className="mt-2">
        {topic.summary}
      </Text>

      <View className="mt-5">
        {topic.body.map((paragraph, index) => (
          <Text key={index} variant="body" className="mb-4">
            {paragraph}
          </Text>
        ))}
      </View>

      <Card className="mt-2">
        <Text variant="label">Sources</Text>
        {topic.sources.map((source) => (
          <Text key={source} variant="caption" className="mt-1">
            • {source}
          </Text>
        ))}
      </Card>

      <Button
        className="mt-4"
        fullWidth
        label="Ask the coach about this"
        variant="secondary"
        onPress={() =>
          navigation.navigate('Chat', {
            initialPrompt: `I just read about "${topic.title}". Can you explain what it means for me?`,
          })
        }
      />
    </Screen>
  );
}
