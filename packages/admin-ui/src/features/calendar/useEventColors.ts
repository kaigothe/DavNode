import { theme } from 'antd';
import { useMemo } from 'react';
import {
  DEFAULT_CALENDAR_COLORS,
  parseHex,
  solidColors,
  tintedColors,
  type EventColors,
} from '../../lib/color';
import { useTheme } from '../../theme/ThemeContext';

/** The calendar's own colour, or one of the defaults chosen by its position in the list. */
export function calendarColor(color: string | null, index: number): string {
  return (
    color ??
    DEFAULT_CALENDAR_COLORS[index % DEFAULT_CALENDAR_COLORS.length] ??
    '#1badf8'
  );
}

/** How events are coloured in the current theme: tinted blocks, and solid bars. */
export function useEventColors() {
  const { resolved } = useTheme();
  const { token } = theme.useToken();
  const surface = parseHex(token.colorBgContainer) ?? {
    r: resolved === 'dark' ? 20 : 255,
    g: resolved === 'dark' ? 20 : 255,
    b: resolved === 'dark' ? 20 : 255,
  };
  return useMemo(
    () => ({
      tinted: (hex: string): EventColors =>
        tintedColors(hex, resolved, surface),
      solid: (hex: string): EventColors => solidColors(hex),
    }),
    // `surface` is derived from the theme token: it changes with `resolved`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resolved, token.colorBgContainer],
  );
}

/**
 * The red of "today": a dark red for the circle behind a white date (4.5:1),
 * and for red text on the page a shade that reads on the surface of the theme.
 */
export function useTodayColors(): { fill: string; text: string } {
  const { resolved } = useTheme();
  return resolved === 'dark'
    ? { fill: '#c62828', text: '#ff7875' }
    : { fill: '#c62828', text: '#c62828' };
}
