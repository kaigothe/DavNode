import { describe, expect, it } from 'vitest';
import { de } from './de';
import { en } from './en';

/** `a.b.c` for every leaf of a nested translation object. */
function keys(value: object, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, child]) =>
    typeof child === 'object' && child !== null
      ? keys(child as object, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

describe('translations', () => {
  it('define the same keys in German and English', () => {
    expect(keys(de).sort()).toEqual(keys(en).sort());
  });

  it('use the same interpolation placeholders in both languages', () => {
    const placeholders = (text: string) => text.match(/{{\w+}}/g)?.sort() ?? [];
    const flat = (value: object): Record<string, string> =>
      Object.fromEntries(
        keys(value).map((key) => [
          key,
          key
            .split('.')
            .reduce<unknown>(
              (o, k) => (o as Record<string, unknown>)[k],
              value,
            ) as string,
        ]),
      );
    const english = flat(en);
    const german = flat(de);
    for (const key of Object.keys(english)) {
      expect(placeholders(german[key] ?? ''), key).toEqual(
        placeholders(english[key] ?? ''),
      );
    }
  });

  it('have no empty texts', () => {
    for (const text of [
      ...Object.values(Object.fromEntries(keys(de).map((k) => [k, k]))),
    ]) {
      expect(text).not.toBe('');
    }
  });
});
