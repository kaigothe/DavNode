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
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Contact } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { ErrorAlert } from '../../components/ErrorAlert';

const values = (list: Contact['emails']) => (
  <Flex vertical gap={2}>
    {list.map((item, index) => (
      <span key={`${item.value}-${index}`}>
        {item.value}{' '}
        {item.types.map((type) => (
          <Tag key={type}>{type}</Tag>
        ))}
      </span>
    ))}
  </Flex>
);

/** One contact with everything the server knows about it. The text is shown as text, never as markup. */
export function ContactDrawer({
  contact,
  userId,
  addressbookId,
  onClose,
}: {
  contact: Contact | null;
  userId: string;
  addressbookId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { session, request } = useAuth();
  const [showRaw, setShowRaw] = useState(false);

  // The listing is the only place the stored text comes from; look the
  // contact up by its name and pick it out of the result.
  const raw = useQuery({
    queryKey: [session?.tenantSlug, 'contact-raw', addressbookId, contact?.id],
    enabled: showRaw && contact !== null,
    queryFn: async () => {
      const result = await request<{ contacts: Contact[] }>(
        `/users/${userId}/addressbooks/${addressbookId}/contacts`,
        { query: { q: contact?.displayName, limit: 500, raw: true } },
      );
      return result.contacts.find((c) => c.id === contact?.id)?.raw ?? null;
    },
  });

  return (
    <Drawer
      open={contact !== null}
      onClose={() => {
        setShowRaw(false);
        onClose();
      }}
      title={contact?.displayName}
      size="large"
      destroyOnHidden
    >
      {contact && (
        <Flex vertical gap={16}>
          <Descriptions column={1} size="small" bordered>
            {contact.organization && (
              <Descriptions.Item label={t('content.organization')}>
                {contact.organization}
              </Descriptions.Item>
            )}
            {contact.title && (
              <Descriptions.Item label={t('content.jobTitle')}>
                {contact.title}
              </Descriptions.Item>
            )}
            {contact.emails.length > 0 && (
              <Descriptions.Item label={t('content.email')}>
                {values(contact.emails)}
              </Descriptions.Item>
            )}
            {contact.phones.length > 0 && (
              <Descriptions.Item label={t('content.phone')}>
                {values(contact.phones)}
              </Descriptions.Item>
            )}
            {contact.addresses.length > 0 && (
              <Descriptions.Item label={t('content.address')}>
                <Flex vertical gap={2}>
                  {contact.addresses.map((address) => (
                    <span key={address}>{address}</span>
                  ))}
                </Flex>
              </Descriptions.Item>
            )}
            {contact.birthday && (
              <Descriptions.Item label={t('content.birthday')}>
                {contact.birthday}
              </Descriptions.Item>
            )}
            {contact.notes && (
              <Descriptions.Item label={t('content.notes')}>
                <Typography.Text style={{ whiteSpace: 'pre-wrap' }}>
                  {contact.notes}
                </Typography.Text>
              </Descriptions.Item>
            )}
            <Descriptions.Item label={t('content.photo')}>
              {contact.hasPhoto ? t('common.yes') : t('common.no')}
            </Descriptions.Item>
            <Descriptions.Item label="UID">
              <Typography.Text copyable code>
                {contact.uid}
              </Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label={t('content.file')}>
              {contact.name}
            </Descriptions.Item>
          </Descriptions>
          <div>
            <Button onClick={() => setShowRaw((value) => !value)}>
              {showRaw ? t('content.hideRawCard') : t('content.showRawCard')}
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
