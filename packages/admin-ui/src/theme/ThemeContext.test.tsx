import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ThemeProvider, useTheme } from './ThemeContext';

type Listener = (event: { matches: boolean }) => void;

/** A controllable `prefers-color-scheme: dark` media query. */
function mockSystemTheme(dark: boolean) {
  const listeners = new Set<Listener>();
  let matches = dark;
  window.matchMedia = ((query: string) => ({
    get matches() {
      return matches;
    },
    media: query,
    addEventListener: (_: string, l: Listener) => listeners.add(l),
    removeEventListener: (_: string, l: Listener) => listeners.delete(l),
  })) as unknown as typeof window.matchMedia;
  return (next: boolean) => {
    matches = next;
    listeners.forEach((l) => l({ matches: next }));
  };
}

function Probe() {
  const { mode, resolved, setMode } = useTheme();
  return (
    <>
      <output data-testid="state">{`${mode}/${resolved}`}</output>
      <button onClick={() => setMode('dark')}>dark</button>
      <button onClick={() => setMode('light')}>light</button>
      <button onClick={() => setMode('system')}>system</button>
    </>
  );
}

const state = () => screen.getByTestId('state').textContent;
const renderProbe = () =>
  render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );

beforeEach(() => document.documentElement.removeAttribute('data-theme'));
afterEach(() => document.documentElement.removeAttribute('data-theme'));

describe('ThemeProvider', () => {
  it('follows the operating system by default', () => {
    mockSystemTheme(true);

    renderProbe();

    expect(state()).toBe('system/dark');
    expect(document.documentElement).not.toHaveAttribute('data-theme');
  });

  it('follows a change of the operating system live while on "system"', () => {
    const setSystemDark = mockSystemTheme(false);
    renderProbe();
    expect(state()).toBe('system/light');

    act(() => setSystemDark(true));

    expect(state()).toBe('system/dark');
  });

  it('lets an explicit choice win over the system and remembers it', async () => {
    const setSystemDark = mockSystemTheme(true);
    const user = userEvent.setup();
    renderProbe();

    await user.click(screen.getByText('light'));
    act(() => setSystemDark(true));

    expect(state()).toBe('light/light');
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    expect(window.localStorage.getItem('davnode.theme')).toBe('light');
  });

  it('restores the saved choice and can go back to "system"', async () => {
    mockSystemTheme(false);
    window.localStorage.setItem('davnode.theme', 'dark');
    const user = userEvent.setup();
    renderProbe();
    expect(state()).toBe('dark/dark');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');

    await user.click(screen.getByText('system'));

    expect(state()).toBe('system/light');
    expect(document.documentElement).not.toHaveAttribute('data-theme');
  });

  it('ignores a corrupt saved value', () => {
    mockSystemTheme(false);
    window.localStorage.setItem('davnode.theme', 'neon');

    renderProbe();

    expect(state()).toBe('system/light');
  });
});
