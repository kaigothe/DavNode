import {
  DeleteOutlined,
  PlusOutlined,
  SearchOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  Button,
  Flex,
  Form,
  Input,
  Modal,
  Table,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { Group } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { ConfirmDeleteModal } from '../../components/ConfirmDeleteModal';
import { ErrorAlert } from '../../components/ErrorAlert';
import { useFeedback } from '../../hooks/useFeedback';
import { useListState } from '../../hooks/useListState';
import { validated } from '../../lib/forms';

/** The groups of the tenant: search, create, delete; a name opens the members. */
export function GroupsPage() {
  const { t } = useTranslation();
  const { session, request } = useAuth();
  const queryClient = useQueryClient();
  const feedback = useFeedback();
  const list = useListState();
  const slug = session?.tenantSlug;

  const groups = useQuery({
    queryKey: [slug, 'groups', list.params],
    queryFn: () =>
      request<{ groups: Group[]; total: number }>('/groups', {
        query: list.params,
      }),
    placeholderData: keepPreviousData,
  });

  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<Group | null>(null);
  const [form] = Form.useForm<{ name: string; description?: string }>();
  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: [slug, 'groups'] });

  const columns: ColumnsType<Group> = [
    {
      title: t('groups.name'),
      dataIndex: 'name',
      render: (name: string, group) => (
        <Link to={`/groups/${group.id}`}>
          <TeamOutlined /> {name}
        </Link>
      ),
    },
    {
      title: t('groups.description'),
      dataIndex: 'description',
      responsive: ['md'],
      render: (value: string | null) =>
        value ?? <Typography.Text type="secondary">—</Typography.Text>,
    },
    {
      title: t('common.actions'),
      key: 'actions',
      align: 'right',
      render: (_, group) => (
        <Tooltip title={t('common.delete')}>
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            aria-label={`${t('common.delete')} ${group.name}`}
            onClick={() => setDeleting(group)}
          />
        </Tooltip>
      ),
    },
  ];

  return (
    <Flex vertical gap={16}>
      <Flex justify="space-between" align="center" wrap gap={8}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          {t('groups.title')}
        </Typography.Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setCreating(true)}
        >
          {t('groups.create')}
        </Button>
      </Flex>
      <Input
        allowClear
        prefix={<SearchOutlined />}
        placeholder={t('groups.search')}
        aria-label={t('groups.search')}
        value={list.search}
        onChange={(event) => list.setSearch(event.target.value)}
        style={{ maxWidth: 360 }}
      />
      {groups.isError && (
        <ErrorAlert
          error={groups.error}
          onRetry={() => void groups.refetch()}
        />
      )}
      <Table<Group>
        rowKey="id"
        columns={columns}
        dataSource={groups.data?.groups}
        loading={groups.isFetching}
        pagination={{
          current: list.page,
          pageSize: list.pageSize,
          total: groups.data?.total ?? 0,
          showSizeChanger: true,
          onChange: list.setPage,
        }}
      />
      <Modal
        open={creating}
        title={t('groups.createTitle')}
        okText={t('common.create')}
        cancelText={t('common.cancel')}
        okButtonProps={{ loading: busy }}
        onCancel={() => setCreating(false)}
        afterClose={() => form.resetFields()}
        destroyOnHidden
        onOk={async () => {
          const values = await validated(form);
          if (!values) {
            return;
          }
          setBusy(true);
          try {
            await request('/groups', {
              method: 'POST',
              body: {
                name: values.name,
                description: values.description || null,
              },
            });
            feedback.success('groups.created');
            setCreating(false);
            refresh();
          } catch (error) {
            feedback.failure(error);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Form form={form} layout="vertical" requiredMark={false}>
          <Form.Item
            name="name"
            label={t('groups.name')}
            rules={[
              {
                required: true,
                whitespace: true,
                message: t('groups.nameRequired'),
              },
            ]}
          >
            <Input autoComplete="off" />
          </Form.Item>
          <Form.Item name="description" label={t('groups.description')}>
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
      <ConfirmDeleteModal
        open={deleting !== null}
        title={t('groups.deleteTitle', { name: deleting?.name })}
        description={t('groups.deleteText')}
        expected={null}
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          try {
            await request(`/groups/${deleting?.id}`, { method: 'DELETE' });
            feedback.success('groups.deleted');
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
