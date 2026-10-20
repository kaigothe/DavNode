/** Units offered for entering a quota, in ascending order. */
export const QUOTA_UNITS = ['MB', 'GB', 'TB'] as const;

/** One of {@link QUOTA_UNITS}. */
export type QuotaUnit = (typeof QUOTA_UNITS)[number];

const FACTOR: Record<QuotaUnit, number> = {
  MB: 1024 ** 2,
  GB: 1024 ** 3,
  TB: 1024 ** 4,
};

/** `1536` → `1.5 KB`; binary multiples, one decimal at most. */
export function formatBytes(bytes: number, locale?: string): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const text = new Intl.NumberFormat(locale, {
    maximumFractionDigits: unit === 0 ? 0 : 1,
  }).format(value);
  return `${text} ${units[unit]}`;
}

/** The byte count for `amount` of `unit`, rounded to whole bytes. */
export function toBytes(amount: number, unit: QuotaUnit): number {
  return Math.round(amount * FACTOR[unit]);
}

/**
 * Splits a byte count into the largest unit it is a whole multiple of
 * (falling back to MB with a fraction), for showing it in a form field.
 */
export function splitBytes(bytes: number): { amount: number; unit: QuotaUnit } {
  for (const unit of [...QUOTA_UNITS].reverse()) {
    if (bytes >= FACTOR[unit] && bytes % FACTOR[unit] === 0) {
      return { amount: bytes / FACTOR[unit], unit };
    }
  }
  return { amount: Number((bytes / FACTOR.MB).toFixed(3)), unit: 'MB' };
}

/** Percentage of `limit` used, capped to 0–100; `null` when there is no limit. */
export function usagePercent(
  used: number,
  limit: number | null,
): number | null {
  if (limit === null) {
    return null;
  }
  if (limit === 0) {
    return used > 0 ? 100 : 0;
  }
  return Math.min(100, Math.max(0, Math.round((used / limit) * 100)));
}
