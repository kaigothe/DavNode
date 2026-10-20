import { App } from 'antd';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api/client';
import { errorText } from '../i18n';

/** Toasts for the outcome of an action, in the user's language. */
export function useFeedback() {
  const { message } = App.useApp();
  const { t } = useTranslation();
  return {
    /** Shows a success toast for the translation key `key`. */
    success: (key: string, values?: Record<string, unknown>) =>
      void message.success(t(key, values)),
    /** Shows a failed API call as an error toast. */
    failure: (error: unknown) =>
      void message.error(
        errorText(error instanceof ApiError ? error.code : 'unknown', t),
      ),
  };
}
