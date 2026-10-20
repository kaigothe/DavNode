import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { Button, Flex, theme, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useTranslation } from 'react-i18next';
import { daysBetween, visibleDays } from '../../lib/calendarLayout';
import { useTodayColors } from './useEventColors';

/**
 * A small month for jumping to a date, like the one in Apple's calendar:
 * today in a red circle, the shown day or week tinted. It shows the month
 * of `date` and moves it by whole months.
 */
export function MiniMonth({
  date,
  weekHighlight,
  today,
  onSelect,
}: {
  date: Dayjs;
  /** Tint the whole week of `date` (week view) instead of just the day. */
  weekHighlight: boolean;
  today: Dayjs;
  onSelect: (date: Dayjs) => void;
}) {
  const { t, i18n } = useTranslation();
  const { token } = theme.useToken();
  const todayColors = useTodayColors();
  const days = visibleDays('month', date);
  const locale = i18n.language;
  const title = new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
  }).format(date.toDate());
  const weekdays = days.slice(0, 7).map((day) => ({
    key: day.format('dd'),
    short: new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(
      day.toDate(),
    ),
    long: new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(
      day.toDate(),
    ),
  }));
  const weekStart = date.startOf('week');
  const inShown = (day: Dayjs) =>
    weekHighlight
      ? daysBetween(weekStart, day) >= 0 && daysBetween(weekStart, day) < 7
      : day.isSame(date, 'day');

  return (
    <section aria-label={t('calendar.miniMonth')}>
      <Flex justify="space-between" align="center" style={{ marginBottom: 8 }}>
        <Typography.Text strong aria-live="polite">
          {title}
        </Typography.Text>
        <Flex gap={2}>
          <Button
            type="text"
            size="small"
            icon={<LeftOutlined />}
            aria-label={t('calendar.previous.month')}
            onClick={() => onSelect(date.subtract(1, 'month'))}
          />
          <Button
            type="text"
            size="small"
            icon={<RightOutlined />}
            aria-label={t('calendar.next.month')}
            onClick={() => onSelect(date.add(1, 'month'))}
          />
        </Flex>
      </Flex>
      <div
        role="group"
        aria-label={title}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 2,
          textAlign: 'center',
        }}
      >
        {weekdays.map((weekday) => (
          <span
            key={weekday.key}
            aria-hidden
            style={{ fontSize: 11, color: token.colorTextSecondary }}
          >
            {weekday.short}
          </span>
        ))}
        {days.map((day) => {
          const isToday = day.isSame(today, 'day');
          const outside = !day.isSame(date, 'month');
          const shown = inShown(day);
          return (
            <div
              key={day.valueOf()}

              style={{ display: 'contents' }}
            >
              <button
                type="button"
                aria-label={new Intl.DateTimeFormat(locale, {
                  dateStyle: 'full',
                }).format(day.toDate())}
                aria-current={isToday ? 'date' : undefined}
                aria-pressed={shown}
                onClick={() => onSelect(dayjs(day))}
                style={{
                  border: 0,
                  cursor: 'pointer',
                  height: 28,
                  borderRadius: isToday ? 14 : 6,
                  fontSize: 12,
                  fontWeight: isToday ? 700 : 400,
                  background: isToday
                    ? todayColors.fill
                    : shown
                      ? token.colorFillSecondary
                      : 'transparent',
                  color: isToday
                    ? '#fff'
                    : outside
                      ? token.colorTextSecondary
                      : token.colorText,
                }}
              >
                {day.date()}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
