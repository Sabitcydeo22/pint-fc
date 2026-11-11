import { describe, expect, it } from 'vitest';
import { GET } from '../../src/app/api/health/route';

describe('gate: api', () => {
  it('GATE-3 GET /api/health returns 200 {ok:true} through the route handler', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
