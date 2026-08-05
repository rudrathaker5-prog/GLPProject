import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { View } from 'react-native';

import type { RootStackParamList } from '@/app/navigation/types';
import { COMMUNITY_GUIDELINES, listGroups } from '@features/peer/api/peerRepository';
import { useTranslation } from '@i18n/useTranslation';
import { Badge, Card, LoadingState, Row, Screen, SectionTitle, Text } from '@ui/components';
import { Icon } from '@ui/components/Icon';
import { useTheme } from '@ui/theme/ThemeProvider';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function PeerSupportScreen() {
  const navigation = useNavigation<Nav>();
  const { theme } = useTheme();
  const { t } = useTranslation();

  const groups = useQuery({ queryKey: ['peerGroups'], queryFn: listGroups });

  return (
    <Screen
      title={t('treatment.peerSupport')}
      subtitle="Moderated groups for people on the same path. You post under an alias, never your name."
      refreshing={groups.isRefetching}
      onRefresh={() => void groups.refetch()}
    >
      {groups.isLoading ? <LoadingState /> : null}

      {groups.data?.offline ? (
        <View className="mb-4 rounded-2xl bg-warn-100 px-3 py-2 dark:bg-amber-900/30">
          <Text variant="caption" className="text-warn-600 dark:text-amber-200">
            Showing the bundled group list. Posting needs the backend connected.
          </Text>
        </View>
      ) : null}

      {(groups.data?.groups ?? []).map((group) => (
        <Card
          key={group.id}
          className="mb-3"
          onPress={() => navigation.navigate('PeerGroup', { groupId: group.id })}
        >
          <Row className="justify-between">
            <View className="flex-1 pr-2">
              <Text variant="subheading">{group.name}</Text>
              <Text variant="body" className="mt-1">
                {group.description}
              </Text>
            </View>
            <Icon name="chevron" size={18} color={theme.textMuted} />
          </Row>
          <Row className="mt-3 flex-wrap gap-2">
            <Badge label={`${group.memberCount} members`} tone="neutral" />
            <Badge label={group.stage === 'all' ? 'Any stage' : group.stage} tone="brand" />
            <Badge label={group.language.toUpperCase()} tone="neutral" />
            {group.isModerated ? <Badge label="Moderated" tone="success" /> : null}
          </Row>
        </Card>
      ))}

      <SectionTitle title="House rules" />
      <Card>
        {COMMUNITY_GUIDELINES.map((rule) => (
          <Row key={rule} className="mb-2">
            <Icon name="shield" size={16} color={theme.primary} />
            <Text variant="body" className="ml-2 flex-1">
              {rule}
            </Text>
          </Row>
        ))}
        <Text variant="caption" className="mt-2">
          Posts that give dose advice, sell medicines or share phone numbers are blocked before they
          are sent. This is enforced in the app, not just requested.
        </Text>
      </Card>
    </Screen>
  );
}
