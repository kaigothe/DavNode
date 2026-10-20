import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  Button,
  Descriptions,
  Flex,
  Input,
  Result,
  Select,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { LogEntry, LogPage } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { ErrorAlert } from '../../components/ErrorAlert';
import { PageTitle } from '../../components/Headings';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';

/** How often the live mode asks the server for the newest lines. */
export const LIVE_INTERVAL_MS = 3000;

const LEVELS = ['error', 'warn', 'info', 'debug'] as const;
type Level = (typeof LEVELS)[number];
const LIMITS = [100, 200, 500, 1000];

/** The text of the line the read-audit writes when an administrator opens a user's data. */
export const CONTENT_READ_MESSAGE = 'Admin read user content';

const LEVEL_COLOR: Record<string, string> = {
  fatal: 'red',
  error: 'red',
  warn: 'orange',
  info: 'blue',
  debug: 'default',
  trace: 'default',
};

const visuallyHidden = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const;

/** A field value as text: strings as they are, everything else as JSON. */
function show(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

/** The usual request fields on one line: `GET /dav/acme/files 200 12 ms`. */
function summary(fields: Record<string, unknown>): string {
  const parts = [
    fields['method'],
    fields['path'],
    fields['status'],
    typeof fields['durationMs'] === 'number'
      ? `${Math.round(fields['durationMs'])} ms`
      : undefined,
  ].filter((part) => part !== undefined && part !== '');
  return parts.map(String).join(' ');
}

/** The recent server log, from the server's in-memory buffer. Server administrators only. */
export function LogsPage() {
  const { t, i18n } = useTranslation();
  const { me, session, request } = useAuth();
  const [level, setLevel] = useState<Level>('info');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(200);
  const [live, setLive] = useState(false);
  const text = useDebouncedValue(search.trim());

  const enabled = me?.capabilities.logView === true;
  const logs = useQuery({
    queryKey: [session?.tenantSlug, 'logs', level, text, limit],
    enabled,
    queryFn: () =>
      request<LogPage>('/logs', {
        query: { level, q: text === '' ? undefined : text, limit },
      }),
    refetchInterval: live ? LIVE_INTERVAL_MS : false,
    placeholderData: keepPreviousData,
  });

  if (!enabled) {
    return (
      <Result
        status="info"
        title={t('logs.notEnabledTitle')}
        subTitle={t('logs.notEnabledText')}
        extra={<Link to="/">{t('notFound.back')}</Link>}
      />
    );
  }

  const columns: ColumnsType<LogEntry> = [
    {
      title: t('logs.time'),
      dataIndex: 'timestamp',
      width: 120,
      render: (value: string) => (
        <time
          dateTime={value}
          title={new Date(value).toLocaleString(i18n.language)}
        >
          {new Date(value).toLocaleTimeString(i18n.language)}
        </time>
      ),
    },
    {
      title: t('logs.level'),
      dataIndex: 'level',
      width: 100,
      render: (value: string) => (
        <Tag color={LEVEL_COLOR[value] ?? 'default'}>{value}</Tag>
      ),
    },
    {
      title: t('logs.message'),
      key: 'message',
      render: (_, entry) => (
        <Flex vertical>
          <span>{entry.message}</span>
          {summary(entry.fields) !== '' && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {summary(entry.fields)}
            </Typography.Text>
          )}
        </Flex>
      ),
    },
  ];

  return (
    <Flex vertical gap={16}>
      <PageTitle>{t('logs.title')}</PageTitle>
      <Typography.Text type="secondary">{t('logs.hint')}</Typography.Text>
      <Flex gap={12} wrap align="center">
        <Select<Level>
          aria-label={t('logs.level')}
          value={level}
          onChange={setLevel}
          style={{ width: 160 }}
          options={LEVELS.map((value) => ({
            value,
            label: t(`logs.levelFrom.${value}`),
          }))}
        />
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder={t('logs.search')}
          aria-label={t('logs.search')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          style={{ maxWidth: 320 }}
        />
        <Button onClick={() => setSearch(CONTENT_READ_MESSAGE)}>
          {t('logs.adminReads')}
        </Button>
        <Select<number>
          aria-label={t('logs.limit')}
          value={limit}
          onChange={setLimit}
          style={{ width: 150 }}
          options={LIMITS.map((value) => ({
            value,
            label: t('logs.lastN', { count: value }),
          }))}
        />
        <Button
          icon={<ReloadOutlined />}
          loading={logs.isFetching}
          onClick={() => void logs.refetch()}
        >
          {t('logs.refresh')}
        </Button>
        <Flex align="center" gap={8}>
          <Switch
            checked={live}
            onChange={setLive}
            aria-label={t('logs.live')}
          />
          <span aria-hidden>{t('logs.live')}</span>
        </Flex>
      </Flex>
      {logs.isError && (
        <ErrorAlert error={logs.error} onRetry={() => void logs.refetch()} />
      )}
      {logs.data && (
        <Typography.Text type="secondary">
          {t('logs.buffer', {
            shown: logs.data.entries.length,
            buffered: logs.data.buffered,
            capacity: logs.data.capacity,
          })}
        </Typography.Text>
      )}
      <Table<LogEntry>
        rowKey="seq"
        size="small"
        columns={columns}
        dataSource={logs.data?.entries}
        loading={logs.isPending}
        locale={{ emptyText: t('logs.empty') }}
        pagination={{
          pageSize: 50,
          hideOnSinglePage: true,
          showSizeChanger: false,
        }}
        expandable={{
          columnTitle: <span style={visuallyHidden}>{t('logs.details')}</span>,
          expandedRowRender: (entry) => (
            <Descriptions
              size="small"
              column={1}
              bordered
              items={[
                { key: 'seq', label: '#', children: entry.seq },
                {
                  key: 'timestamp',
                  label: t('logs.time'),
                  children: entry.timestamp,
                },
                ...Object.entries(entry.fields).map(([key, value]) => ({
                  key,
                  label: key,
                  children: (
                    <span
                      style={{
                        whiteSpace: 'pre-wrap',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {show(value)}
                    </span>
                  ),
                })),
              ]}
            />
          ),
        }}
      />
    </Flex>
  );
}
