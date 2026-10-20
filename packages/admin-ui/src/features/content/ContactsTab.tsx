import { SearchOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  Button,
  Empty,
  Flex,
  Input,
  Select,
  Skeleton,
  Table,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Addressbook, Contact } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { ErrorAlert } from '../../components/ErrorAlert';
import { useListState } from '../../hooks/useListState';
import { ContactDrawer } from './ContactDrawer';

/** A user's address books: a searchable, paged list of contacts. */
export function ContactsTab({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const { session, request } = useAuth();
  const slug = session?.tenantSlug;
  const list = useListState(50);

  const books = useQuery({
    queryKey: [slug, 'content', userId, 'addressbooks'],
    queryFn: () =>
      request<{ addressbooks: Addressbook[] }>(`/users/${userId}/addressbooks`),
  });
  const [chosen, setChosen] = useState<string | undefined>();
  const bookId = chosen ?? books.data?.addressbooks[0]?.id;
  const [open, setOpen] = useState<Contact | null>(null);

  const contacts = useQuery({
    queryKey: [slug, 'content', userId, 'contacts', bookId, list.params],
    enabled: bookId !== undefined,
    queryFn: () =>
      request<{ contacts: Contact[]; total: number }>(
        `/users/${userId}/addressbooks/${bookId}/contacts`,
        {
          query: list.params,
        },
      ),
    placeholderData: keepPreviousData,
  });

  if (books.isPending) {
    return <Skeleton active />;
  }
  if (books.isError) {
    return (
      <ErrorAlert error={books.error} onRetry={() => void books.refetch()} />
    );
  }
  if (books.data.addressbooks.length === 0) {
    return <Empty description={t('content.noAddressbooks')} />;
  }

  const first = (list: Contact['emails']) =>
    list.length === 0
      ? '—'
      : list.length === 1
        ? list[0]?.value
        : `${list[0]?.value} (+${list.length - 1})`;

  const columns: ColumnsType<Contact> = [
    {
      title: t('content.name'),
      dataIndex: 'displayName',
      render: (name: string, contact) => (
        <Button
          type="link"
          style={{ padding: 0 }}
          onClick={() => setOpen(contact)}
        >
          {name}
        </Button>
      ),
    },
    {
      title: t('content.organization'),
      dataIndex: 'organization',
      responsive: ['md'],
      render: (value: string | null) => value ?? '—',
    },
    {
      title: t('content.email'),
      key: 'email',
      responsive: ['md'],
      render: (_, c) => first(c.emails),
    },
    {
      title: t('content.phone'),
      key: 'phone',
      responsive: ['lg'],
      render: (_, c) => first(c.phones),
    },
  ];

  return (
    <Flex vertical gap={16}>
      <Flex gap={12} align="center" wrap>
        <Typography.Text id="addressbook-select-label">
          {t('content.addressbook')}
        </Typography.Text>
        <Select<string>
          aria-labelledby="addressbook-select-label"
          value={bookId}
          onChange={(id) => {
            setChosen(id);
            list.setPage(1);
          }}
          style={{ minWidth: 220 }}
          options={books.data.addressbooks.map((b) => ({
            value: b.id,
            label: `${b.displayName} (${t('content.contacts', { count: b.contactCount })})`,
          }))}
        />
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder={t('content.searchContacts')}
          aria-label={t('content.searchContacts')}
          value={list.search}
          onChange={(event) => list.setSearch(event.target.value)}
          style={{ maxWidth: 320 }}
        />
      </Flex>
      {contacts.isError && (
        <ErrorAlert
          error={contacts.error}
          onRetry={() => void contacts.refetch()}
        />
      )}
      <Table<Contact>
        rowKey="id"
        columns={columns}
        dataSource={contacts.data?.contacts}
        loading={contacts.isFetching}
        pagination={{
          current: list.page,
          pageSize: list.pageSize,
          total: contacts.data?.total ?? 0,
          showSizeChanger: true,
          pageSizeOptions: [25, 50, 100],
          onChange: list.setPage,
        }}
      />
      <ContactDrawer
        contact={open}
        userId={userId}
        addressbookId={bookId ?? ''}
        onClose={() => setOpen(null)}
      />
    </Flex>
  );
}
