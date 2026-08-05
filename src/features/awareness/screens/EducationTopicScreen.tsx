import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useLayoutEffect } from 'react';
import { View } from 'react-native';

import type { AllParamList } from '@/app/navigation/types';
import { getTopic } from '@features/awareness/content/education';
import { useTranslation } from '@i18n/useTranslation';
import { Badge, Button, Card, EmptyState, Screen, Text } from '@ui/components';

type Nav = NativeStackNavigationProp<AllParamList>;
type Props = RouteProp<AllParamList, 'EducationTopic'>;

export function EducationTopicScreen() {
  const route = useRoute<Props>();
  const navigation = useNavigation<Nav>();
  const topic = route.params.topic ?? getTopic(route.params.topicId);
  const { t, language } = useTranslation();

  /*
    The care library is only written in English. It is sourced from WHO and
    ICMR-NIN, and a machine translation of clinical guidance is the kind of
    thing that is wrong in ways a patient cannot detect — so rather than
    translating it badly or pretending the gap does not exist, the app says so
    and hands the person to the coach, which *does* answer in their language
    from the same knowledge base.
  */
  const englishOnly = language !== 'en';

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

      {englishOnly ? (
        <Card className="mt-4 border-brand-200 bg-brand-50 dark:border-brand-800 dark:bg-brand-900/20">
          <Text variant="subheading">{t('awareness.englishOnlyTitle')}</Text>
          <Text variant="body" className="mt-1">
            {t('awareness.englishOnlyBody')}
          </Text>
          <Button
            className="mt-3"
            label={t('awareness.askCoach')}
            variant="secondary"
            fullWidth
            onPress={() =>
              navigation.navigate('Chat', {
                initialPrompt: `${topic.title}. ${topic.summary}`,
              })
            }
          />
        </Card>
      ) : null}

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
