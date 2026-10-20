import { Form, Modal } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { validated } from '../lib/forms';
import { QuotaInput, useQuotaRules } from './QuotaInput';

/** Edits one quota limit: "unlimited" or an amount. `onSave` does the API call and reports failures itself. */
export function QuotaLimitModal({
  open,
  title,
  value,
  onClose,
  onSave,
}: {
  open: boolean;
  title: string;
  value: number | null;
  onClose: () => void;
  onSave: (limit: number | null) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [form] = Form.useForm<{ limit: number | null }>();
  const [busy, setBusy] = useState(false);
  const rules = useQuotaRules();
  return (
    <Modal
      open={open}
      title={title}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      okButtonProps={{ loading: busy }}
      onCancel={onClose}
      afterClose={() => form.resetFields()}
      destroyOnHidden
      onOk={async () => {
        const values = await validated(form);
        if (!values) {
          return;
        }
        const { limit } = values;
        setBusy(true);
        try {
          await onSave(limit);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        initialValues={{ limit: value }}
      >
        <Form.Item name="limit" label={t('quota.limit')} rules={rules}>
          <QuotaInput />
        </Form.Item>
      </Form>
    </Modal>
  );
}
