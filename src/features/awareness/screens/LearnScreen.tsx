import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import type { AllParamList } from '@/app/navigation/types';
import type { EducationTopic } from '@core/domain/types';
import { EDUCATION_TOPICS, searchTopics } from '@features/awareness/content/education';
import { Badge, Card, Chip, Input, Row, Screen, Text } from '@ui/components';
import { Icon } from '@ui/components/Icon';
import { useTheme } from '@ui/theme/ThemeProvider';

type Nav = NativeStackNavigationProp<AllParamList>;

const CATEGORIES: { value: EducationTopic['category'] | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'basics', label: 'Basics' },
  { value: 'medical', label: 'Medical' },
  { value: 'nutrition', label: 'Nutrition' },
  { value: 'activity', label: 'Activity' },
  { value: 'behaviour', label: 'Mind' },
  { value: 'safety', label: 'Safety' },
  { value: 'long_term', label: 'Long term' },
];

export function LearnScreen() {
  const navigation = useNavigation<Nav>();
  const { theme } = useTheme();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<EducationTopic['category'] | 'all'>('all');

  const topics = useMemo(() => {
    const base = query.trim() ? searchTopics(query) : EDUCATION_TOPICS;
    return category === 'all' ? base : base.filter((t) => t.category === category);
  }, [query, category]);

  return (
    <Screen
      title="Learn about obesity"
      subtitle="WHO and ICMR-based guidance, written for people, not clinicians."
    >
      <Input value={query} onChangeText={setQuery} placeholder="Search topics" autoCapitalize="none" />

      <View className="mt-4 flex-row flex-wrap">
        {CATEGORIES.map((item) => (
          <Chip
            key={item.value}
            label={item.label}
            selected={category === item.value}
            onPress={() => setCategory(item.value)}
          />
        ))}
      </View>

      <View className="mt-2">
        {topics.map((topic) => (
          <Card
            key={topic.id}
            className="mb-3"
            onPress={() => navigation.navigate('EducationTopic', { topicId: topic.id, topic })}
          >
            <Row className="justify-between">
              <View className="flex-1 pr-3">
                <Badge label={categoryLabel(topic.category)} tone="brand" />
                <Text variant="subheading" className="mt-2">
                  {topic.title}
                </Text>
                <Text variant="body" className="mt-1">
                  {topic.summary}
                </Text>
                <Text variant="caption" className="mt-2">
                  {topic.readMinutes} min read
                </Text>
              </View>
              <Icon name="chevron" size={20} color={theme.textMuted} />
            </Row>
          </Card>
        ))}

        {topics.length === 0 ? (
          <Card>
            <Text variant="body">
              Nothing matched &ldquo;{query}&rdquo;. Try asking the care coach instead — it can
              answer questions the library does not cover.
            </Text>
          </Card>
        ) : null}
      </View>
    </Screen>
  );
}

function categoryLabel(category: EducationTopic['category']): string {
  return (
    CATEGORIES.find((c) => c.value === category)?.label ?? category.replace('_', ' ')
  );
}
