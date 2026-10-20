import {
  ArrowLeftOutlined,
  DeleteOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  Button,
  Card,
  Flex,
  Select,
  Skeleton,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { ApiError, type Group, type Member, type User } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { ErrorAlert } from '../../components/ErrorAlert';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useFeedback } from '../../hooks/useFeedback';
import { NotFoundPage } from '../StatusPages';
import { PageTitle } from '../../components/Headings';

interface Candidate {
  principalId: string;
  kind: 'user' | 'group';
  name: string;
}

/** One group: its description and its direct and effective members. */
export function GroupDetailPage() {
  const { t } = useTranslation();
  const { groupId } = useParams();
  const { session, request } = useAuth();
  const queryClient = useQueryClient();
  const feedback = useFeedback();
  const slug = session?.tenantSlug;

  const group = useQuery({
    queryKey: [slug, 'group', groupId],
    queryFn: () => request<Group>(`/groups/${groupId}`),
  });
  const direct = useQuery({
    queryKey: [slug, 'group', groupId, 'members'],
    queryFn: () => request<{ members: Member[] }>(`/groups/${groupId}/members`),
  });
  const effective = useQuery({
    queryKey: [slug, 'group', groupId, 'effective'],
    queryFn: () =>
      request<{ members: Member[] }>(`/groups/${groupId}/members/effective`),
  });

  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search.trim());
  const [selected, setSelected] = useState<string | undefined>();
  const [adding, setAdding] = useState(false);

  const candidates = useQuery({
    queryKey: [slug, 'member-candidates', debounced],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<Candidate[]> => {
      const query = { limit: 20, q: debounced === '' ? undefined : debounced };
      const [users, groups] = await Promise.all([
        request<{ users: User[] }>('/users', { query }),
        request<{ groups: Group[] }>('/groups', { query }),
      ]);
      return [
        ...users.users.map((u) => ({
          principalId: u.principalId,
          kind: 'user' as const,
          name: u.username,
        })),
        ...groups.groups
          .filter((g) => g.id !== groupId)
          .map((g) => ({
            principalId: g.principalId,
            kind: 'group' as const,
            name: g.name,
          })),
      ];
    },
  });

  if (group.error instanceof ApiError && group.error.status === 404) {
    return <NotFoundPage />;
  }

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: [slug, 'group', groupId] });
  };
  const directIds = new Set(direct.data?.members.map((m) => m.principalId));

  const add = async () => {
    if (!selected) {
      return;
    }
    setAdding(true);
    try {
      await request(`/groups/${groupId}/members`, {
        method: 'POST',
        body: { principalId: selected },
      });
      feedback.success('groups.memberAdded');
      setSelected(undefined);
      refresh();
    } catch (error) {
      feedback.failure(error);
    } finally {
      setAdding(false);
    }
  };

  const remove = async (member: Member) => {
    try {
      await request(`/groups/${groupId}/members/${member.principalId}`, {
        method: 'DELETE',
      });
      feedback.success('groups.memberRemoved');
      refresh();
    } catch (error) {
      feedback.failure(error);
    }
  };

  const kindTag = (kind: Member['kind']) =>
    kind === 'group' ? (
      <Tag icon={<TeamOutlined />}>{t('groups.kindGroup')}</Tag>
    ) : (
      <Tag icon={<UserOutlined />}>{t('groups.kindUser')}</Tag>
    );

  const columns = (withRemove: boolean): ColumnsType<Member> => [
    {
      title: t('groups.name'),
      dataIndex: 'name',
      render: (name: string | null) => name ?? '—',
    },
    { title: t('groups.kind'), dataIndex: 'kind', render: kindTag },
    ...(withRemove
      ? [
          {
            title: t('common.actions'),
            key: 'actions',
            align: 'right' as const,
            render: (_: unknown, member: Member) => (
              <Tooltip title={t('groups.removeMember')}>
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  aria-label={`${t('groups.removeMember')} ${member.name ?? ''}`}
                  onClick={() => void remove(member)}
                />
              </Tooltip>
            ),
          },
        ]
      : []),
  ];

  return (
    <Flex vertical gap={16}>
      <Link to="/groups">
        <ArrowLeftOutlined /> {t('groups.back')}
      </Link>
      {group.isPending && <Skeleton active title={false} />}
      {group.isError && (
        <ErrorAlert error={group.error} onRetry={() => void group.refetch()} />
      )}
      {group.data && (
        <>
          <div>
            <PageTitle>{group.data.name}</PageTitle>
            {group.data.description && (
              <Typography.Text type="secondary">
                {group.data.description}
              </Typography.Text>
            )}
          </div>
          <Card title={t('groups.addMember')}>
            <Flex gap={8} wrap>
              <Select<string>
                showSearch
                allowClear
                value={selected}
                placeholder={t('groups.memberPlaceholder')}
                aria-label={t('groups.addMember')}
                style={{ minWidth: 260, flex: 1, maxWidth: 420 }}
                filterOption={false}
                onSearch={setSearch}
                onChange={setSelected}
                loading={candidates.isFetching}
                options={(candidates.data ?? [])
                  .filter((c) => !directIds.has(c.principalId))
                  .map((c) => ({
                    value: c.principalId,
                    label: `${c.name} (${t(c.kind === 'group' ? 'groups.kindGroup' : 'groups.kindUser')})`,
                  }))}
              />
              <Button
                type="primary"
                disabled={!selected}
                loading={adding}
                onClick={() => void add()}
              >
                {t('common.add')}
              </Button>
            </Flex>
          </Card>
          <Tabs
            items={[
              {
                key: 'direct',
                label: `${t('groups.directMembers')} (${direct.data?.members.length ?? 0})`,
                children: (
                  <Table<Member>
                    rowKey="principalId"
                    columns={columns(true)}
                    dataSource={direct.data?.members}
                    loading={direct.isFetching}
                    pagination={false}
                  />
                ),
              },
              {
                key: 'effective',
                label: `${t('groups.effectiveMembers')} (${effective.data?.members.length ?? 0})`,
                children: (
                  <Flex vertical gap={8}>
                    <Typography.Text type="secondary">
                      {t('groups.effectiveHint')}
                    </Typography.Text>
                    <Table<Member>
                      rowKey="principalId"
                      columns={columns(false)}
                      dataSource={effective.data?.members}
                      loading={effective.isFetching}
                      pagination={false}
                    />
                  </Flex>
                ),
              },
            ]}
          />
        </>
      )}
    </Flex>
  );
}
