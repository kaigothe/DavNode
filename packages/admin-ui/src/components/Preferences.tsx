import { GlobalOutlined } from '@ant-design/icons';
import { Segmented, Select, Space } from 'antd';
import { useTranslation } from 'react-i18next';
import { LANGUAGES, setLanguage, type Language } from '../i18n';
import { useTheme, type ThemeMode } from '../theme/ThemeContext';

const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  de: 'Deutsch',
};

/** Language and theme pickers, shown on the login page and in the header. */
export function Preferences() {
  const { t, i18n } = useTranslation();
  const { mode, setMode } = useTheme();

  return (
    <Space wrap>
      <Select<Language>
        aria-label={t('prefs.language')}
        value={i18n.language as Language}
        onChange={(language) => void setLanguage(language)}
        suffixIcon={<GlobalOutlined />}
        style={{ width: 130 }}
        options={LANGUAGES.map((value) => ({
          value,
          label: LANGUAGE_NAMES[value],
        }))}
      />
      <Segmented<ThemeMode>
        aria-label={t('prefs.theme')}
        value={mode}
        onChange={setMode}
        options={[
          { value: 'system', label: t('prefs.themeSystem') },
          { value: 'light', label: t('prefs.themeLight') },
          { value: 'dark', label: t('prefs.themeDark') },
        ]}
      />
    </Space>
  );
}
