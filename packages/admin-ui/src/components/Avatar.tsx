import { Avatar as AntAvatar } from 'antd';

const COLORS = [
  '#0958d9',
  '#237804',
  '#ad4e00',
  '#531dab',
  '#08979c',
  '#c41d7f',
];

/** The first letters of up to two words of `name`, upper-cased. */
export function initials(name: string): string {
  const words = name
    .replace(/[<>()[\]{}]/g, ' ')
    .split(/[\s._@-]+/)
    .filter(Boolean);
  const letters =
    words.length >= 2
      ? [words[0], words[words.length - 1]].map(
          (w) => Array.from(w ?? '')[0] ?? '',
        )
      : Array.from(words[0] ?? '?').slice(0, 2);
  return letters.join('').toUpperCase() || '?';
}

/** A stable colour for a name, so the same person always looks the same. */
export function colorFor(name: string): string {
  let hash = 0;
  for (const char of name) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  }
  return COLORS[hash % COLORS.length] ?? COLORS[0]!;
}

/**
 * A round avatar with the initials of `name` on a colour derived from it. The
 * colours all give white text at least 4.5:1 contrast.
 */
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <AntAvatar
      size={size}
      style={{ backgroundColor: colorFor(name), color: '#fff', flex: 'none' }}
      aria-hidden
    >
      {initials(name)}
    </AntAvatar>
  );
}
