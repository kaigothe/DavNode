import { describe, expect, it } from 'vitest';
import { normalizeCalendarColor } from './content-inspection.service.js';

describe('normalizeCalendarColor', () => {
  it.each([
    ['#1badf8', '#1badf8'],
    ['#1BADF8', '#1badf8'],
    ['#FF2968FF', '#ff2968'],
    ['#ff296880', '#ff2968'],
    ['  #63DA38  ', '#63da38'],
    ['#fa0', '#ffaa00'],
  ])('reads %j as %j', (input, expected) => {
    expect(normalizeCalendarColor(input)).toBe(expected);
  });

  it.each([
    '',
    'red',
    '1badf8',
    '#12',
    '#12345',
    '#1234567',
    '#gggggg',
    '#fff;background:url(x)',
    'rgb(1,2,3)',
    '#ff0000"><script>',
  ])('refuses %j, so nothing odd can reach a style attribute', (input) => {
    expect(normalizeCalendarColor(input)).toBeNull();
  });
});
