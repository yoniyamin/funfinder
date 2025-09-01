import { describe, it, expect } from 'vitest';
import { toISODate } from '../api';

describe('toISODate', () => {
  it('passes through ISO string unchanged', () => {
    const s = '2025-08-26';
    expect(toISODate(s)).toBe(s);
  });
  it('converts Date to YYYY-MM-DD in local zone', () => {
    const d = new Date('2025-08-26T12:34:56Z');
    const out = toISODate(d);
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
