import { Button, Result } from 'antd';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useAuth } from '../auth/AuthContext';

/** Shown to a signed-in user who is not an administrator. */
export function NoAdminPage() {
  const { t } = useTranslation();
  const { me, logout } = useAuth();
  return (
    <Result
      status="403"
      title={t('noAdmin.title')}
      subTitle={t('noAdmin.text', { username: me?.username })}
      extra={<Button onClick={logout}>{t('common.logout')}</Button>}
    />
  );
}

/** Shown for an address that matches no page. */
export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <Result
      status="404"
      title={t('notFound.title')}
      extra={
        <Link to="/">
          <Button type="primary">{t('notFound.back')}</Button>
        </Link>
      }
    />
  );
}
