import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Badge,
  Button,
  Calendar,
  Empty,
  Flex,
  Grid,
  List,
  Select,
  Skeleton,
  Tag,
  Typography,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Calendar as ApiCalendar, CalendarEvent } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { ErrorAlert } from '../../components/ErrorAlert';
import { dayKey, formatTimeRange, groupByDay } from '../../lib/events';
import { EventDrawer } from './EventDrawer';

const MAX_IN_CELL = 3;

/** A user's calendars: a month view with the events, and the events of the chosen day below it. */
export function CalendarsTab({ userId }: { userId: string }) {
  const { t, i18n } = useTranslation();
  const { session, request } = useAuth();
  const screens = Grid.useBreakpoint();
  const slug = session?.tenantSlug;

  const calendars = useQuery({
    queryKey: [slug, 'content', userId, 'calendars'],
    queryFn: () =>
      request<{ calendars: ApiCalendar[] }>(`/users/${userId}/calendars`),
  });
  const [chosen, setChosen] = useState<string | undefined>();
  const calendarId = chosen ?? calendars.data?.calendars[0]?.id;
  const calendar = calendars.data?.calendars.find((c) => c.id === calendarId);

  const [value, setValue] = useState<Dayjs>(() => dayjs());
  const [open, setOpen] = useState<CalendarEvent | null>(null);
  // The month grid shows days of the neighbouring months too.
  const from = value
    .startOf('month')
    .subtract(7, 'day')
    .startOf('day')
    .toISOString();
  const to = value.endOf('month').add(8, 'day').startOf('day').toISOString();

  const events = useQuery({
    queryKey: [slug, 'content', userId, 'events', calendarId, from, to],
    enabled: calendarId !== undefined,
    queryFn: () =>
      request<{ events: CalendarEvent[]; truncated: boolean; skipped: number }>(
        `/users/${userId}/calendars/${calendarId}/events`,
        { query: { from, to } },
      ),
  });
  const days = useMemo(
    () => groupByDay(events.data?.events ?? []),
    [events.data],
  );
  const todays = days.get(dayKey(value)) ?? [];
  const fullscreen = screens.md ?? false;

  if (calendars.isPending) {
    return <Skeleton active />;
  }
  if (calendars.isError) {
    return (
      <ErrorAlert
        error={calendars.error}
        onRetry={() => void calendars.refetch()}
      />
    );
  }
  if (calendars.data.calendars.length === 0) {
    return <Empty description={t('content.noCalendars')} />;
  }

  return (
    <Flex vertical gap={16}>
      <Flex gap={12} align="center" wrap>
        <Typography.Text id="calendar-select-label">
          {t('content.calendar')}
        </Typography.Text>
        <Select<string>
          aria-labelledby="calendar-select-label"
          value={calendarId}
          onChange={setChosen}
          style={{ minWidth: 220 }}
          options={calendars.data.calendars.map((c) => ({
            value: c.id,
            label: `${c.displayName} (${t('content.objects', { count: c.objectCount })})`,
          }))}
        />
        {calendar?.timezone && <Tag>{calendar.timezone}</Tag>}
        <Typography.Text type="secondary">
          {t('content.timeZoneNote', {
            zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          })}
        </Typography.Text>
      </Flex>
      {events.data?.truncated && (
        <Alert type="warning" showIcon message={t('content.truncated')} />
      )}
      {(events.data?.skipped ?? 0) > 0 && (
        <Alert
          type="warning"
          showIcon
          message={t('content.skipped', { count: events.data?.skipped })}
        />
      )}
      {events.isError && (
        <ErrorAlert
          error={events.error}
          onRetry={() => void events.refetch()}
        />
      )}
      <Calendar
        value={value}
        fullscreen={fullscreen}
        onSelect={(date) => setValue(date)}
        onPanelChange={(date) => setValue(date)}
        cellRender={(date, info) => {
          if (info.type !== 'date') {
            return info.originNode;
          }
          const list = days.get(dayKey(date)) ?? [];
          if (list.length === 0) {
            return null;
          }
          if (!fullscreen) {
            return <Badge status="processing" aria-hidden />;
          }
          return (
            <ul
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
                fontSize: 12,
                textAlign: 'start',
              }}
              aria-hidden
            >
              {list.slice(0, MAX_IN_CELL).map((event, index) => (
                <li
                  key={`${event.objectId}-${index}`}
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <Badge status={event.isAllDay ? 'warning' : 'processing'} />
                  {event.summary ?? t('content.untitled')}
                </li>
              ))}
              {list.length > MAX_IN_CELL && (
                <li>
                  {t('content.more', { count: list.length - MAX_IN_CELL })}
                </li>
              )}
            </ul>
          );
        }}
      />
      <div>
        <Typography.Title level={5}>
          {t('content.agenda', {
            date: new Intl.DateTimeFormat(i18n.language, {
              dateStyle: 'full',
            }).format(value.toDate()),
          })}
        </Typography.Title>
        {events.isFetching && todays.length === 0 ? (
          <Skeleton active paragraph={{ rows: 2 }} />
        ) : (
          <List
            bordered
            locale={{ emptyText: t('content.noEvents') }}
            dataSource={todays}
            renderItem={(event) => (
              <List.Item
                key={`${event.objectId}-${event.start}`}
                actions={[
                  <Button
                    key="open"
                    type="link"
                    aria-label={`${t('content.details')}: ${event.summary ?? t('content.untitled')}`}
                    onClick={() => setOpen(event)}
                  >
                    {t('content.details')}
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  title={event.summary ?? t('content.untitled')}
                  description={[
                    event.isAllDay
                      ? t('content.allDay')
                      : formatTimeRange(event, i18n.language, dayKey(value)) ||
                        t('content.allDay'),
                    event.location,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                />
                {event.status === 'cancelled' && (
                  <Tag color="red">{t('content.statusValue.cancelled')}</Tag>
                )}
              </List.Item>
            )}
          />
        )}
      </div>
      <EventDrawer
        event={open}
        userId={userId}
        calendarId={calendarId ?? ''}
        onClose={() => setOpen(null)}
      />
    </Flex>
  );
}
