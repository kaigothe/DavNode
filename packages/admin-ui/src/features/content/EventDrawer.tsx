import { useQuery } from '@tanstack/react-query';
import {
  Button,
  Descriptions,
  Drawer,
  Flex,
  Input,
  Skeleton,
  Tag,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CalendarEvent } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { ErrorAlert } from '../../components/ErrorAlert';
import { formatWhen } from '../../lib/events';

/** The window that contains exactly this instance, so the server can return its stored text. */
function instanceWindow(event: CalendarEvent) {
  const start = dayjs(event.start);
  const end = dayjs(event.end);
  return {
    from: start.toISOString(),
    to: (end.isAfter(start) ? end : start.add(1, 'minute')).toISOString(),
  };
}

/** One event with everything the server knows about it. The text is shown as text, never as markup. */
export function EventDrawer({
  event,
  userId,
  calendarId,
  onClose,
}: {
  event: CalendarEvent | null;
  userId: string;
  calendarId: string;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { session, request } = useAuth();
  const [showRaw, setShowRaw] = useState(false);

  const raw = useQuery({
    queryKey: [
      session?.tenantSlug,
      'event-raw',
      calendarId,
      event?.objectId,
      event?.start,
    ],
    enabled: showRaw && event !== null,
    queryFn: async () => {
      const result = await request<{ events: CalendarEvent[] }>(
        `/users/${userId}/calendars/${calendarId}/events`,
        { query: { ...instanceWindow(event as CalendarEvent), raw: true } },
      );
      return (
        result.events.find((e) => e.objectId === event?.objectId)?.raw ?? null
      );
    },
  });

  return (
    <Drawer
      open={event !== null}
      onClose={() => {
        setShowRaw(false);
        onClose();
      }}
      title={event?.summary ?? t('content.untitled')}
      size="large"
      destroyOnHidden
    >
      {event && (
        <Flex vertical gap={16}>
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label={t('content.when')}>
              {formatWhen(event, i18n.language)}
            </Descriptions.Item>
            {event.location && (
              <Descriptions.Item label={t('content.where')}>
                {event.location}
              </Descriptions.Item>
            )}
            {event.description && (
              <Descriptions.Item label={t('content.description')}>
                <Typography.Text style={{ whiteSpace: 'pre-wrap' }}>
                  {event.description}
                </Typography.Text>
              </Descriptions.Item>
            )}
            <Descriptions.Item label={t('content.show')}>
              {event.transparency === 'transparent'
                ? t('content.free')
                : t('content.busy')}
            </Descriptions.Item>
            <Descriptions.Item label={t('content.status')}>
              {event.status ? t(`content.statusValue.${event.status}`) : '—'}
            </Descriptions.Item>
            <Descriptions.Item label={t('content.kind')}>
              <Flex gap={4} wrap>
                {event.isAllDay && <Tag>{t('content.allDay')}</Tag>}
                {event.isRecurring && <Tag>{t('content.recurring')}</Tag>}
                {event.isOverride && (
                  <Tag color="orange">{t('content.override')}</Tag>
                )}
              </Flex>
            </Descriptions.Item>
            <Descriptions.Item label="UID">
              <Typography.Text copyable code>
                {event.uid}
              </Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label={t('content.file')}>
              {event.name}
            </Descriptions.Item>
          </Descriptions>
          <div>
            <Button onClick={() => setShowRaw((value) => !value)}>
              {showRaw ? t('content.hideRaw') : t('content.showRaw')}
            </Button>
          </div>
          {showRaw && raw.isPending && <Skeleton active />}
          {showRaw && raw.isError && (
            <ErrorAlert error={raw.error} onRetry={() => void raw.refetch()} />
          )}
          {showRaw && raw.data !== undefined && (
            <Input.TextArea
              readOnly
              rows={12}
              value={raw.data ?? t('content.rawMissing')}
              aria-label={t('content.rawLabel')}
              style={{ fontFamily: 'monospace', fontSize: 12 }}
              spellCheck={false}
            />
          )}
        </Flex>
      )}
    </Drawer>
  );
}
