import {
  App as AntApp,
  ConfigProvider,
  Flex,
  Spin,
  theme as antdTheme,
} from 'antd';
import deDE from 'antd/locale/de_DE';
import enUS from 'antd/locale/en_US';
import { lazy } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, Outlet, Route, Routes } from 'react-router';
import { AppShell } from './components/AppShell';
import { useAuth } from './auth/AuthContext';
import { LoginPage } from './features/LoginPage';
import { OverviewPage } from './features/OverviewPage';
import {
  ForbiddenPage,
  NoAdminPage,
  NotFoundPage,
} from './features/StatusPages';
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
        // Ant Design's defaults miss the 4.5:1 contrast of WCAG AA: the
        // primary colour on tinted backgrounds, links and secondary text.
        // The dark theme cannot use one blue for everything — white text on
        // a primary button needs a dark blue, links and the selected menu
        // item on a dark background need a light one.
        token:
          resolved === 'dark'
            ? {
                colorPrimary: '#2f6fd6',
                colorLink: '#69b1ff',
                colorLinkHover: '#8ec1ff',
                colorTextSecondary: 'rgba(255, 255, 255, 0.72)',
                colorTextDescription: 'rgba(255, 255, 255, 0.66)',
                colorTextTertiary: 'rgba(255, 255, 255, 0.6)',
              }
            : {
                colorPrimary: '#0958d9',
                colorLink: '#0958d9',
                // Darker status colours, with their tinted backgrounds pinned:
                // Ant Design would derive murky ones from the darker seeds.
                colorSuccess: '#237804',
                colorSuccessBg: '#f6ffed',
                colorSuccessBorder: '#b7eb8f',
                colorWarning: '#ad4e00',
                colorWarningBg: '#fffbe6',
                colorWarningBorder: '#ffe58f',
                colorError: '#cf1322',
                colorErrorBg: '#fff2f0',
                colorErrorBorder: '#ffccc7',
                colorTextSecondary: 'rgba(0, 0, 0, 0.72)',
                colorTextDescription: 'rgba(0, 0, 0, 0.68)',
                colorTextTertiary: 'rgba(0, 0, 0, 0.62)',
              },
        components:
          resolved === 'dark'
            ? {
                Menu: { itemSelectedColor: '#8ec1ff' },
                Tabs: {
                  itemSelectedColor: '#8ec1ff',
                  itemHoverColor: '#a8cdff',
                  inkBarColor: '#69b1ff',
                },
              }
            : {},
      }}
    >
      <AntApp style={{ height: '100%' }}>{children}</AntApp>
    </ConfigProvider>
  );
}

// The pages are loaded when they are first opened, so signing in does not
// download the tables, the calendar and the forms nobody asked for yet.
const UsersPage = lazy(() =>
  import('./features/users/UsersPage').then((m) => ({ default: m.UsersPage })),
);
const GroupsPage = lazy(() =>
  import('./features/groups/GroupsPage').then((m) => ({
    default: m.GroupsPage,
  })),
);
const GroupDetailPage = lazy(() =>
  import('./features/groups/GroupDetailPage').then((m) => ({
    default: m.GroupDetailPage,
  })),
);
const QuotaPage = lazy(() =>
  import('./features/quota/QuotaPage').then((m) => ({ default: m.QuotaPage })),
);
const TenantsPage = lazy(() =>
  import('./features/tenants/TenantsPage').then((m) => ({
    default: m.TenantsPage,
  })),
);
const UserContentPage = lazy(() =>
  import('./features/content/UserContentPage').then((m) => ({
    default: m.UserContentPage,
  })),
);

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
