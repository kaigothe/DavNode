import {
  App as AntApp,
  ConfigProvider,
  Flex,
  Spin,
  theme as antdTheme,
} from 'antd';
import deDE from 'antd/locale/de_DE';
import enUS from 'antd/locale/en_US';
import { useTranslation } from 'react-i18next';
import { Navigate, Outlet, Route, Routes } from 'react-router';
import { AppShell } from './components/AppShell';
import { useAuth } from './auth/AuthContext';
import { GroupDetailPage } from './features/groups/GroupDetailPage';
import { GroupsPage } from './features/groups/GroupsPage';
import { LoginPage } from './features/LoginPage';
import { OverviewPage } from './features/OverviewPage';
import { UserContentPage } from './features/content/UserContentPage';
import { QuotaPage } from './features/quota/QuotaPage';
import {
  ForbiddenPage,
  NoAdminPage,
  NotFoundPage,
} from './features/StatusPages';
import { TenantsPage } from './features/tenants/TenantsPage';
import { UsersPage } from './features/users/UsersPage';
import { useTheme } from './theme/ThemeContext';

/** Applies the chosen theme and language to Ant Design's components. */
export function Themed({ children }: { children: React.ReactNode }) {
  const { resolved } = useTheme();
  const { i18n } = useTranslation();
  return (
    <ConfigProvider
      locale={i18n.language === 'de' ? deDE : enUS}
      theme={{
        algorithm:
          resolved === 'dark'
            ? antdTheme.darkAlgorithm
            : antdTheme.defaultAlgorithm,
      }}
    >
      <AntApp style={{ height: '100%' }}>{children}</AntApp>
    </ConfigProvider>
  );
}

function RequireAuth() {
  const { status } = useAuth();
  if (status === 'loading') {
    return (
      <Flex align="center" justify="center" style={{ minHeight: '100%' }}>
        <Spin size="large" />
      </Flex>
    );
  }
  return status === 'authenticated' ? (
    <Outlet />
  ) : (
    <Navigate to="/login" replace />
  );
}

function RequireAdmin() {
  const { me } = useAuth();
  return me && me.role !== 'member' ? <Outlet /> : <NoAdminPage />;
}

function RequireServerAdmin() {
  const { me } = useAuth();
  return me?.role === 'server_admin' ? <Outlet /> : <ForbiddenPage />;
}

/** The pages of the admin UI and who may see them. */
export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<RequireAdmin />}>
          <Route element={<AppShell />}>
            <Route index element={<OverviewPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="users/:userId/content" element={<UserContentPage />} />
            <Route path="groups" element={<GroupsPage />} />
            <Route path="groups/:groupId" element={<GroupDetailPage />} />
            <Route path="quota" element={<QuotaPage />} />
            <Route element={<RequireServerAdmin />}>
              <Route path="tenants" element={<TenantsPage />} />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}
