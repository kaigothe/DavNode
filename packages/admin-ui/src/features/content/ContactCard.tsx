import {
  EnvironmentOutlined,
  MailOutlined,
  PhoneOutlined,
} from '@ant-design/icons';
import { Flex, theme, Typography } from 'antd';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Contact } from '../../api/client';
import { Avatar } from '../../components/Avatar';

/** The most e-mail addresses and numbers one card shows; the list below has them all. */
const MAX_LINES = 2;

function Line({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <Flex gap={8} align="baseline" style={{ minWidth: 0 }}>
      <span aria-hidden style={{ flex: 'none', opacity: 0.7 }}>
        {icon}
      </span>
      <span className="sr-only" style={visuallyHidden}>
        {label}
      </span>
      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{children}</span>
    </Flex>
  );
}

const visuallyHidden = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const;

/**
 * The contact as a business card: name, position and organisation, the
 * first e-mail addresses and numbers and the first address, with an avatar
 * of initials. A picture of the person is not shown; the complete list of
 * properties stays below it. All text is rendered as text.
 */
export function ContactCard({ contact }: { contact: Contact }) {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const kind = (types: string[]) =>
    types.length > 0 ? ` (${types.join(', ')})` : '';
  const address = contact.addresses[0];

  return (
    <article
      aria-label={t('content.card')}
      style={{
        position: 'relative',
        boxSizing: 'border-box',
        width: '100%',
        maxWidth: 460,
        minHeight: 240,
        padding: '20px 24px 20px 28px',
        borderRadius: 12,
        border: `1px solid ${token.colorBorderSecondary}`,
        background: `linear-gradient(135deg, ${token.colorBgContainer} 0%, ${token.colorFillQuaternary} 100%)`,
        boxShadow: token.boxShadowSecondary,
        overflow: 'hidden',
      }}
    >
      <span
        aria-hidden
        style={{
          position: 'absolute',
          insetBlock: 0,
          insetInlineStart: 0,
          width: 6,
          background: token.colorPrimary,
        }}
      />
      <Flex
        vertical
        justify="space-between"
        gap={16}
        style={{ minHeight: 198 }}
      >
        <Flex gap={16} align="center">
          <Avatar name={contact.displayName} size={56} />
          <div style={{ minWidth: 0 }}>
            <Typography.Title
              level={2}
              style={{
                margin: 0,
                fontSize: 20,
                lineHeight: 1.25,
                overflowWrap: 'anywhere',
              }}
            >
              {contact.displayName}
            </Typography.Title>
            {contact.title && (
              <Typography.Text type="secondary" style={{ display: 'block' }}>
                {contact.title}
              </Typography.Text>
            )}
            {contact.organization && (
              <Typography.Text strong style={{ display: 'block' }}>
                {contact.organization}
              </Typography.Text>
            )}
          </div>
        </Flex>
        <Flex vertical gap={4} style={{ fontSize: 14 }}>
          {contact.emails.slice(0, MAX_LINES).map((email, index) => (
            <Line
              key={`e${index}`}
              icon={<MailOutlined />}
              label={t('content.email')}
            >
              {email.value}
              {kind(email.types)}
            </Line>
          ))}
          {contact.phones.slice(0, MAX_LINES).map((phone, index) => (
            <Line
              key={`p${index}`}
              icon={<PhoneOutlined />}
              label={t('content.phone')}
            >
              {phone.value}
              {kind(phone.types)}
            </Line>
          ))}
          {address && (
            <Line icon={<EnvironmentOutlined />} label={t('content.address')}>
              {address}
            </Line>
          )}
        </Flex>
      </Flex>
    </article>
  );
}
