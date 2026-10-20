import {
  ArrowLeftOutlined,
  CalendarOutlined,
  DeleteOutlined,
  EditOutlined,
  KeyOutlined,
  LinkOutlined,
} from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  Descriptions,
  Flex,
  Skeleton,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import {
  ApiError,
  type Providers,
  type QuotaOverview,
  type User,
  type UserGroup,
} from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { Avatar } from '../../components/Avatar';
import { ConfirmDeleteModal } from '../../components/ConfirmDeleteModal';
import { ErrorAlert } from '../../components/ErrorAlert';
import { PageTitle } from '../../components/Headings';
import { QuotaBar } from '../../components/QuotaBar';
import { QuotaLimitModal } from '../../components/QuotaLimitModal';
import { useFeedback } from '../../hooks/useFeedback';
import { NotFoundPage } from '../StatusPages';
import { OAuth2Modal, PasswordModal, UserFormModal } from './UserModals';

const ROLE_COLOR = {
  server_admin: 'red',
  tenant_admin: 'blue',
  member: 'default',
} as const;

/** One user: account, storage, the groups they are in, and every action on them. */
export function UserDetailPage() {
  const { t, i18n } = useTranslation();
  const { userId = '' } = useParams();
  const { me, session, request } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const feedback = useFeedback();
  const slug = session?.tenantSlug;

  const user = useQuery({
    queryKey: [slug, 'user', userId],
    queryFn: () => request<User>(`/users/${userId}`),
  });
  const groups = useQuery({
    queryKey: [slug, 'user', userId, 'groups'],
    queryFn: () => request<{ groups: UserGroup[] }>(`/users/${userId}/groups`),
  });
  const providers = useQuery({
    queryKey: [slug, 'providers'],
    queryFn: () => request<Providers>('/providers'),
  });

  const [editing, setEditing] = useState(false);
  const [passwordFor, setPasswordFor] = useState<User | null>(null);
  const [linkFor, setLinkFor] = useState<User | null>(null);
  const [limiting, setLimiting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (user.error instanceof ApiError && user.error.status === 404) {
    return <NotFoundPage />;
  }
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: [slug, 'user', userId] });
    void queryClient.invalidateQueries({ queryKey: [slug, 'users'] });
    void queryClient.invalidateQueries({ queryKey: [slug, 'quota'] });
  };
  const oauth2Enabled =
    providers.data?.providers.some((p) => p.id === 'oauth2' && p.enabled) ??
    false;
  const target = user.data;
  const isSelf = target?.id === me?.id;

  const columns: ColumnsType<UserGroup> = [
    {
      title: t('groups.name'),
      dataIndex: 'name',
      render: (name: string, group) => (
        <Link to={`/groups/${group.id}`}>{name}</Link>
      ),
    },
    {
      title: t('groups.description'),
      dataIndex: 'description',
      responsive: ['md'],
      render: (value: string | null) => value ?? '—',
    },
    {
      title: t('userDetail.membership'),
      key: 'membership',
      render: (_, group) => (
        <Flex gap={4} wrap>
          {group.direct && <Tag color="blue">{t('userDetail.direct')}</Tag>}
          {group.via.length > 0 && (
            <Tag>{t('userDetail.via', { groups: group.via.join(', ') })}</Tag>
          )}
        </Flex>
      ),
    },
  ];

  return (
    <Flex vertical gap={16}>
      <Link to="/users">
        <ArrowLeftOutlined /> {t('userDetail.back')}
      </Link>
      {user.isPending && <Skeleton active title={false} />}
      {user.isError && (
        <ErrorAlert error={user.error} onRetry={() => void user.refetch()} />
      )}
      {target && (
        <>
          <Flex justify="space-between" align="center" wrap gap={12}>
            <Flex align="center" gap={12}>
              <Avatar name={target.username} size={56} />
              <div>
                <PageTitle>{target.username}</PageTitle>
                <Flex gap={8} align="center">
                  <Tag color={ROLE_COLOR[target.role]}>
                    {t(`role.${target.role}`)}
                  </Tag>
                  {isSelf && <Tag>{t('users.you')}</Tag>}
                </Flex>
              </div>
            </Flex>
            <Flex gap={8} wrap>
              <Button icon={<EditOutlined />} onClick={() => setEditing(true)}>
                {t('common.edit')}
              </Button>
              <Button
                icon={<KeyOutlined />}
                onClick={() => setPasswordFor(target)}
              >
                {t('users.resetPassword')}
              </Button>
              {oauth2Enabled && (
                <Button
                  icon={<LinkOutlined />}
                  onClick={() => setLinkFor(target)}
                >
                  {t('users.oauth2')}
                </Button>
              )}
              {me?.capabilities.contentView && (
                <Link to={`/users/${target.id}/content`}>
                  <Button icon={<CalendarOutlined />}>
                    {t('content.open')}
                  </Button>
                </Link>
              )}
              <Button
                danger
                icon={<DeleteOutlined />}
                disabled={isSelf}
                onClick={() => setDeleting(true)}
              >
                {t('common.delete')}
              </Button>
            </Flex>
          </Flex>

          <Card title={t('userDetail.account')}>
            <Descriptions column={{ xs: 1, md: 2 }}>
              <Descriptions.Item label={t('users.username')}>
                {target.username}
              </Descriptions.Item>
              <Descriptions.Item label={t('users.email')}>
                {target.email}
              </Descriptions.Item>
              <Descriptions.Item label={t('users.role')}>
                {t(`role.${target.role}`)}
              </Descriptions.Item>
              <Descriptions.Item label={t('users.createdAt')}>
                {new Date(target.createdAt).toLocaleString(i18n.language)}
              </Descriptions.Item>
            </Descriptions>
          </Card>

          <Card
            title={t('userDetail.storage')}
            extra={
              <Button icon={<EditOutlined />} onClick={() => setLimiting(true)}>
                {t('quota.editLimit')}
              </Button>
            }
          >
            <QuotaBar
              used={target.quotaUsedBytes}
              limit={target.quotaLimitBytes}
            />
          </Card>

          <Card title={t('userDetail.groups')}>
            {groups.isError ? (
              <ErrorAlert
                error={groups.error}
                onRetry={() => void groups.refetch()}
              />
            ) : (
              <Table<UserGroup>
                rowKey="id"
                columns={columns}
                dataSource={groups.data?.groups}
                loading={groups.isPending}
                pagination={false}
                locale={{ emptyText: t('userDetail.noGroups') }}
              />
            )}
            <Typography.Paragraph
              type="secondary"
              style={{ margin: '12px 0 0' }}
            >
              {t('userDetail.groupsHint')}
            </Typography.Paragraph>
          </Card>

          <UserFormModal
            open={editing}
            user={target}
            onClose={() => setEditing(false)}
            onSaved={() => {
              setEditing(false);
              refresh();
            }}
          />
          <PasswordModal
            user={passwordFor}
            onClose={() => setPasswordFor(null)}
          />
          <OAuth2Modal
            user={linkFor}
            providers={providers.data}
            onClose={() => setLinkFor(null)}
          />
          <QuotaLimitModal
            open={limiting}
            title={t('quota.userTitle', { name: target.username })}
            value={target.quotaLimitBytes}
            onClose={() => setLimiting(false)}
            onSave={async (limit) => {
              try {
                await request<QuotaOverview | User>(`/users/${target.id}`, {
                  method: 'PATCH',
                  body: { quotaLimitBytes: limit },
                });
                feedback.success('quota.saved');
                setLimiting(false);
                refresh();
              } catch (error) {
                feedback.failure(error);
              }
            }}
          />
          <ConfirmDeleteModal
            open={deleting}
            title={t('users.deleteTitle', { name: target.username })}
            description={t('users.deleteText')}
            expected={target.username}
            onCancel={() => setDeleting(false)}
            onConfirm={async () => {
              try {
                await request(`/users/${target.id}`, {
                  method: 'DELETE',
                  body: { confirmUsername: target.username },
                });
                feedback.success('users.deleted');
                queryClient.removeQueries({
                  queryKey: [slug, 'user', userId],
                });
                void queryClient.invalidateQueries({
                  queryKey: [slug, 'users'],
                });
                void queryClient.invalidateQueries({
                  queryKey: [slug, 'quota'],
                });
                void navigate('/users');
              } catch (error) {
                feedback.failure(error);
              }
            }}
          />
        </>
      )}
    </Flex>
  );
}
