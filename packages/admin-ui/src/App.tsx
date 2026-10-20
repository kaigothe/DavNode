import { ConfigProvider, Flex, Spin, theme as antdTheme } from 'antd';
import deDE from 'antd/locale/de_DE';
import enUS from 'antd/locale/en_US';
import { useTranslation } from 'react-i18next';
import { Navigate, Outlet, Route, Routes } from 'react-router';
import { AppShell } from './components/AppShell';
import { useAuth } from './auth/AuthContext';
import { LoginPage } from './features/LoginPage';
import { OverviewPage } from './features/OverviewPage';
import { NoAdminPage, NotFoundPage } from './features/StatusPages';
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
      {children}
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

/** The pages of the admin UI and who may see them. */
export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<RequireAdmin />}>
          <Route element={<AppShell />}>
            <Route index element={<OverviewPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}
