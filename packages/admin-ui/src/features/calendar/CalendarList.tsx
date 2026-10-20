import { Flex, theme, Typography } from 'antd';
import { useTranslation } from 'react-i18next';

/** A calendar as the sidebar lists it. */
export interface CalendarEntry {
  id: string;
  name: string;
  color: string;
}

/**
 * The calendars of the user with a coloured check mark each, like Apple's
 * sidebar. Switching one off hides its events; several can be shown at once
 * and are laid over each other.
 */
export function CalendarList({
  calendars,
  hidden,
  onToggle,
}: {
  calendars: readonly CalendarEntry[];
  hidden: ReadonlySet<string>;
  onToggle: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  return (
    <section aria-label={t('calendar.calendars')}>
      <Typography.Text
        strong
        style={{
          display: 'block',
          marginBottom: 8,
          color: token.colorTextSecondary,
        }}
      >
        {t('calendar.calendars')}
      </Typography.Text>
      <Flex vertical gap={6}>
        {calendars.map((calendar) => (
          <label
            key={calendar.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={!hidden.has(calendar.id)}
              onChange={() => onToggle(calendar.id)}
              style={{
                accentColor: calendar.color,
                width: 16,
                height: 16,
                margin: 0,
              }}
            />
            <span style={{ overflowWrap: 'anywhere' }}>{calendar.name}</span>
          </label>
        ))}
      </Flex>
    </section>
  );
}
