import { Alert, Input, Modal, Typography } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Asks before something irreversible happens. With `expected` the user has
 * to type that text (a name or slug) before the button works — the API
 * demands the same confirmation for tenants and users.
 */
export function ConfirmDeleteModal({
  open,
  title,
  description,
  expected,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  /** Text the user has to type to confirm; `null` for a plain confirmation. */
  expected: string | null;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const matches = expected === null || typed === expected;

  const close = () => {
    setTyped('');
    onCancel();
  };

  return (
    <Modal
      open={open}
      title={title}
      okText={t('common.delete')}
      cancelText={t('common.cancel')}
      okButtonProps={{ danger: true, disabled: !matches, loading: busy }}
      onCancel={close}
      onOk={async () => {
        setBusy(true);
        try {
          await onConfirm();
          setTyped('');
        } finally {
          setBusy(false);
        }
      }}
      destroyOnHidden
    >
      <Alert
        type="warning"
        showIcon
        message={description}
        style={{ marginBottom: 16 }}
      />
      {expected !== null && (
        <>
          <Typography.Paragraph>
            {t('common.typeToConfirm', { text: expected })}
          </Typography.Paragraph>
          <Input
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            aria-label={t('common.typeToConfirmLabel')}
            autoComplete="off"
            spellCheck={false}
          />
        </>
      )}
    </Modal>
  );
}
