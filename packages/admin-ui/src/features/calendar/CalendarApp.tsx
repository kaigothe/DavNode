import { useQueries, useQuery } from '@tanstack/react-query';
import { Alert, Collapse, Empty, Flex, Grid, Skeleton, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Calendar as ApiCalendar, CalendarEvent } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { ErrorAlert } from '../../components/ErrorAlert';
import {
  visibleDays,
  type CalendarView,
  type ViewEvent,
} from '../../lib/calendarLayout';
import { EventDrawer } from '../content/EventDrawer';
import { CalendarList, type CalendarEntry } from './CalendarList';
import { CalendarToolbar, periodTitle } from './CalendarToolbar';
import { MiniMonth } from './MiniMonth';
import { MonthView } from './MonthView';
import { TimeGrid } from './TimeGrid';
import { calendarColor } from './useEventColors';
import { useNow } from './useNow';

interface EventsAnswer {
  events: CalendarEvent[];
  truncated: boolean;
  skipped: number;
}

const STEP: Record<CalendarView, 'day' | 'week' | 'month'> = {
  day: 'day',
  week: 'week',
  month: 'month',
};

/**
 * A user's calendars the way Apple's calendar app shows them: a toolbar with
 * Day / Week / Month, a sidebar with a mini month and the calendars (several
 * on top of each other, each in its colour) and the events as blocks in a time
 * grid or as a month. Clicking an event opens its details in the drawer.
 */
export function CalendarApp({ userId }: { userId: string }) {
  const { t, i18n } = useTranslation();
  const { session, request } = useAuth();
  const screens = Grid.useBreakpoint();
  const wide = screens.lg ?? false;
  const slug = session?.tenantSlug;
  const now = useNow();
  const today = now.startOf('day');

  const [view, setView] = useState<CalendarView>(
    screens.md === false ? 'day' : 'week',
  );
  const [date, setDate] = useState<Dayjs>(() => dayjs().startOf('day'));
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [open, setOpen] = useState<ViewEvent | null>(null);

  const calendars = useQuery({
    queryKey: [slug, 'content', userId, 'calendars'],
    queryFn: () =>
      request<{ calendars: ApiCalendar[] }>(`/users/${userId}/calendars`),
  });
  const entries: CalendarEntry[] = useMemo(
    () =>
      (calendars.data?.calendars ?? []).map((calendar, index) => ({
        id: calendar.id,
        name: calendar.displayName,
        color: calendarColor(calendar.color, index),
      })),
    [calendars.data],
  );

  // The language decides which day a week starts on.
  const language = i18n.language;
  const days = useMemo(
    () => visibleDays(view, date),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view, date, language],
  );
  const from = days[0]?.startOf('day').toISOString() ?? '';
  const to =
    days[days.length - 1]?.add(1, 'day').startOf('day').toISOString() ?? '';
  const shown = entries.filter((entry) => !hidden.has(entry.id));

  const answers = useQueries({
    queries: shown.map((entry) => ({
      queryKey: [slug, 'content', userId, 'events', entry.id, from, to],
      enabled: from !== '',
      queryFn: () =>
        request<EventsAnswer>(`/users/${userId}/calendars/${entry.id}/events`, {
          query: { from, to },
        }),
    })),
  });

  // Cheap to rebuild: a few hundred events at most, and `answers` is a new
  // array on every render anyway.
  const events: ViewEvent[] = shown.flatMap((entry, index) =>
    (answers[index]?.data?.events ?? []).map((event, n) => ({
      ...event,
      key: `${entry.id}:${event.objectId}:${event.start}:${n}`,
      calendarId: entry.id,
      calendarName: entry.name,
      color: entry.color,
    })),
  );
  const truncated = answers.some((a) => a.data?.truncated);
  const skipped = answers.reduce((sum, a) => sum + (a.data?.skipped ?? 0), 0);
  const failed = answers.find((a) => a.isError);

  if (calendars.isPending) {
    return <Skeleton active title={false} />;
  }
  if (calendars.isError) {
    return (
      <ErrorAlert
        error={calendars.error}
        onRetry={() => void calendars.refetch()}
      />
    );
  }
  if (entries.length === 0) {
    return <Empty description={t('content.noCalendars')} />;
  }

  const move = (direction: 1 | -1) =>
    setDate((d) => d.add(direction, STEP[view]));
  const openDay = (day: Dayjs) => {
    setDate(day);
    setView('day');
  };
  const toggle = (id: string) =>
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  const sidebar = (
    <Flex vertical gap={20}>
      <MiniMonth
        date={date}
        weekHighlight={view === 'week'}
        today={today}
        onSelect={setDate}
      />
      <CalendarList calendars={entries} hidden={hidden} onToggle={toggle} />
    </Flex>
  );

  return (
    <Flex vertical gap={12}>
      <Typography.Text type="secondary">
        {t('content.timeZoneNote', {
          zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        })}
      </Typography.Text>
      {truncated && (
        <Alert type="warning" showIcon message={t('content.truncated')} />
      )}
      {skipped > 0 && (
        <Alert
          type="warning"
          showIcon
          message={t('content.skipped', { count: skipped })}
        />
      )}
      {failed?.isError && (
        <ErrorAlert
          error={failed.error}
          onRetry={() => answers.forEach((a) => void a.refetch())}
        />
      )}
      <Flex gap={16} align="flex-start">
        {wide ? (
          <aside
            aria-label={t('calendar.sidebar')}
            style={{ width: 232, flex: 'none' }}
          >
            {sidebar}
          </aside>
        ) : null}
        <Flex vertical gap={12} style={{ flex: 1, minWidth: 0 }}>
          {!wide && (
            <Collapse
              size="small"
              items={[
                {
                  key: 'sidebar',
                  label: t('calendar.calendars'),
                  children: sidebar,
                },
              ]}
            />
          )}
          <CalendarToolbar
            view={view}
            title={periodTitle(view, days, i18n.language)}
            onView={setView}
            onToday={() => setDate(dayjs().startOf('day'))}
            onPrevious={() => move(-1)}
            onNext={() => move(1)}
          />
          {view === 'month' ? (
            <MonthView
              days={days}
              month={date}
              today={today}
              events={events}
              onOpenEvent={setOpen}
              onOpenDay={openDay}
            />
          ) : (
            <TimeGrid
              days={days}
              today={today}
              now={now}
              events={events}
              onOpenEvent={setOpen}
              onOpenDay={openDay}
            />
          )}
        </Flex>
      </Flex>
      <EventDrawer event={open} userId={userId} onClose={() => setOpen(null)} />
    </Flex>
  );
}
