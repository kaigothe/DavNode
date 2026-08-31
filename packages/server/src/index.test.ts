import { describe, expect, it } from 'vitest';
import { VERSION } from './index.js';

describe('VERSION', () => {
  it('is the expected placeholder version', () => {
    expect(VERSION).toBe('0.0.1');
  });
});
