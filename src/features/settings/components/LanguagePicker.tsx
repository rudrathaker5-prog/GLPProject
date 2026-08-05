import { Modal, Pressable, View } from 'react-native';

import type { LanguageCode } from '@core/domain/types';
import { SUPPORTED_LANGUAGES } from '@i18n/index';
import { useTranslation } from '@i18n/useTranslation';
import { Row, Text } from '@ui/components';
import { Icon } from '@ui/components/Icon';
import { useTheme } from '@ui/theme/ThemeProvider';

/**
 * Language selector. Changing the language re-renders every screen and also
 * changes the language the AI replies in, because the agent receives the
 * setting with every turn.
 */
export function LanguagePicker({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const { t, language, setLanguage } = useTranslation();

  const choose = (code: LanguageCode) => {
    setLanguage(code);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
        onPress={onClose}
        style={{ flex: 1, backgroundColor: theme.overlay, justifyContent: 'flex-end' }}
      >
        <Pressable
          onPress={(event) => event.stopPropagation()}
          style={{
            backgroundColor: theme.surface,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            paddingHorizontal: 20,
            paddingTop: 20,
            paddingBottom: 36,
          }}
        >
          <Row className="mb-4 justify-between">
            <Text variant="heading">{t('settings.language')}</Text>
            <Pressable accessibilityRole="button" onPress={onClose}>
              <Icon name="close" size={22} color={theme.textMuted} />
            </Pressable>
          </Row>

          {SUPPORTED_LANGUAGES.map((option) => {
            const selected = option.code === language;
            return (
              <Pressable
                key={option.code}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => choose(option.code)}
                className={`mb-2 flex-row items-center justify-between rounded-2xl border px-4 py-3.5 ${
                  selected
                    ? 'border-brand-600 bg-brand-50 dark:bg-brand-900/30'
                    : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                <View>
                  <Text variant="bodyStrong">{option.nativeName}</Text>
                  <Text variant="caption">{option.englishName}</Text>
                </View>
                {selected ? <Icon name="check" size={20} color={theme.primary} /> : null}
              </Pressable>
            );
          })}

          <Text variant="caption" className="mt-2">
            Your care coach replies in the language you choose here.
          </Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
