import { ArrowLeftOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Flex, Result, Skeleton, Tabs } from 'antd';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { ApiError, type User } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { ErrorAlert } from '../../components/ErrorAlert';
import { NotFoundPage } from '../StatusPages';
import { CalendarApp } from '../calendar/CalendarApp';
import { ContactsTab } from './ContactsTab';
import { PageTitle } from '../../components/Headings';

/** The calendars and contacts of one user, read-only. Only exists when the server has the content view on. */
export function UserContentPage() {
  const { t } = useTranslation();
  const { userId = '' } = useParams();
  const { me, session, request } = useAuth();

  const user = useQuery({
    queryKey: [session?.tenantSlug, 'user', userId],
    queryFn: () => request<User>(`/users/${userId}`),
    enabled: me?.capabilities.contentView === true,
  });

  if (me?.capabilities.contentView !== true) {
    return (
      <Result
        status="info"
        title={t('content.notEnabledTitle')}
        subTitle={t('content.notEnabledText')}
        extra={<Link to="/users">{t('content.back')}</Link>}
      />
    );
  }
  if (user.error instanceof ApiError && user.error.status === 404) {
    return <NotFoundPage />;
  }

  return (
    <Flex vertical gap={16}>
      <Link to="/users">
        <ArrowLeftOutlined /> {t('content.back')}
      </Link>
      {user.isPending && <Skeleton.Input active />}
      {user.isError && (
        <ErrorAlert error={user.error} onRetry={() => void user.refetch()} />
      )}
      {user.data && (
        <PageTitle>
          {t('content.title', { name: user.data.username })}
        </PageTitle>
      )}
      <Alert type="info" showIcon message={t('content.logged')} />
      {user.data && (
        <Tabs
          items={[
            {
              key: 'calendars',
              label: t('content.tabCalendars'),
              children: <CalendarApp userId={userId} />,
            },
            {
              key: 'contacts',
              label: t('content.tabContacts'),
              children: <ContactsTab userId={userId} />,
            },
          ]}
        />
      )}
    </Flex>
  );
}
