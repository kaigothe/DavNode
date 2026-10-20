import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';
import { takeViolations } from './contract';

// Role queries check, element by element, that nothing hides the element,
// which needs computed styles; jsdom is very slow at that on Ant Design's
// large stylesheets (seconds per query on a busy machine). The tests assert
// visibility where it matters; the browser tests check the real tree.
//
// A page's code is loaded on first use, which is slow in jsdom: the default
// one-second wait of findBy* is too tight on a busy machine or a loaded CI
// runner.
configure({ defaultHidden: true, asyncUtilTimeout: 10_000 });

// Ant Design reads these from the browser; jsdom does not implement them.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }),
});

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ResizeObserverStub;

afterEach(() => {
  cleanup();
  const violations = takeViolations();
  if (violations.length > 0) {
    throw new Error(
      `The fake API differs from docs/admin-api.openapi.yaml:\n${[...new Set(violations)].join('\n')}`,
    );
  }
  window.sessionStorage.clear();
  window.localStorage.clear();
});
