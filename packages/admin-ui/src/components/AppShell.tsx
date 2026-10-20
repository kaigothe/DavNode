import {
  ApartmentOutlined,
  CloudOutlined,
  DashboardOutlined,
  FileTextOutlined,
  LogoutOutlined,
  MenuOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {
  Button,
  Drawer,
  Dropdown,
  Flex,
  Grid,
  Layout,
  Menu,
  theme,
  Typography,
} from 'antd';
import { Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { PageLoading } from './PageLoading';
import { Preferences } from './Preferences';

const { Header, Sider, Content } = Layout;

/** The frame around every page: navigation, user menu and preferences. */
export function AppShell() {
  const { t } = useTranslation();
  const { me, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = theme.useToken();
  const screens = Grid.useBreakpoint();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const compact = !screens.lg;

  const items = [
    { key: '/', icon: <DashboardOutlined />, label: t('nav.overview') },
    { key: '/users', icon: <UserOutlined />, label: t('nav.users') },
    { key: '/groups', icon: <TeamOutlined />, label: t('nav.groups') },
    { key: '/quota', icon: <CloudOutlined />, label: t('nav.quota') },
    ...(me?.role === 'server_admin'
      ? [
          {
            key: '/tenants',
            icon: <ApartmentOutlined />,
            label: t('nav.tenants'),
          },
        ]
      : []),
    ...(me?.role === 'server_admin' && me.capabilities.logView
      ? [{ key: '/logs', icon: <FileTextOutlined />, label: t('nav.logs') }]
      : []),
  ];
  const selected = items
    .filter((item) =>
      item.key === '/'
        ? location.pathname === '/'
        : location.pathname.startsWith(item.key),
    )
    .map((item) => item.key);

  const menu = (
    <Menu
      mode="inline"
      selectedKeys={selected}
      items={items}
      onClick={({ key }) => {
        setDrawerOpen(false);
        void navigate(key);
      }}
      style={{ borderInlineEnd: 0 }}
    />
  );

  return (
    <Layout style={{ minHeight: '100%' }}>
      {!compact && (
        <Sider
          width={220}
          theme="light"
          breakpoint="lg"
          style={{
            borderInlineEnd: `1px solid ${token.colorSplit}`,
          }}
        >
          <Typography.Text
            strong
            style={{ display: 'block', padding: '16px 24px' }}
          >
            {t('app.title')}
          </Typography.Text>
          {menu}
        </Sider>
      )}
      <Layout>
        <Header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            paddingInline: 16,
            // Ant Design's header is dark blue by default, in every theme.
            background: token.colorBgContainer,
            borderBottom: `1px solid ${token.colorSplit}`,
          }}
        >
          <Flex align="center" gap={8}>
            {compact && (
              <Button
                type="text"
                icon={<MenuOutlined />}
                aria-label={t('nav.menu')}
                onClick={() => setDrawerOpen(true)}
              />
            )}
            {compact && (
              <Typography.Text strong>{t('app.title')}</Typography.Text>
            )}
          </Flex>
          <Flex align="center" gap={12}>
            {!compact && <Preferences />}
            <Dropdown
              trigger={['click']}
              menu={{
                items: [
                  {
                    key: 'logout',
                    icon: <LogoutOutlined />,
                    label: t('common.logout'),
                    onClick: logout,
                  },
                ],
              }}
            >
              <Button icon={<UserOutlined />} aria-label={me?.username}>
                {compact ? undefined : me?.username}
              </Button>
            </Dropdown>
          </Flex>
        </Header>
        <Content style={{ padding: 16 }}>
          <Suspense fallback={<PageLoading />}>
            <Outlet />
          </Suspense>
        </Content>
      </Layout>
      <Drawer
        placement="left"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={t('app.title')}
        width={260}
      >
        <Flex vertical gap={16}>
          {menu}
          <Preferences />
        </Flex>
      </Drawer>
    </Layout>
  );
}
