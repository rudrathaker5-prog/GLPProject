import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { View } from 'react-native';

import type { AllParamList } from '@/app/navigation/types';
import { listMemberships } from '@features/peer/api/peerRepository';
import { useTranslation } from '@i18n/useTranslation';
import { Badge, Button, Card, Row, SectionTitle, Text } from '@ui/components';
import { Icon, type IconName } from '@ui/components/Icon';
import { useTheme } from '@ui/theme/ThemeProvider';

type Nav = NativeStackNavigationProp<AllParamList>;

/**
 * The two things people ask for most once treatment is under way: someone else
 * going through the same thing, and a straight answer about what to eat.
 *
 * Both already existed — peer support was one tile among twelve on the
 * dashboard, and nutrition only ever appeared as a generated plan that needs a
 * weight and a target before it says anything. Neither was findable at the
 * moment someone actually wants it, so they get their own pair of buttons on
 * both the Journey and Staying Well tabs.
 *
 * Rendered identically in both places on purpose. Someone six months post
 * treatment looking for a group should not have to learn a different layout.
 */
export function SupportShortcuts() {
  const navigation = useNavigation<Nav>();
  const { t } = useTranslation();

  // Membership count is the difference between "join a group" and "your group".
  // A failed read just falls back to the invitation, which is never wrong.
  const memberships = useQuery({
    queryKey: ['peerMemberships'],
    queryFn: listMemberships,
  });
  const joinedCount = (memberships.data ?? []).length;

  return (
    <View>
      <SectionTitle title={t('support.sectionTitle')} />

      <ShortcutCard
        icon="people"
        title={joinedCount > 0 ? t('peer.entryTitleJoined') : t('peer.entryTitle')}
        body={joinedCount > 0 ? t('peer.entryBodyJoined') : t('peer.entryBody')}
        cta={joinedCount > 0 ? t('peer.entryCtaJoined') : t('peer.entryCta')}
        badge={joinedCount > 0 ? t('peer.joined') : undefined}
        onPress={() => navigation.navigate('PeerSupport')}
      />

      <ShortcutCard
        icon="nutrition"
        title={t('nutritionStandards.entryTitle')}
        body={t('nutritionStandards.entryBody')}
        cta={t('nutritionStandards.entryCta')}
        onPress={() => navigation.navigate('NutritionStandards')}
      />
    </View>
  );
}

/**
 * The card is not itself pressable: it carries a Button, and nesting a
 * touchable inside a touchable makes the whole card report as one control to a
 * screen reader and swallows the button's own press on Android.
 */
function ShortcutCard({
  icon,
  title,
  body,
  cta,
  badge,
  onPress,
}: {
  icon: IconName;
  title: string;
  body: string;
  cta: string;
  badge?: string;
  onPress: () => void;
}) {
  const { theme } = useTheme();

  return (
    <Card className="mb-3">
      <Row className="items-start">
        <View
          className="h-11 w-11 items-center justify-center rounded-2xl"
          style={{ backgroundColor: `${theme.primary}18` }}
        >
          <Icon name={icon} size={20} color={theme.primary} />
        </View>
        <View className="ml-3 flex-1">
          <Row className="justify-between">
            <Text variant="subheading" className="flex-1 pr-2">
              {title}
            </Text>
            {badge ? <Badge label={badge} tone="success" /> : null}
          </Row>
          <Text variant="body" className="mt-1">
            {body}
          </Text>
        </View>
      </Row>

      <Button className="mt-3 self-start" label={cta} size="sm" onPress={onPress} />
    </Card>
  );
}
