import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import type { HealthProvider } from '@core/domain/types';
import {
  adaptersForPlatform,
  connectProvider,
  listConnections,
  syncProvider,
} from '@integrations/health/healthAdapter';
import { Badge, Button, Card, Row, Screen, SectionTitle, Text } from '@ui/components';
import { Icon } from '@ui/components/Icon';
import { useTheme } from '@ui/theme/ThemeProvider';

/**
 * Device & health-data integration.
 *
 * Shows an honest availability state per provider rather than a toggle that
 * silently does nothing: a provider whose native module is not in this build
 * reports "not in this build" with the exact package needed.
 */
export function DevicesScreen() {
  const queryClient = useQueryClient();
  const { theme } = useTheme();

  const adapters = adaptersForPlatform();
  const [availability, setAvailability] = useState<Record<string, boolean>>({});

  const connections = useQuery({ queryKey: ['deviceConnections'], queryFn: listConnections });

  useEffect(() => {
    void (async () => {
      const result: Record<string, boolean> = {};
      for (const adapter of adapters) {
        result[adapter.provider] = await adapter.isAvailable();
      }
      setAvailability(result);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = useMutation({
    mutationFn: (provider: HealthProvider) => connectProvider(provider),
    onSuccess: (connection) => {
      void queryClient.invalidateQueries({ queryKey: ['deviceConnections'] });
      if (connection.status === 'unsupported') {
        Alert.alert(
          'Not available in this build',
          'This integration needs a native module that is not compiled into the current binary. See docs/INTEGRATIONS.md for the package to add and rebuild.',
        );
      } else if (connection.status === 'error') {
        Alert.alert('Permission denied', 'Health data access was not granted.');
      }
    },
  });

  const sync = useMutation({
    mutationFn: (provider: HealthProvider) => syncProvider(provider),
    onSuccess: (count) => {
      void queryClient.invalidateQueries({ queryKey: ['deviceConnections'] });
      void queryClient.invalidateQueries({ queryKey: ['progress'] });
      Alert.alert('Sync complete', `${count} sample${count === 1 ? '' : 's'} imported.`);
    },
  });

  return (
    <Screen
      title="Devices & health data"
      subtitle="Steps, sleep, heart rate and weight can flow in automatically."
      refreshing={connections.isRefetching}
      onRefresh={() => void connections.refetch()}
    >
      {adapters.map((adapter) => {
        const connection = (connections.data ?? []).find((c) => c.provider === adapter.provider);
        const available = availability[adapter.provider];
        const connected = connection?.status === 'connected';

        return (
          <Card key={adapter.provider} className="mb-3">
            <Row className="justify-between">
              <Row className="flex-1">
                <View
                  className="h-10 w-10 items-center justify-center rounded-2xl"
                  style={{ backgroundColor: `${theme.primary}18` }}
                >
                  <Icon name="heart" size={20} color={theme.primary} />
                </View>
                <View className="ml-3 flex-1">
                  <Text variant="subheading">{adapter.label}</Text>
                  <Text variant="caption" className="mt-0.5">
                    {connected
                      ? connection?.lastSyncAt
                        ? `Last synced ${new Date(connection.lastSyncAt).toLocaleString('en-IN', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}`
                        : 'Connected, not synced yet'
                      : available === false
                        ? 'Not in this build'
                        : 'Not connected'}
                  </Text>
                </View>
              </Row>
              <Badge
                label={connected ? 'On' : available === false ? 'Unavailable' : 'Off'}
                tone={connected ? 'success' : available === false ? 'neutral' : 'warning'}
              />
            </Row>

            <Row className="mt-3 gap-2">
              <View className="flex-1">
                <Button
                  label={connected ? 'Reconnect' : 'Connect'}
                  variant={connected ? 'secondary' : 'primary'}
                  fullWidth
                  loading={connect.isPending}
                  onPress={() => connect.mutate(adapter.provider)}
                />
              </View>
              {connected ? (
                <Button
                  label="Sync now"
                  variant="secondary"
                  loading={sync.isPending}
                  onPress={() => sync.mutate(adapter.provider)}
                />
              ) : null}
            </Row>
          </Card>
        );
      })}

      <SectionTitle title="What gets imported" />
      <Card>
        {[
          'Weight — becomes a weight entry and counts towards milestones',
          'Steps and active minutes — feed the activity part of your wellness score',
          'Sleep — feeds the sleep part of your wellness score',
          'Heart rate — stored for your doctor to review',
        ].map((item) => (
          <Row key={item} className="mb-2">
            <Icon name="check" size={16} color={theme.accent} />
            <Text variant="body" className="ml-2 flex-1">
              {item}
            </Text>
          </Row>
        ))}
        <Text variant="caption" className="mt-2">
          Nothing is written back to your health app unless you ask. Data stays under the same
          privacy rules as everything else in the app.
        </Text>
      </Card>

      <Card className="mt-3">
        <Text variant="label">Manual entry always works</Text>
        <Text variant="body" className="mt-1">
          Every one of these can be entered by hand and nothing in the app depends on a device being
          connected. The integration saves typing, it is not a requirement.
        </Text>
      </Card>
    </Screen>
  );
}
