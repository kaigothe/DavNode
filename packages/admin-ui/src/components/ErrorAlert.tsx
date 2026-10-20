import { Alert, Button } from 'antd';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api/client';
import { errorText } from '../i18n';

/** Shows a failed API call in the user's language, with an optional retry. */
export function ErrorAlert({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  const code = error instanceof ApiError ? error.code : 'unknown';
  return (
    <Alert
      type="error"
      showIcon
      message={errorText(code, t)}
      action={
        onRetry ? (
          <Button size="small" onClick={onRetry}>
            {t('common.retry')}
          </Button>
        ) : undefined
      }
    />
  );
}
