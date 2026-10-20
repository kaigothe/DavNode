import { EditOutlined, ReloadOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Flex, Table, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { QuotaOverview } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { ErrorAlert } from '../../components/ErrorAlert';
import { QuotaBar } from '../../components/QuotaBar';
import { QuotaLimitModal } from '../../components/QuotaLimitModal';
import { useFeedback } from '../../hooks/useFeedback';
import { PageTitle } from '../../components/Headings';

type QuotaUser = QuotaOverview['users'][number];

/** Storage use of the tenant and its users, with limits and a recount. */
export function QuotaPage() {
  const { t } = useTranslation();
  const { me, session, request } = useAuth();
  const queryClient = useQueryClient();
  const feedback = useFeedback();
  const slug = session?.tenantSlug;
  const isServerAdmin = me?.role === 'server_admin';

  const quota = useQuery({
    queryKey: [slug, 'quota'],
    queryFn: () => request<QuotaOverview>('/quota'),
  });
  const [editTenant, setEditTenant] = useState(false);
  const [editUser, setEditUser] = useState<QuotaUser | null>(null);
  const [recounting, setRecounting] = useState(false);

  const show = (overview: QuotaOverview) => {
    queryClient.setQueryData([slug, 'quota'], overview);
    // The user list and the tenant list carry the same figures.
    void queryClient.invalidateQueries({ queryKey: [slug, 'users'] });
    void queryClient.invalidateQueries({ queryKey: [slug, 'tenants'] });
  };

  const recompute = async () => {
    setRecounting(true);
    try {
      show(
        await request<QuotaOverview>('/quota/recompute', { method: 'POST' }),
      );
      feedback.success('quota.recounted');
    } catch (error) {
      feedback.failure(error);
    } finally {
      setRecounting(false);
    }
  };

  const columns: ColumnsType<QuotaUser> = [
    { title: t('users.username'), dataIndex: 'username' },
    {
      title: t('quota.usage'),
      key: 'usage',
      render: (_, user) => (
        <QuotaBar used={user.quotaUsedBytes} limit={user.quotaLimitBytes} />
      ),
    },
    {
      title: t('common.actions'),
      key: 'actions',
      align: 'right',
      render: (_, user) => (
        <Tooltip title={t('quota.editLimit')}>
          <Button
            type="text"
            icon={<EditOutlined />}
            aria-label={`${t('quota.editLimit')} ${user.username}`}
            onClick={() => setEditUser(user)}
          />
        </Tooltip>
      ),
    },
  ];

  return (
    <Flex vertical gap={16}>
      <Flex justify="space-between" align="center" wrap gap={8}>
        <PageTitle>{t('quota.title')}</PageTitle>
        <Button
          icon={<ReloadOutlined />}
          loading={recounting}
          onClick={() => void recompute()}
        >
          {t('quota.recompute')}
        </Button>
      </Flex>
      <Typography.Text type="secondary">
        {t('quota.recomputeHint')}
      </Typography.Text>
      {quota.isError && (
        <ErrorAlert error={quota.error} onRetry={() => void quota.refetch()} />
      )}
      {quota.data && (
        <>
          <Card
            title={t('quota.tenant', { slug: quota.data.tenant.slug })}
            extra={
              isServerAdmin && (
                <Button
                  icon={<EditOutlined />}
                  onClick={() => setEditTenant(true)}
                >
                  {t('quota.editLimit')}
                </Button>
              )
            }
          >
            <QuotaBar
              used={quota.data.tenant.quotaUsedBytes}
              limit={quota.data.tenant.quotaLimitBytes}
            />
          </Card>
          <Table<QuotaUser>
            rowKey="id"
            columns={columns}
            dataSource={quota.data.users}
            pagination={{ pageSize: 20, hideOnSinglePage: true }}
          />
          <QuotaLimitModal
            open={editTenant}
            title={t('quota.tenant', { slug: quota.data.tenant.slug })}
            value={quota.data.tenant.quotaLimitBytes}
            onClose={() => setEditTenant(false)}
            onSave={async (limit) => {
              try {
                show(
                  await request<QuotaOverview>('/quota', {
                    method: 'PATCH',
                    body: { quotaLimitBytes: limit },
                  }),
                );
                feedback.success('quota.saved');
                setEditTenant(false);
              } catch (error) {
                feedback.failure(error);
              }
            }}
          />
          <QuotaLimitModal
            open={editUser !== null}
            title={t('quota.userTitle', { name: editUser?.username })}
            value={editUser?.quotaLimitBytes ?? null}
            onClose={() => setEditUser(null)}
            onSave={async (limit) => {
              try {
                await request(`/users/${editUser?.id}`, {
                  method: 'PATCH',
                  body: { quotaLimitBytes: limit },
                });
                await quota.refetch();
                void queryClient.invalidateQueries({
                  queryKey: [slug, 'users'],
                });
                feedback.success('quota.saved');
                setEditUser(null);
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
