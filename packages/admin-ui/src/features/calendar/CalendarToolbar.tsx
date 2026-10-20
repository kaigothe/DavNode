import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { Button, Flex, Segmented, Space, Typography } from 'antd';
import type { Dayjs } from 'dayjs';
import { useTranslation } from 'react-i18next';
import type { CalendarView } from '../../lib/calendarLayout';

/** The title of the shown period, written the way people say it ("October 2026", "12 – 18 Oct 2026"). */
export function periodTitle(
  view: CalendarView,
  days: readonly Dayjs[],
  locale: string,
): string {
  const first = days[0];
  const last = days[days.length - 1];
  if (!first || !last) {
    return '';
  }
  if (view === 'month') {
    // The month the user navigated to is the one in the middle of the grid.
    const middle = days[Math.floor(days.length / 2)] ?? first;
    return new Intl.DateTimeFormat(locale, {
      month: 'long',
      year: 'numeric',
    }).format(middle.toDate());
  }
  if (view === 'day') {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(
      first.toDate(),
    );
  }
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).formatRange(first.toDate(), last.toDate());
}

/** Today, back and forward, the title and the Day / Week / Month switch. */
export function CalendarToolbar({
  view,
  title,
  onView,
  onToday,
  onPrevious,
  onNext,
}: {
  view: CalendarView;
  title: string;
  onView: (view: CalendarView) => void;
  onToday: () => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Flex justify="space-between" align="center" gap={12} wrap>
      <Flex align="center" gap={12} wrap>
        <Space.Compact>
          <Button
            icon={<LeftOutlined />}
            aria-label={t(`calendar.previous.${view}`)}
            onClick={onPrevious}
          />
          <Button onClick={onToday}>{t('calendar.today')}</Button>
          <Button
            icon={<RightOutlined />}
            aria-label={t(`calendar.next.${view}`)}
            onClick={onNext}
          />
        </Space.Compact>
        <Typography.Title
          level={2}
          aria-live="polite"
          style={{ margin: 0, fontSize: 20, fontWeight: 600 }}
        >
          {title}
        </Typography.Title>
      </Flex>
      <Segmented<CalendarView>
        aria-label={t('calendar.view')}
        value={view}
        onChange={onView}
        options={[
          { value: 'day', label: t('calendar.views.day') },
          { value: 'week', label: t('calendar.views.week') },
          { value: 'month', label: t('calendar.views.month') },
        ]}
      />
    </Flex>
  );
}
