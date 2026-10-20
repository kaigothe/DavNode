import {
  Card,
  Descriptions,
  Flex,
  Skeleton,
  Space,
  Tag,
  Typography,
} from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { Providers } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ErrorAlert } from '../components/ErrorAlert';

/** Who is logged in, and how the server authenticates users. */
export function OverviewPage() {
  const { t } = useTranslation();
  const { me, session, request } = useAuth();
  const providers = useQuery({
    queryKey: [session?.tenantSlug, 'providers'],
    queryFn: () => request<Providers>('/providers'),
  });

  if (!me) {
    return null;
  }
  return (
    <Flex vertical gap={16}>
      <Typography.Title level={3} style={{ margin: 0 }}>
        {t('overview.title')}
      </Typography.Title>
      <Card title={t('overview.account')}>
        <Descriptions column={{ xs: 1, md: 2 }}>
          <Descriptions.Item label={t('overview.username')}>
            {me.username}
          </Descriptions.Item>
          <Descriptions.Item label={t('overview.email')}>
            {me.email}
          </Descriptions.Item>
          <Descriptions.Item label={t('overview.role')}>
            {t(`role.${me.role}`)}
          </Descriptions.Item>
          <Descriptions.Item label={t('overview.tenant')}>
            <Space size={4}>
              {me.tenant.name}
              <Typography.Text type="secondary">
                ({me.tenant.slug})
              </Typography.Text>
            </Space>
          </Descriptions.Item>
        </Descriptions>
      </Card>
      <Card title={t('overview.providers')}>
        <Flex vertical gap={12}>
          <Typography.Text type="secondary">
            {t('overview.providersHint')}
          </Typography.Text>
          {providers.isPending && <Skeleton active paragraph={{ rows: 2 }} />}
          {providers.isError && (
            <ErrorAlert
              error={providers.error}
              onRetry={() => void providers.refetch()}
            />
          )}
          {providers.data && (
            <>
              <Flex vertical gap={8}>
                {providers.data.providers?.map((provider) => (
                  <Flex
                    key={provider.id}
                    justify="space-between"
                    align="center"
                  >
                    <span>{t(`overview.providerName.${provider.id}`)}</span>
                    <Tag color={provider.enabled ? 'success' : 'default'}>
                      {provider.enabled
                        ? t('overview.enabled')
                        : t('overview.disabled')}
                    </Tag>
                  </Flex>
                ))}
              </Flex>
              {(providers.data.oauth2Issuers?.length ?? 0) > 0 && (
                <div>
                  <Typography.Text strong>
                    {t('overview.issuers')}
                  </Typography.Text>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
                    {providers.data.oauth2Issuers?.map((issuer) => (
                      <li key={issuer}>
                        <code>{issuer}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </Flex>
      </Card>
    </Flex>
  );
}
