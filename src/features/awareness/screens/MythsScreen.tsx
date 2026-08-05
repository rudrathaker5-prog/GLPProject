import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import type { RootStackParamList } from '@/app/navigation/types';
import type { MythCard } from '@core/domain/types';
import { MYTHS, searchMyths } from '@features/awareness/content/myths';
import { Badge, Button, Card, Input, Row, Screen, Text } from '@ui/components';
import { Icon } from '@ui/components/Icon';
import { useTheme } from '@ui/theme/ThemeProvider';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function MythsScreen() {
  const navigation = useNavigation<Nav>();
  const { theme } = useTheme();
  const [query, setQuery] = useState('');

  const cards = useMemo(() => (query.trim() ? searchMyths(query) : MYTHS), [query]);

  return (
    <Screen
      title="Myths vs facts"
      subtitle="The things people are told about weight, and what the evidence actually says."
    >
      <Input
        value={query}
        onChangeText={setQuery}
        placeholder="Search what you heard"
        autoCapitalize="none"
      />

      <View className="mt-4">
        {cards.map((card) => (
          <Card
            key={card.id}
            className="mb-3"
            onPress={() => navigation.navigate('MythDetail', { mythId: card.id, myth: card })}
          >
            <Row className="justify-between">
              <Badge label={verdictLabel(card.verdict)} tone={verdictTone(card.verdict)} />
              <Icon name="chevron" size={18} color={theme.textMuted} />
            </Row>
            <Text variant="subheading" className="mt-2">
              &ldquo;{card.myth}&rdquo;
            </Text>
            <Text variant="body" className="mt-1" numberOfLines={2}>
              {card.explanation}
            </Text>
          </Card>
        ))}

        {cards.length === 0 ? (
          <Card>
            <Text variant="body">
              I do not have a stored card for that. Ask the coach — it can look at what you heard
              and tell you what the evidence says.
            </Text>
            <Button
              className="mt-3"
              label="Ask the coach"
              onPress={() =>
                navigation.navigate('Chat', {
                  initialPrompt: `Is this true? "${query}"`,
                })
              }
            />
          </Card>
        ) : null}
      </View>
    </Screen>
  );
}

export function verdictLabel(verdict: MythCard['verdict']): string {
  return { myth: 'Myth', partly_true: 'Partly true', fact: 'Fact' }[verdict];
}

export function verdictTone(verdict: MythCard['verdict']): 'danger' | 'warning' | 'success' {
  return { myth: 'danger' as const, partly_true: 'warning' as const, fact: 'success' as const }[
    verdict
  ];
}
