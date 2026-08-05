import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { View } from 'react-native';

import type { AllParamList } from '@/app/navigation/types';
import { getTopic } from '@features/awareness/content/education';
import { currentRelapseRisk, progressSummary } from '@features/tracking/api/trackingRepository';
import { useTranslation } from '@i18n/useTranslation';
import { Badge, Button, Card, ProgressBar, Row, Screen, SectionTitle, Text } from '@ui/components';
import { Icon } from '@ui/components/Icon';
import { useTheme } from '@ui/theme/ThemeProvider';

type Nav = NativeStackNavigationProp<AllParamList>;

/**
 * The relapse-prevention protocol.
 *
 * Written as a plan the patient can act on without another appointment, with a
 * defined trigger threshold, a graded response, and a clear route back to care.
 */
export function RelapsePlanScreen() {
  const navigation = useNavigation<Nav>();
  const { theme } = useTheme();
  const { t } = useTranslation();

  const risk = useQuery({ queryKey: ['relapseRisk'], queryFn: currentRelapseRisk });
  const progress = useQuery({ queryKey: ['progress'], queryFn: progressSummary });

  const nadir = progress.data?.nadirKg ?? null;
  const current = progress.data?.currentWeightKg ?? null;
  const threshold = nadir ? Math.round(nadir * 1.03 * 10) / 10 : null;
  const crossed = threshold && current ? current >= threshold : false;

  return (
    <Screen
      title={t('vigilance.relapsePrevention')}
      subtitle="A plan written now, so you do not have to make decisions when it is hard."
    >
      <Card className={crossed ? 'border-warn-400 bg-warn-100/40 dark:bg-amber-900/20' : ''}>
        <Text variant="label">Your action threshold</Text>
        {threshold ? (
          <>
            <Text variant="display" className="mt-1">
              {threshold} kg
            </Text>
            <Text variant="body" className="mt-1">
              3% above your lowest recorded weight ({nadir} kg). Crossing this is the signal to act —
              not to panic, and not to wait.
            </Text>
            <View className="mt-3">
              <ProgressBar
                label={current ? `Currently ${current} kg` : 'Log a weight to track this'}
                value={
                  nadir && threshold && current
                    ? Math.min(100, Math.max(0, ((current - nadir) / (threshold - nadir)) * 100))
                    : 0
                }
                tone={crossed ? 'warning' : 'success'}
              />
            </View>
            {crossed ? (
              <Badge label="Threshold crossed — start step 1 today" tone="warning" className="mt-3" />
            ) : null}
          </>
        ) : (
          <Text variant="body" className="mt-1">
            Log a few weights and your personal threshold appears here.
          </Text>
        )}
      </Card>

      <SectionTitle title="The graded response" />

      <Step
        number={1}
        title="Weight is 3% above your lowest"
        actions={[
          'Go back to weighing weekly, same day, same conditions.',
          'Protein at every meal, starting tomorrow. Nothing else changes yet.',
          'Two resistance sessions this week — this protects the muscle that protects your metabolism.',
          'Log a check-in so your coach can see what changed.',
        ]}
        tone={crossed ? 'warning' : 'neutral'}
      />

      <Step
        number={2}
        title="Weight is 5% above, or it has been rising for a month"
        actions={[
          'Book a review with your doctor within two weeks. Do not wait for a scheduled appointment.',
          'Write down what changed in the last month: sleep, stress, work, travel, mood.',
          'Restart daily food logging for two weeks — not forever, just long enough to see the pattern.',
        ]}
        tone="warning"
      />

      <Step
        number={3}
        title="Weight is 10% above, or eating feels out of control"
        actions={[
          'Contact your doctor this week. Restarting treatment is a legitimate medical option, not a failure.',
          'If you are bingeing, purging or feel unable to stop eating, say that explicitly — it changes the treatment plan and it is treatable.',
          'Tell one person you trust. Isolation is what turns a slip into a slide.',
        ]}
        tone="danger"
      />

      <SectionTitle title="Your high-risk situations" />
      <Card>
        <Text variant="body">
          Regain rarely comes from nowhere. For most people it starts with one of these. Decide now
          what you will do in each:
        </Text>
        <View className="mt-3">
          {[
            'Festivals and weddings — eat protein first, then enjoy the rest without narrating it to yourself.',
            'Travel — pack protein, walk the airport, accept the week will not be perfect.',
            'Work stress — the plan shrinks, it does not stop. Ten minutes of walking still counts.',
            'Illness or injury — protein and sleep matter more than exercise while you recover.',
            'Sleep debt — the single most reliable predictor of a bad eating week.',
          ].map((item) => (
            <Row key={item} className="mb-2">
              <Icon name="shield" size={16} color={theme.primary} />
              <Text variant="body" className="ml-2 flex-1">
                {item}
              </Text>
            </Row>
          ))}
        </View>
      </Card>

      <SectionTitle title="What this is not" />
      <Card className="border-vital-200 bg-vital-50 dark:border-vital-800 dark:bg-vital-900/20">
        <Text variant="body">
          Regain is the disease reasserting itself. It is documented, expected, and it happens to
          people who do everything right. It is not evidence about your character, your discipline
          or your worth.
        </Text>
        <Text variant="body" className="mt-2">
          The only thing that reliably makes it worse is waiting because you feel ashamed.
        </Text>
      </Card>

      <View className="mt-6 gap-2">
        <Button
          label="Book a review now"
          fullWidth
          size="lg"
          onPress={() => navigation.navigate('Doctors')}
        />
        <Button
          label="Talk it through with my coach"
          variant="secondary"
          fullWidth
          onPress={() =>
            navigation.navigate('Chat', {
              initialPrompt: 'My weight has started creeping back up. Can you help me plan?',
            })
          }
        />
        <Button
          label="Read: life after the medicine"
          variant="ghost"
          fullWidth
          onPress={() =>
            navigation.navigate('EducationTopic', {
              topicId: 'long-term',
              topic: getTopic('long-term'),
            })
          }
        />
      </View>

      {risk.data ? (
        <Text variant="caption" className="mt-4 text-center">
          Current risk score {risk.data.score}/100 ({risk.data.band}).
        </Text>
      ) : null}
    </Screen>
  );
}

function Step({
  number,
  title,
  actions,
  tone,
}: {
  number: number;
  title: string;
  actions: string[];
  tone: 'neutral' | 'warning' | 'danger';
}) {
  const { theme } = useTheme();
  const colour =
    tone === 'danger' ? theme.danger : tone === 'warning' ? theme.warning : theme.primary;

  return (
    <Card className="mb-3">
      <Row>
        <View
          className="h-8 w-8 items-center justify-center rounded-full"
          style={{ backgroundColor: `${colour}22` }}
        >
          <Text variant="bodyStrong" style={{ color: colour }}>
            {number}
          </Text>
        </View>
        <Text variant="subheading" className="ml-3 flex-1">
          {title}
        </Text>
      </Row>
      <View className="mt-3">
        {actions.map((action) => (
          <Row key={action} className="mb-2">
            <Icon name="check" size={16} color={colour} />
            <Text variant="body" className="ml-2 flex-1">
              {action}
            </Text>
          </Row>
        ))}
      </View>
    </Card>
  );
}
