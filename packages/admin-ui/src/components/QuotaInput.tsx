import { InputNumber, Select, Space, Switch } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QUOTA_UNITS, splitBytes, toBytes, type QuotaUnit } from '../lib/bytes';

/**
 * Form rules for a field that holds a {@link QuotaInput}: while a limit is
 * switched on, the amount must not be empty (the control reports an empty
 * amount as `undefined`).
 */
export function useQuotaRules() {
  const { t } = useTranslation();
  return [
    {
      validator: (_: unknown, value: number | null | undefined) =>
        value === undefined
          ? Promise.reject(new Error(t('quota.amountRequired')))
          : Promise.resolve(),
    },
  ];
}

/**
 * A form control for a quota limit: "unlimited" (`null`) or an amount in
 * MB, GB or TB. Works as an Ant Design `Form.Item` child (`value`,
 * `onChange`); the value is a byte count, `null` for unlimited, or
 * `undefined` while a limit is switched on but no amount is entered yet.
 */
export function QuotaInput({
  value,
  onChange,
  id,
}: {
  value?: number | null;
  onChange?: (value: number | null | undefined) => void;
  id?: string;
}) {
  const { t } = useTranslation();
  const initial =
    value === null || value === undefined ? null : splitBytes(value);
  const [unlimited, setUnlimited] = useState(initial === null);
  const [unit, setUnit] = useState<QuotaUnit>(initial?.unit ?? 'GB');
  const [amount, setAmount] = useState<number | null>(initial?.amount ?? null);

  const emit = (nextAmount: number | null, nextUnit: QuotaUnit) =>
    onChange?.(nextAmount === null ? undefined : toBytes(nextAmount, nextUnit));

  return (
    <Space wrap>
      <Switch
        checked={unlimited}
        checkedChildren={t('quota.unlimited')}
        unCheckedChildren={t('quota.limited')}
        aria-label={t('quota.unlimited')}
        onChange={(checked) => {
          setUnlimited(checked);
          if (checked) {
            onChange?.(null);
          } else {
            const next = amount ?? 1;
            setAmount(next);
            emit(next, unit);
          }
        }}
      />
      {!unlimited && (
        <>
          <InputNumber
            id={id}
            min={0}
            step={1}
            value={amount}
            aria-label={t('quota.amount')}
            onChange={(next) => {
              setAmount(next);
              emit(next, unit);
            }}
          />
          <Select<QuotaUnit>
            value={unit}
            aria-label={t('quota.unit')}
            style={{ width: 80 }}
            options={QUOTA_UNITS.map((u) => ({ value: u, label: u }))}
            onChange={(next) => {
              setUnit(next);
              emit(amount, next);
            }}
          />
        </>
      )}
    </Space>
  );
}
