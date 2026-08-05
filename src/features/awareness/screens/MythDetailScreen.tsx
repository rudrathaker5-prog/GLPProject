import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { AllParamList } from '@/app/navigation/types';
import { MYTHS } from '@features/awareness/content/myths';
import { Badge, Button, Card, EmptyState, Screen, Text } from '@ui/components';

import { verdictLabel, verdictTone } from './MythsScreen';

type Nav = NativeStackNavigationProp<AllParamList>;
type Props = RouteProp<AllParamList, 'MythDetail'>;

export function MythDetailScreen() {
  const route = useRoute<Props>();
  const navigation = useNavigation<Nav>();
  const card = route.params.myth ?? MYTHS.find((m) => m.id === route.params.mythId);

  if (!card) {
    return (
      <Screen>
        <EmptyState
          title="Not found"
          message="This card is no longer available."
          action={<Button label="Back" onPress={() => navigation.goBack()} />}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Badge label={verdictLabel(card.verdict)} tone={verdictTone(card.verdict)} />
      <Text variant="title" className="mt-3">
        &ldquo;{card.myth}&rdquo;
      </Text>

      <Card className="mt-5">
        <Text variant="label">What is actually going on</Text>
        <Text variant="body" className="mt-1">
          {card.explanation}
        </Text>
      </Card>

      <Card className="mt-3">
        <Text variant="label">The evidence</Text>
        <Text variant="body" className="mt-1">
          {card.evidence}
        </Text>
      </Card>

      <Card className="mt-3 border-vital-200 bg-vital-50 dark:border-vital-800 dark:bg-vital-900/20">
        <Text variant="label">And to be clear</Text>
        <Text variant="body" className="mt-1">
          {card.reassurance}
        </Text>
      </Card>

      <Button
        className="mt-5"
        fullWidth
        variant="secondary"
        label="Ask the coach a follow-up"
        onPress={() =>
          navigation.navigate('Chat', {
            initialPrompt: `I want to understand more about this: "${card.myth}"`,
          })
        }
      />

      <Text variant="caption" className="mt-4 text-center">
        Educational information, not medical advice.
      </Text>
    </Screen>
  );
}
