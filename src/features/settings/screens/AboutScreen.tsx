import { Linking, View } from 'react-native';

import { appInfo, capabilities } from '@core/config/env';
import { CRISIS_RESOURCES_IN } from '@core/clinical/safety';
import { KNOWLEDGE_SIZE } from '@features/ai/engine/localEngine';
import { Badge, Button, Card, Row, Screen, SectionTitle, Text } from '@ui/components';
import { Icon } from '@ui/components/Icon';
import { useTheme } from '@ui/theme/ThemeProvider';

export function AboutScreen() {
  const { theme } = useTheme();

  return (
    <Screen title={appInfo.name} subtitle={`Version ${appInfo.version} · ${appInfo.variant}`}>
      <Card>
        <Text variant="body">
          GLP Care is an obesity care companion for the whole patient journey: understanding the
          condition, going through treatment, and staying well afterwards.
        </Text>
        <Text variant="body" className="mt-3">
          It is not a doctor, it does not prescribe, and it does not diagnose. Everything clinical
          routes to a registered doctor.
        </Text>
      </Card>

      <SectionTitle title="What is running" />
      <Card>
        <StatusRow
          label="Backend (Supabase)"
          on={capabilities.backend}
          onText="Connected — data syncs across devices"
          offText="Local only — everything is stored on this device"
        />
        <StatusRow
          label="AI care service"
          on={capabilities.remoteAi}
          onText="Connected — full conversational coaching"
          offText={`Offline library — ${KNOWLEDGE_SIZE.topics} topics, ${KNOWLEDGE_SIZE.myths} myth cards, rules-based coaching`}
        />
        <StatusRow
          label="Local reminders"
          on
          onText="Working — fire without network or account"
          offText=""
        />
        <StatusRow
          label="Push notifications"
          on={capabilities.backend}
          onText="Registered for cross-device delivery"
          offText="Local reminders only"
        />
      </Card>

      <SectionTitle title="Evidence base" />
      <Card>
        {[
          'WHO — Obesity and overweight fact sheet',
          'WHO — Guidelines on physical activity and sedentary behaviour (2020)',
          'WHO — Healthy diet fact sheet',
          'ICMR-NIN — Dietary Guidelines for Indians (2024)',
          'Indian consensus statements on medical management of obesity',
        ].map((source) => (
          <Row key={source} className="mb-2">
            <Icon name="learn" size={16} color={theme.primary} />
            <Text variant="body" className="ml-2 flex-1">
              {source}
            </Text>
          </Row>
        ))}
        <Text variant="caption" className="mt-2">
          Asian-Indian BMI thresholds are used throughout: overweight ≥ 23, obesity ≥ 25, waist
          ≥ 90 cm (men) / ≥ 80 cm (women).
        </Text>
      </Card>

      <SectionTitle title="In an emergency" />
      <Card className="border-danger-400 bg-danger-100/40 dark:bg-rose-900/20">
        {CRISIS_RESOURCES_IN.map((resource) => (
          <Row key={resource.number} className="mb-3 justify-between">
            <View className="flex-1">
              <Text variant="bodyStrong">{resource.name}</Text>
              <Text variant="caption">{resource.number}</Text>
            </View>
            <Button
              label="Call"
              size="sm"
              variant="danger"
              onPress={() => void Linking.openURL(`tel:${resource.number}`)}
            />
          </Row>
        ))}
      </Card>

      <SectionTitle title="Privacy" />
      <Card>
        <Text variant="body">
          Anonymous mode stores nothing against your identity. An account is only created when you do
          something that needs it — booking, prescriptions or cross-device sync — and you are told at
          that moment.
        </Text>
        <Text variant="body" className="mt-2">
          Doctors can only see your data if you have an active care relationship with them and data
          sharing is on. This is enforced by database row-level security, not just by the app.
        </Text>
        <Text variant="body" className="mt-2">
          &ldquo;Delete my data&rdquo; in Settings erases everything permanently, on the device and
          on the server.
        </Text>
      </Card>

      <Row className="mt-4 flex-wrap gap-2">
        <Badge label="React Native · Expo" tone="neutral" />
        <Badge label="Supabase" tone="neutral" />
        <Badge label="OpenAI-compatible AI" tone="neutral" />
      </Row>

      <Text variant="caption" className="mt-4 text-center">
        Educational information, not medical advice.
      </Text>
    </Screen>
  );
}

function StatusRow({
  label,
  on,
  onText,
  offText,
}: {
  label: string;
  on: boolean;
  onText: string;
  offText: string;
}) {
  const { theme } = useTheme();
  return (
    <Row className="mb-4">
      <Icon
        name={on ? 'check' : 'warning'}
        size={18}
        color={on ? theme.accent : theme.warning}
      />
      <View className="ml-3 flex-1">
        <Text variant="bodyStrong">{label}</Text>
        <Text variant="caption" className="mt-0.5">
          {on ? onText : offText}
        </Text>
      </View>
    </Row>
  );
}
