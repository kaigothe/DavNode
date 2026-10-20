import {
  DeleteOutlined,
  CalendarOutlined,
  EditOutlined,
  KeyOutlined,
  LinkOutlined,
  PlusOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  Button,
  Flex,
  Input,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { Providers, User } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { ConfirmDeleteModal } from '../../components/ConfirmDeleteModal';
import { ErrorAlert } from '../../components/ErrorAlert';
import { QuotaBar } from '../../components/QuotaBar';
import { useFeedback } from '../../hooks/useFeedback';
import { useListState } from '../../hooks/useListState';
import { OAuth2Modal, PasswordModal, UserFormModal } from './UserModals';

const ROLE_COLOR = {
  server_admin: 'red',
  tenant_admin: 'blue',
  member: 'default',
} as const;

/** The users of the tenant: search, create, edit, reset the password, link an identity, delete. */
export function UsersPage() {
  const { t, i18n } = useTranslation();
  const { me, session, request } = useAuth();
  const queryClient = useQueryClient();
  const feedback = useFeedback();
  const list = useListState();
  const slug = session?.tenantSlug;

  const users = useQuery({
    queryKey: [slug, 'users', list.params],
    queryFn: () =>
      request<{ users: User[]; total: number }>('/users', {
        query: list.params,
      }),
    placeholderData: keepPreviousData,
  });
  const providers = useQuery({
    queryKey: [slug, 'providers'],
    queryFn: () => request<Providers>('/providers'),
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [passwordFor, setPasswordFor] = useState<User | null>(null);
  const [linkFor, setLinkFor] = useState<User | null>(null);
  const [deleting, setDeleting] = useState<User | null>(null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: [slug, 'users'] });
    void queryClient.invalidateQueries({ queryKey: [slug, 'quota'] });
  };
  const oauth2Enabled =
    providers.data?.providers.some((p) => p.id === 'oauth2' && p.enabled) ??
    false;

  const columns: ColumnsType<User> = [
    {
      title: t('users.username'),
      dataIndex: 'username',
      render: (name: string, user) => (
        <Space>
          <Typography.Text strong>{name}</Typography.Text>
          {user.id === me?.id && <Tag>{t('users.you')}</Tag>}
        </Space>
      ),
    },
    { title: t('users.email'), dataIndex: 'email', responsive: ['md'] },
    {
      title: t('users.role'),
      dataIndex: 'role',
      render: (role: User['role']) => (
        <Tag color={ROLE_COLOR[role]}>{t(`role.${role}`)}</Tag>
      ),
    },
    {
      title: t('users.quota'),
      key: 'quota',
      responsive: ['lg'],
      render: (_, user) => (
        <QuotaBar used={user.quotaUsedBytes} limit={user.quotaLimitBytes} />
      ),
    },
    {
      title: t('users.createdAt'),
      dataIndex: 'createdAt',
      responsive: ['xl'],
      render: (value: string) =>
        new Date(value).toLocaleDateString(i18n.language),
    },
    {
      title: t('common.actions'),
      key: 'actions',
      align: 'right',
      render: (_, user) => (
        <Space size={0}>
          <Tooltip title={t('common.edit')}>
            <Button
              type="text"
              icon={<EditOutlined />}
              aria-label={`${t('common.edit')} ${user.username}`}
              onClick={() => {
                setEditing(user);
                setFormOpen(true);
              }}
            />
          </Tooltip>
          <Tooltip title={t('users.resetPassword')}>
            <Button
              type="text"
              icon={<KeyOutlined />}
              aria-label={`${t('users.resetPassword')} ${user.username}`}
              onClick={() => setPasswordFor(user)}
            />
          </Tooltip>
          {me?.capabilities.contentView && (
            <Tooltip title={t('content.open')}>
              <Link
                to={`/users/${user.id}/content`}
                aria-label={`${t('content.open')} ${user.username}`}
                style={{ display: 'inline-flex', padding: '4px 15px' }}
              >
                <CalendarOutlined />
              </Link>
            </Tooltip>
          )}
          {oauth2Enabled && (
            <Tooltip title={t('users.oauth2')}>
              <Button
                type="text"
                icon={<LinkOutlined />}
                aria-label={`${t('users.oauth2')} ${user.username}`}
                onClick={() => setLinkFor(user)}
              />
            </Tooltip>
          )}
          <Tooltip
            title={
              user.id === me?.id
                ? t('users.cannotDeleteSelf')
                : t('common.delete')
            }
          >
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              disabled={user.id === me?.id}
              aria-label={`${t('common.delete')} ${user.username}`}
              onClick={() => setDeleting(user)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <Flex vertical gap={16}>
      <Flex justify="space-between" align="center" wrap gap={8}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          {t('users.title')}
        </Typography.Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          {t('users.create')}
        </Button>
      </Flex>
      <Input
        allowClear
        prefix={<SearchOutlined />}
        placeholder={t('users.search')}
        aria-label={t('users.search')}
        value={list.search}
        onChange={(event) => list.setSearch(event.target.value)}
        style={{ maxWidth: 360 }}
      />
      {users.isError && (
        <ErrorAlert error={users.error} onRetry={() => void users.refetch()} />
      )}
      <Table<User>
        rowKey="id"
        columns={columns}
        dataSource={users.data?.users}
        loading={users.isFetching}
        scroll={{ x: 'max-content' }}
        pagination={{
          current: list.page,
          pageSize: list.pageSize,
          total: users.data?.total ?? 0,
          showSizeChanger: true,
          onChange: list.setPage,
        }}
      />
      <UserFormModal
        open={formOpen}
        user={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          refresh();
        }}
      />
      <PasswordModal user={passwordFor} onClose={() => setPasswordFor(null)} />
      <OAuth2Modal
        user={linkFor}
        providers={providers.data}
        onClose={() => setLinkFor(null)}
      />
      <ConfirmDeleteModal
        open={deleting !== null}
        title={t('users.deleteTitle', { name: deleting?.username })}
        description={t('users.deleteText')}
        expected={deleting?.username ?? null}
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          try {
            await request(`/users/${deleting?.id}`, {
              method: 'DELETE',
              body: { confirmUsername: deleting?.username },
            });
            feedback.success('users.deleted');
            setDeleting(null);
            refresh();
          } catch (error) {
            feedback.failure(error);
          }
        }}
      />
    </Flex>
  );
}
