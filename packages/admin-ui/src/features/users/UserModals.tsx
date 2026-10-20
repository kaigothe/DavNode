import {
  Alert,
  Button,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Typography,
} from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Providers, Role, User } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { QuotaInput, useQuotaRules } from '../../components/QuotaInput';
import { useFeedback } from '../../hooks/useFeedback';
import { validated } from '../../lib/forms';

// eslint-disable-next-line no-control-regex
const FORBIDDEN_USERNAME_CHARS = /[:/\\\u0000-\u001f\u007f]/;

/** The roles `me` may hand out: only a server administrator may create another. */
function assignableRoles(myRole: Role): Role[] {
  return myRole === 'server_admin'
    ? ['member', 'tenant_admin', 'server_admin']
    : ['member', 'tenant_admin'];
}

/** What the create/edit form holds. */
interface UserFormValues {
  username: string;
  email: string;
  password: string;
  role: Role;
  quotaLimitBytes: number | null;
}

/**
 * Creates a user (`user` is `null`) or edits one: e-mail, role and quota
 * limit. The user name and password are set at creation only; passwords
 * are changed through {@link PasswordModal}.
 */
export function UserFormModal({
  open,
  user,
  onClose,
  onSaved,
}: {
  open: boolean;
  user: User | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const { me, request } = useAuth();
  const feedback = useFeedback();
  const [form] = Form.useForm<UserFormValues>();
  const [busy, setBusy] = useState(false);
  const quotaRules = useQuotaRules();
  const editing = user !== null;
  const myRole = me?.role ?? 'member';
  // A tenant_admin may not touch a server_admin at all (the server says 403).
  const locked =
    editing && user.role === 'server_admin' && myRole !== 'server_admin';

  const submit = async () => {
    const values = await validated(form);
    if (!values) {
      return;
    }
    setBusy(true);
    try {
      if (editing) {
        await request(`/users/${user.id}`, {
          method: 'PATCH',
          body: {
            email: values.email,
            role: values.role,
            quotaLimitBytes: values.quotaLimitBytes,
          },
        });
        feedback.success('users.updated');
      } else {
        await request('/users', {
          method: 'POST',
          body: {
            username: values.username,
            email: values.email,
            password: values.password,
            role: values.role,
          },
        });
        feedback.success('users.created');
      }
      onSaved();
    } catch (error) {
      feedback.failure(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={
        editing
          ? t('users.editTitle', { name: user.username })
          : t('users.createTitle')
      }
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      okButtonProps={{ loading: busy, disabled: locked }}
      onCancel={onClose}
      onOk={() => void submit()}
      afterClose={() => form.resetFields()}
      destroyOnHidden
    >
      <Form<UserFormValues>
        form={form}
        layout="vertical"
        requiredMark={false}
        initialValues={{
          username: user?.username ?? '',
          email: user?.email ?? '',
          role: user?.role ?? 'member',
          quotaLimitBytes: user?.quotaLimitBytes ?? null,
        }}
      >
        {locked && (
          <Alert
            type="warning"
            showIcon
            message={t('users.lockedServerAdmin')}
            style={{ marginBottom: 16 }}
          />
        )}
        <Form.Item
          name="username"
          label={t('users.username')}
          rules={[
            {
              required: true,
              whitespace: true,
              message: t('users.usernameRequired'),
            },
            {
              validator: (_, value: string) =>
                value &&
                (FORBIDDEN_USERNAME_CHARS.test(value) || value !== value.trim())
                  ? Promise.reject(new Error(t('users.usernameInvalid')))
                  : Promise.resolve(),
            },
          ]}
        >
          <Input
            disabled={editing}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />
        </Form.Item>
        <Form.Item
          name="email"
          label={t('users.email')}
          rules={[
            { required: true, type: 'email', message: t('users.emailInvalid') },
          ]}
        >
          <Input disabled={locked} autoComplete="off" />
        </Form.Item>
        {!editing && (
          <Form.Item
            name="password"
            label={t('users.password')}
            rules={[{ required: true, message: t('users.passwordRequired') }]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
        )}
        <Form.Item name="role" label={t('users.role')}>
          <Select<Role>
            virtual={false}
            disabled={locked}
            options={assignableRoles(myRole).map((role) => ({
              value: role,
              label: t(`role.${role}`),
            }))}
          />
        </Form.Item>
        {editing && (
          <Form.Item
            name="quotaLimitBytes"
            label={t('users.quota')}
            rules={quotaRules}
          >
            <QuotaInput />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}

/** Sets a new password for a user. */
export function PasswordModal({
  user,
  onClose,
}: {
  user: User | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { request } = useAuth();
  const feedback = useFeedback();
  const [form] = Form.useForm<{ password: string; repeat: string }>();
  const [busy, setBusy] = useState(false);

  return (
    <Modal
      open={user !== null}
      title={t('users.passwordTitle', { name: user?.username })}
      okText={t('users.resetPassword')}
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
        const { password } = values;
        setBusy(true);
        try {
          await request(`/users/${user?.id}/password`, {
            method: 'POST',
            body: { password },
          });
          feedback.success('users.passwordChanged');
          onClose();
        } catch (error) {
          feedback.failure(error);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item
          name="password"
          label={t('users.newPassword')}
          rules={[{ required: true, message: t('users.passwordRequired') }]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Form.Item
          name="repeat"
          label={t('users.repeatPassword')}
          dependencies={['password']}
          rules={[
            { required: true, message: t('users.passwordRequired') },
            ({ getFieldValue }) => ({
              validator: (_, value: string) =>
                !value || getFieldValue('password') === value
                  ? Promise.resolve()
                  : Promise.reject(new Error(t('users.passwordMismatch'))),
            }),
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

/** Links a user to an identity of a trusted OAuth2 issuer, or removes the link. */
export function OAuth2Modal({
  user,
  providers,
  onClose,
}: {
  user: User | null;
  providers: Providers | undefined;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { request } = useAuth();
  const feedback = useFeedback();
  const [form] = Form.useForm<{ issuer: string; subject: string }>();
  const [busy, setBusy] = useState(false);
  const issuers = providers?.oauth2Issuers ?? [];

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await action();
      feedback.success(success);
      onClose();
    } catch (error) {
      feedback.failure(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={user !== null}
      title={t('users.oauth2Title', { name: user?.username })}
      footer={null}
      onCancel={onClose}
      afterClose={() => form.resetFields()}
      destroyOnHidden
    >
      <Typography.Paragraph type="secondary">
        {t('users.oauth2Hint')}
      </Typography.Paragraph>
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        initialValues={{ issuer: issuers[0] }}
        onFinish={(values) =>
          void run(
            () =>
              request(`/users/${user?.id}/oauth2-link`, {
                method: 'POST',
                body: values,
              }),
            'users.oauth2Linked',
          )
        }
      >
        <Form.Item
          name="issuer"
          label={t('users.issuer')}
          rules={[{ required: true, message: t('users.issuerRequired') }]}
        >
          <Select
            options={issuers.map((issuer) => ({
              value: issuer,
              label: issuer,
            }))}
          />
        </Form.Item>
        <Form.Item
          name="subject"
          label={t('users.subject')}
          extra={t('users.subjectHint')}
          rules={[
            {
              required: true,
              whitespace: true,
              message: t('users.subjectRequired'),
            },
          ]}
        >
          <Input autoComplete="off" spellCheck={false} />
        </Form.Item>
        <Space>
          <Button type="primary" htmlType="submit" loading={busy}>
            {t('users.link')}
          </Button>
          <Button
            danger
            loading={busy}
            onClick={() =>
              void run(
                () =>
                  request(`/users/${user?.id}/oauth2-link`, {
                    method: 'DELETE',
                  }),
                'users.oauth2Unlinked',
              )
            }
          >
            {t('users.unlink')}
          </Button>
        </Space>
      </Form>
    </Modal>
  );
}
