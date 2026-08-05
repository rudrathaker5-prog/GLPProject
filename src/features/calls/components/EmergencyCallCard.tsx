import { View } from 'react-native';

import { Card, Row, Text } from '@ui/components';
import { Icon } from '@ui/components/Icon';
import { useTheme } from '@ui/theme/ThemeProvider';

import { EMERGENCY_CONTACTS } from '../api/callService';
import { CallButton } from './CallButton';

/**
 * The national numbers, one tap away.
 *
 * These sit alongside the patient's own doctor rather than behind them. In the
 * situations that need 112 or Tele-MANAS — airway swelling, collapse, thoughts
 * of self-harm — a personal doctor may be in clinic, asleep, or simply not
 * picking up, and the minutes spent finding that out are the ones that matter.
 *
 * `when` text is included deliberately. A row of unlabelled emergency numbers
 * makes people hesitate about whether their situation "counts"; naming the
 * symptoms removes that hesitation.
 */
export function EmergencyCallCard({
  title = 'If this is an emergency',
  compact = false,
}: {
  title?: string;
  compact?: boolean;
}) {
  const { theme } = useTheme();

  return (
    <Card className="border-danger-400 bg-danger-100/40 dark:border-rose-900 dark:bg-rose-900/20">
      <Row className="mb-2">
        <Icon name="warning" size={20} color={theme.danger} />
        <Text variant="subheading" className="ml-2 flex-1">
          {title}
        </Text>
      </Row>

      {EMERGENCY_CONTACTS.map((contact) => (
        <View key={contact.id} className="mt-2">
          <Row className="justify-between">
            <View className="flex-1 pr-3">
              <Text variant="bodyStrong">{contact.name}</Text>
              <Text variant="caption" className="mt-0.5">
                {contact.number}
              </Text>
            </View>
            <CallButton
              number={contact.number}
              contactName={contact.name}
              kind={contact.kind}
              reason="red_flag"
              label="Call"
            />
          </Row>
          {compact ? null : (
            <Text variant="caption" className="mt-1">
              {contact.when}
            </Text>
          )}
        </View>
      ))}
    </Card>
  );
}
