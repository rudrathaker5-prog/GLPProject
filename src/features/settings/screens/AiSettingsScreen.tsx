import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Alert, Linking, View } from 'react-native';

import { capabilities } from '@core/config/env';
import {
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
  clearApiKey,
  getApiKey,
  getEndpoint,
  maskKey,
  saveApiKey,
  saveEndpoint,
  testConnection,
} from '@features/ai/api/openAiClient';
import { KNOWLEDGE_SIZE } from '@features/ai/engine/localEngine';
import { useChatStore } from '@features/ai/store/chatStore';
import { Badge, Button, Card, Field, Input, Row, Screen, SectionTitle, Text } from '@ui/components';
import { Icon } from '@ui/components/Icon';
import { useTheme } from '@ui/theme/ThemeProvider';

/**
 * Bring-your-own-key configuration.
 *
 * This is what turns a personally installed APK into a genuinely conversational
 * agent without the user having to deploy a server. The key is written to the
 * device keystore via expo-secure-store and never leaves the device except in
 * the Authorization header of the AI request itself.
 */
export function AiSettingsScreen() {
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const resetChat = useChatStore((s) => s.reset);

  const [storedKey, setStoredKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; detail: string } | null>(null);

  useEffect(() => {
    void (async () => {
      setStoredKey(await getApiKey());
      const endpoint = await getEndpoint();
      setBaseUrl(endpoint.baseUrl);
      setModel(endpoint.model);
    })();
  }, []);

  const save = async () => {
    setBusy(true);
    setStatus(null);
    try {
      await saveEndpoint(baseUrl, model);
      if (keyInput.trim()) {
        await saveApiKey(keyInput.trim());
        setStoredKey(keyInput.trim());
        setKeyInput('');
      }
      const result = await testConnection();
      setStatus(result);
      if (result.ok) {
        resetChat();
        void queryClient.invalidateQueries();
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    Alert.alert(
      'Remove API key?',
      'The coach will fall back to the built-in care library. Nothing else changes.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await clearApiKey();
            setStoredKey(null);
            setStatus(null);
          },
        },
      ],
    );
  };

  const active = Boolean(storedKey);

  return (
    <Screen
      title="AI settings"
      subtitle="Connect your own AI key to unlock the full conversational coach."
    >
      {/* Current state, stated plainly */}
      <Card
        className={
          active || capabilities.remoteAi
            ? 'border-vital-300 bg-vital-50 dark:border-vital-800 dark:bg-vital-900/20'
            : 'border-warn-400 bg-warn-100/40 dark:bg-amber-900/20'
        }
      >
        <Row className="justify-between">
          <Row className="flex-1">
            <Icon
              name={active || capabilities.remoteAi ? 'sparkle' : 'shield'}
              size={20}
              color={active || capabilities.remoteAi ? theme.accent : theme.warning}
            />
            <Text variant="subheading" className="ml-2 flex-1">
              {capabilities.remoteAi
                ? 'Full AI active (server)'
                : active
                  ? 'Full AI active (this device)'
                  : 'Offline care library'}
            </Text>
          </Row>
          <Badge
            label={capabilities.remoteAi || active ? 'On' : 'Basic'}
            tone={capabilities.remoteAi || active ? 'success' : 'warning'}
          />
        </Row>

        <Text variant="body" className="mt-2">
          {capabilities.remoteAi
            ? 'Your app is connected to a care server that holds the key. Nothing is needed here.'
            : active
              ? 'Saathi is running the full agentic loop on this device: memory, your health context, and every tool — eligibility, doctors, booking, check-ins, refills and the relapse protocol.'
              : `Saathi is answering from the built-in library — ${KNOWLEDGE_SIZE.topics} education topics and ${KNOWLEDGE_SIZE.myths} myth cards, with real eligibility calculation and safety triage. It works with no key and no internet, but it cannot hold a free-flowing conversation.`}
        </Text>
      </Card>

      {!capabilities.remoteAi ? (
        <>
          <SectionTitle title="Your API key" />
          <Card>
            {active ? (
              <View className="mb-4 rounded-2xl bg-surface-sunken p-3 dark:bg-dark-surface-sunken">
                <Text variant="caption">Key stored on this device</Text>
                <Text variant="bodyStrong" className="mt-1">
                  {maskKey(storedKey!)}
                </Text>
              </View>
            ) : null}

            <Field
              label={active ? 'Replace key' : 'OpenAI API key'}
              hint="Starts with sk-. Stored in the device keystore, never in plain text, never logged."
            >
              <Input
                value={keyInput}
                onChangeText={setKeyInput}
                placeholder="sk-..."
                autoCapitalize="none"
                secureTextEntry
                accessibilityLabel="API key"
              />
            </Field>

            <Field
              label="Model"
              hint="gpt-4o-mini is fast and inexpensive. gpt-4o is stronger at nuanced coaching."
            >
              <Input value={model} onChangeText={setModel} autoCapitalize="none" placeholder={DEFAULT_MODEL} />
            </Field>

            <Field
              label="API base URL"
              hint="Change this to use Azure OpenAI, Groq, Together, OpenRouter or a self-hosted model."
            >
              <Input
                value={baseUrl}
                onChangeText={setBaseUrl}
                autoCapitalize="none"
                placeholder={DEFAULT_BASE_URL}
              />
            </Field>

            <Button
              label={active ? 'Save and test' : 'Connect and test'}
              fullWidth
              loading={busy}
              disabled={!active && !keyInput.trim()}
              onPress={() => void save()}
            />

            {active ? (
              <Button className="mt-2" label="Remove key" variant="ghost" fullWidth onPress={remove} />
            ) : null}

            {status ? (
              <View
                className={`mt-3 rounded-2xl p-3 ${
                  status.ok
                    ? 'bg-vital-50 dark:bg-vital-900/25'
                    : 'bg-danger-100 dark:bg-rose-900/25'
                }`}
              >
                <Row>
                  <Icon
                    name={status.ok ? 'check' : 'warning'}
                    size={16}
                    color={status.ok ? theme.accent : theme.danger}
                  />
                  <Text variant="body" className="ml-2 flex-1">
                    {status.detail}
                  </Text>
                </Row>
              </View>
            ) : null}
          </Card>

          <SectionTitle title="How to get a key" />
          <Card>
            <Step n={1} text="Open platform.openai.com and sign in." />
            <Step n={2} text="Go to API keys and create a new secret key." />
            <Step n={3} text="Add a small amount of billing credit — this app uses very little." />
            <Step n={4} text="Copy the key and paste it above." />
            <Button
              className="mt-3"
              label="Open platform.openai.com"
              variant="secondary"
              fullWidth
              onPress={() => void Linking.openURL('https://platform.openai.com/api-keys')}
            />
          </Card>

          <SectionTitle title="Before you use this with anyone else" />
          <Card className="border-warn-400 bg-warn-100/40 dark:bg-amber-900/20">
            <Text variant="body">
              A key stored on a phone can be extracted by anyone who has that phone. This option
              exists so you can run the full coach on your own device without deploying anything.
            </Text>
            <Text variant="body" className="mt-2">
              For real patients, put the key in the `ai-agent` edge function instead and connect a
              Supabase project — the app then prefers the server automatically and no key ever
              reaches a device. See docs/INSTALLATION.md.
            </Text>
          </Card>
        </>
      ) : null}

      <SectionTitle title="What never depends on a key" />
      <Card>
        {[
          'Red-flag symptom detection and emergency routing, in all four languages',
          'Eligibility calculation with Indian ICMR thresholds',
          'The education library and myth cards',
          'Medication reminders and every notification',
          'Weight, check-ins, wellness score and relapse risk',
          'Doctor directory, calling and booking',
        ].map((item) => (
          <Row key={item} className="mb-2">
            <Icon name="check" size={16} color={theme.accent} />
            <Text variant="body" className="ml-2 flex-1">
              {item}
            </Text>
          </Row>
        ))}
        <Text variant="caption" className="mt-2">
          Safety is deterministic by design. It runs before and after the model, so it works even
          when the AI does not.
        </Text>
      </Card>
    </Screen>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  const { theme } = useTheme();
  return (
    <Row className="mb-2">
      <View
        className="h-6 w-6 items-center justify-center rounded-full"
        style={{ backgroundColor: `${theme.primary}1F` }}
      >
        <Text variant="caption" style={{ color: theme.primary, fontWeight: '700' }}>
          {n}
        </Text>
      </View>
      <Text variant="body" className="ml-2 flex-1">
        {text}
      </Text>
    </Row>
  );
}
