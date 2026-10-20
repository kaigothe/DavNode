import { Typography } from 'antd';
import type { ReactNode } from 'react';

/**
 * The one level-one heading of a page. Ant Design's own h1 is far too big
 * for an admin page, so the size is set here and the semantics stay right
 * for screen readers (a page has exactly one h1; sections below are h2).
 */
export function PageTitle({ children }: { children: ReactNode }) {
  return (
    <Typography.Title
      level={1}
      style={{ margin: 0, fontSize: 24, lineHeight: 1.3 }}
    >
      {children}
    </Typography.Title>
  );
}

/** A section of a page: an h2. */
export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <Typography.Title
      level={2}
      style={{ margin: 0, fontSize: 18, lineHeight: 1.4 }}
    >
      {children}
    </Typography.Title>
  );
}
