import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button, Form } from 'antd';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';
import { initI18n } from '../i18n';
import { QuotaInput, useQuotaRules } from './QuotaInput';

const GB = 1024 ** 3;

function Harness({
  initial,
  onSubmit,
}: {
  initial: number | null;
  onSubmit: (value: unknown) => void;
}) {
  const rules = useQuotaRules();
  return (
    <Form
      initialValues={{ limit: initial }}
      onFinish={(values: { limit: unknown }) => onSubmit(values.limit)}
    >
      <Form.Item name="limit" rules={rules}>
        <QuotaInput />
      </Form.Item>
      <Button htmlType="submit">Go</Button>
    </Form>
  );
}

async function setup(initial: number | null) {
  const i18n = initI18n('en');
  await i18n.changeLanguage('en');
  const onSubmit = vi.fn();
  render(
    <I18nextProvider i18n={i18n}>
      <Harness initial={initial} onSubmit={onSubmit} />
    </I18nextProvider>,
  );
  return { onSubmit, user: userEvent.setup() };
}

describe('QuotaInput', () => {
  it('shows an existing limit as an amount with its unit', async () => {
    await setup(5 * GB);

    expect(screen.getByRole('spinbutton', { name: 'Amount' })).toHaveValue('5');
    expect(screen.getByRole('switch', { name: 'Unlimited' })).not.toBeChecked();
  });

  it('starts unlimited for null', async () => {
    await setup(null);

    expect(screen.getByRole('switch', { name: 'Unlimited' })).toBeChecked();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  });

  it('stays in limited mode while the amount is cleared and retyped', async () => {
    const { onSubmit, user } = await setup(10 * GB);

    const amount = screen.getByRole('spinbutton', { name: 'Amount' });
    await user.clear(amount);
    expect(
      screen.getByRole('spinbutton', { name: 'Amount' }),
    ).toBeInTheDocument();
    await user.type(amount, '20');
    await user.click(screen.getByRole('button', { name: 'Go' }));

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledWith(20 * GB));
  });

  it('refuses an empty amount', async () => {
    const { onSubmit, user } = await setup(10 * GB);

    await user.clear(screen.getByRole('spinbutton', { name: 'Amount' }));
    await user.click(screen.getByRole('button', { name: 'Go' }));

    expect(await screen.findByText('Enter an amount')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('switches to unlimited and back, remembering the amount', async () => {
    const { onSubmit, user } = await setup(3 * GB);

    await user.click(screen.getByRole('switch', { name: 'Unlimited' }));
    await user.click(screen.getByRole('button', { name: 'Go' }));
    await vi.waitFor(() => expect(onSubmit).toHaveBeenLastCalledWith(null));

    await user.click(screen.getByRole('switch', { name: 'Unlimited' }));
    expect(screen.getByRole('spinbutton', { name: 'Amount' })).toHaveValue('3');
    await user.click(screen.getByRole('button', { name: 'Go' }));
    await vi.waitFor(() => expect(onSubmit).toHaveBeenLastCalledWith(3 * GB));
  });
});
