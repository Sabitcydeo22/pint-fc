import { describe, expect, it } from 'vitest';
import { hello } from '../../src/lib/hello';

describe('gate: unit', () => {
  it('GATE-1 vitest runs a real unit test', () => {
    expect(hello('PINT FC')).toBe('Hello, PINT FC!');
  });
});
