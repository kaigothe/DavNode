import { LockOutlined, TeamOutlined, UserOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Flex, Form, Input, Typography } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { loadLastTenant } from '../auth/session';
import { ErrorAlert } from '../components/ErrorAlert';
import { Preferences } from '../components/Preferences';
import { PageTitle } from '../components/Headings';

interface LoginValues {
  tenant: string;
  username: string;
  password: string;
}

/** The sign-in form. */
export function LoginPage() {
  const { t } = useTranslation();
  const { status, login, logoutReason } = useAuth();
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  if (status === 'authenticated') {
    return <Navigate to="/" replace />;
  }

  const onFinish = async ({ tenant, username, password }: LoginValues) => {
    setSubmitting(true);
    setError(null);
    try {
      await login(tenant, username, password);
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught : new ApiError(0, 'unknown', ''),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const insecure =
    window.location.protocol === 'http:' &&
    !['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);

  return (
    <Flex
      component="main"
      vertical
      align="center"
      justify="center"
      style={{ minHeight: '100%', padding: 16 }}
      gap={16}
    >
      <Card style={{ width: '100%', maxWidth: 400 }}>
        <Flex vertical gap={4} style={{ marginBottom: 16 }}>
          <PageTitle>{t('app.title')}</PageTitle>
          <Typography.Text type="secondary">
            {t('login.subtitle')}
          </Typography.Text>
        </Flex>
        <Flex vertical gap={12}>
          {logoutReason === 'expired' && (
            <Alert type="warning" showIcon message={t('login.expired')} />
          )}
          {insecure && (
            <Alert type="warning" showIcon message={t('login.insecure')} />
          )}
          {error !== null && <ErrorAlert error={error} />}
          <Form<LoginValues>
            layout="vertical"
            requiredMark={false}
            initialValues={{ tenant: loadLastTenant() }}
            onFinish={(values) => void onFinish(values)}
          >
            <Form.Item
              name="tenant"
              label={t('login.tenant')}
              extra={t('login.tenantHint')}
              rules={[
                {
                  required: true,
                  whitespace: true,
                  message: t('login.tenantRequired'),
                },
              ]}
            >
              <Input
                prefix={<TeamOutlined />}
                autoComplete="organization"
                autoCapitalize="none"
                spellCheck={false}
              />
            </Form.Item>
            <Form.Item
              name="username"
              label={t('login.username')}
              rules={[{ required: true, message: t('login.usernameRequired') }]}
            >
              <Input
                prefix={<UserOutlined />}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
              />
            </Form.Item>
            <Form.Item
              name="password"
              label={t('login.password')}
              rules={[{ required: true, message: t('login.passwordRequired') }]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                autoComplete="current-password"
              />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={submitting}>
              {t('login.submit')}
            </Button>
          </Form>
        </Flex>
      </Card>
      <Preferences />
    </Flex>
  );
}
