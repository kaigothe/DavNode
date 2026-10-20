import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  Alert,
  Button,
  Flex,
  Form,
  Input,
  Modal,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Tenant } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { ConfirmDeleteModal } from '../../components/ConfirmDeleteModal';
import { ErrorAlert } from '../../components/ErrorAlert';
import { QuotaBar } from '../../components/QuotaBar';
import { QuotaInput, useQuotaRules } from '../../components/QuotaInput';
import { useFeedback } from '../../hooks/useFeedback';
import { useListState } from '../../hooks/useListState';
import { validated } from '../../lib/forms';

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

interface TenantFormValues {
  slug: string;
  name: string;
  quotaLimitBytes: number | null;
}

/** All tenants of the server (server administrators only): create, rename, set a quota, delete. */
export function TenantsPage() {
  const { t, i18n } = useTranslation();
  const { me, session, request } = useAuth();
  const queryClient = useQueryClient();
  const feedback = useFeedback();
  const list = useListState();
  const slug = session?.tenantSlug;

  const tenants = useQuery({
    queryKey: [slug, 'tenants', list.params],
    queryFn: () =>
      request<{ tenants: Tenant[]; total: number }>('/tenants', {
        query: list.params,
      }),
    placeholderData: keepPreviousData,
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Tenant | null>(null);
  const [deleting, setDeleting] = useState<Tenant | null>(null);
  const [busy, setBusy] = useState(false);
  const [form] = Form.useForm<TenantFormValues>();
  const quotaRules = useQuotaRules();
  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: [slug, 'tenants'] });
  const isCurrent = (tenant: Tenant) => tenant.slug === me?.tenant.slug;

  const submit = async () => {
    const values = await validated(form);
    if (!values) {
      return;
    }
    setBusy(true);
    try {
      if (editing) {
        await request(`/tenants/${editing.slug}`, {
          method: 'PATCH',
          body: { name: values.name, quotaLimitBytes: values.quotaLimitBytes },
        });
        feedback.success('tenants.updated');
      } else {
        await request('/tenants', {
          method: 'POST',
          body: {
            slug: values.slug,
            name: values.name,
            quotaLimitBytes: values.quotaLimitBytes,
          },
        });
        feedback.success('tenants.created');
      }
      setFormOpen(false);
      refresh();
    } catch (error) {
      feedback.failure(error);
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnsType<Tenant> = [
    {
      title: t('tenants.slug'),
      dataIndex: 'slug',
      render: (value: string, tenant) => (
        <Space>
          <Typography.Text strong>{value}</Typography.Text>
          {isCurrent(tenant) && <Tag color="blue">{t('tenants.current')}</Tag>}
        </Space>
      ),
    },
    { title: t('tenants.name'), dataIndex: 'name' },
    {
      title: t('tenants.quota'),
      key: 'quota',
      responsive: ['md'],
      render: (_, tenant) => (
        <QuotaBar used={tenant.quotaUsedBytes} limit={tenant.quotaLimitBytes} />
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
      render: (_, tenant) => (
        <Space size={0}>
          <Tooltip title={t('common.edit')}>
            <Button
              type="text"
              icon={<EditOutlined />}
              aria-label={`${t('common.edit')} ${tenant.slug}`}
              onClick={() => {
                setEditing(tenant);
                setFormOpen(true);
              }}
            />
          </Tooltip>
          <Tooltip
            title={
              isCurrent(tenant)
                ? t('tenants.cannotDeleteCurrent')
                : t('common.delete')
            }
          >
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              disabled={isCurrent(tenant)}
              aria-label={`${t('common.delete')} ${tenant.slug}`}
              onClick={() => setDeleting(tenant)}
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
          {t('tenants.title')}
        </Typography.Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          {t('tenants.create')}
        </Button>
      </Flex>
      <Alert type="info" showIcon message={t('tenants.hint')} />
      <Input
        allowClear
        prefix={<SearchOutlined />}
        placeholder={t('tenants.search')}
        aria-label={t('tenants.search')}
        value={list.search}
        onChange={(event) => list.setSearch(event.target.value)}
        style={{ maxWidth: 360 }}
      />
      {tenants.isError && (
        <ErrorAlert
          error={tenants.error}
          onRetry={() => void tenants.refetch()}
        />
      )}
      <Table<Tenant>
        rowKey="id"
        columns={columns}
        dataSource={tenants.data?.tenants}
        loading={tenants.isFetching}
        scroll={{ x: 'max-content' }}
        pagination={{
          current: list.page,
          pageSize: list.pageSize,
          total: tenants.data?.total ?? 0,
          showSizeChanger: true,
          onChange: list.setPage,
        }}
      />
      <Modal
        open={formOpen}
        title={
          editing
            ? t('tenants.editTitle', { slug: editing.slug })
            : t('tenants.createTitle')
        }
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        okButtonProps={{ loading: busy }}
        onCancel={() => setFormOpen(false)}
        afterClose={() => form.resetFields()}
        destroyOnHidden
        onOk={() => void submit()}
      >
        <Form<TenantFormValues>
          form={form}
          layout="vertical"
          requiredMark={false}
          initialValues={{
            slug: editing?.slug ?? '',
            name: editing?.name ?? '',
            quotaLimitBytes: editing?.quotaLimitBytes ?? null,
          }}
        >
          <Form.Item
            name="slug"
            label={t('tenants.slug')}
            extra={t('tenants.slugHint')}
            rules={[
              { required: true, message: t('tenants.slugRequired') },
              { max: 63, message: t('tenants.slugInvalid') },
              { pattern: SLUG_PATTERN, message: t('tenants.slugInvalid') },
            ]}
          >
            <Input
              disabled={editing !== null}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
          </Form.Item>
          <Form.Item
            name="name"
            label={t('tenants.name')}
            rules={[
              {
                required: true,
                whitespace: true,
                message: t('tenants.nameRequired'),
              },
            ]}
          >
            <Input autoComplete="off" />
          </Form.Item>
          <Form.Item
            name="quotaLimitBytes"
            label={t('tenants.quota')}
            rules={quotaRules}
          >
            <QuotaInput />
          </Form.Item>
        </Form>
      </Modal>
      <ConfirmDeleteModal
        open={deleting !== null}
        title={t('tenants.deleteTitle', { slug: deleting?.slug })}
        description={t('tenants.deleteText')}
        expected={deleting?.slug ?? null}
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          try {
            await request(`/tenants/${deleting?.slug}`, {
              method: 'DELETE',
              body: { confirmSlug: deleting?.slug },
            });
            feedback.success('tenants.deleted');
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
