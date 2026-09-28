import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app';

let app: ReturnType<typeof createApp>;
let clickCalls: { url: string; init: RequestInit }[];

const LINK = {
  id: 7,
  originalUrl: 'https://www.synerry.com',
  isActive: true,
  startsAt: null as string | null,
  expiresAt: null as string | null,
  blocked: false,
};

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const hangUntilAborted = (init?: RequestInit) =>
  new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))));

function mockUpstream(opts: {
  lookup?: (init?: RequestInit) => Promise<Response>;
  click?: (init?: RequestInit) => Promise<Response>;
}) {
  const lookup = opts.lookup ?? (async () => reply(LINK));
  const click = opts.click ?? (async () => reply({ id: 1 }, 201));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).startsWith('http://gateway.test/')) return lookup(init);
      clickCalls.push({ url: String(url), init: init ?? {} });
      return click(init);
    }),
  );
}

const open = (path: string, headers: Record<string, string> = {}, method = 'GET') =>
  app.request(path, { method, headers });

beforeEach(() => {
  app = createApp();
  clickCalls = [];
  mockUpstream({});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('happy path', () => {
  it('redirects 302 to the original URL with no-store, and records the click', async () => {
    const res = await open('/synerry', {
      'user-agent': 'Mozilla/5.0 (iPhone)',
      referer: 'https://www.facebook.com/',
      'x-forwarded-for': '203.0.113.9, 10.0.0.1',
    });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://www.synerry.com');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(clickCalls).toHaveLength(1);
    expect((clickCalls[0].init.headers as Record<string, string>)['x-internal-key']).toBe('test-internal-key');
    const event = JSON.parse(String(clickCalls[0].init.body));
    expect(event).toMatchObject({
      linkId: 7,
      ip: '203.0.113.9',
      userAgent: 'Mozilla/5.0 (iPhone)',
      referer: 'https://www.facebook.com/',
    });
  });

  it('finishes saving the click BEFORE sending the redirect', async () => {
    let saved = false;
    mockUpstream({
      click: async () => {
        await new Promise((r) => setTimeout(r, 80));
        saved = true;
        return reply({ id: 1 }, 201);
      },
    });
    const res = await open('/synerry');
    expect(res.status).toBe(302);
    expect(saved).toBe(true);
  });

  it('sends visitors of the bare domain to the main app', async () => {
    const res = await open('/');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('http://app.test');
  });
});

describe('analytics problems must never break the redirect', () => {
  it('still redirects when analytics is down', async () => {
    mockUpstream({ click: async () => Promise.reject(new TypeError('fetch failed')) });
    const res = await open('/synerry');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://www.synerry.com');
  });

  it('still redirects when analytics returns 500', async () => {
    mockUpstream({ click: async () => reply({}, 500) });
    expect((await open('/synerry')).status).toBe(302);
  });

  it('gives up waiting after the click timeout when analytics hangs (e.g. asleep on Render)', async () => {
    mockUpstream({ click: hangUntilAborted });
    const start = Date.now();
    const res = await open('/synerry');
    const elapsed = Date.now() - start;
    expect(res.status).toBe(302);
    expect(elapsed).toBeGreaterThanOrEqual(150);
    expect(elapsed).toBeLessThan(1000);
  });
});

describe('links that cannot be opened', () => {
  it('shows a 404 page for an unknown code', async () => {
    mockUpstream({ lookup: async () => reply({ error: {} }, 404) });
    const res = await open('/nope99');
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('Link not found');
    expect(clickCalls).toHaveLength(0);
  });

  it('shows 410 for a disabled link and does not record a click', async () => {
    mockUpstream({ lookup: async () => reply({ ...LINK, isActive: false }) });
    const res = await open('/synerry');
    expect(res.status).toBe(410);
    expect(await res.text()).toContain('Link disabled');
    expect(clickCalls).toHaveLength(0);
  });

  it('shows 410 for an expired link', async () => {
    mockUpstream({ lookup: async () => reply({ ...LINK, expiresAt: new Date(Date.now() - 60_000).toISOString() }) });
    const res = await open('/synerry');
    expect(res.status).toBe(410);
    expect(await res.text()).toContain('Link expired');
  });

  it('shows 403 for a link whose start date is in the future, and does not record a click', async () => {
    mockUpstream({ lookup: async () => reply({ ...LINK, startsAt: new Date(Date.now() + 86_400_000).toISOString() }) });
    const res = await open('/synerry');
    expect(res.status).toBe(403);
    expect(await res.text()).toContain('Link not active yet');
    expect(clickCalls).toHaveLength(0);
  });

  it('redirects normally once the start date has passed', async () => {
    mockUpstream({ lookup: async () => reply({ ...LINK, startsAt: new Date(Date.now() - 60_000).toISOString() }) });
    expect((await open('/synerry')).status).toBe(302);
  });

  it('never redirects to a blocked destination', async () => {
    mockUpstream({ lookup: async () => reply({ ...LINK, blocked: true }) });
    const res = await open('/synerry');
    expect(res.status).toBe(410);
    expect(res.headers.get('location')).toBeNull();
    expect(await res.text()).toContain('Link blocked');
  });

  it('shows 503 (not 404) when the gateway is down, because the link may exist', async () => {
    mockUpstream({ lookup: hangUntilAborted });
    const res = await open('/synerry');
    expect(res.status).toBe(503);
    expect(await res.text()).toContain('Please try again');
  });

  it('never redirects to a non-http URL, even if the database contains one', async () => {
    mockUpstream({ lookup: async () => reply({ ...LINK, originalUrl: 'javascript:alert(1)' }) });
    const res = await open('/synerry');
    expect(res.status).toBe(404);
    expect(res.headers.get('location')).toBeNull();
  });

  it('rejects codes with invalid characters without calling the gateway', async () => {
    const lookup = vi.fn(async () => reply(LINK));
    mockUpstream({ lookup });
    const res = await open('/favicon.ico');
    expect(res.status).toBe(404);
    expect(lookup).not.toHaveBeenCalled();
  });
});

describe('HEAD requests', () => {
  it('answer with the redirect but are not counted as clicks', async () => {
    const res = await open('/synerry', {}, 'HEAD');
    expect(res.status).toBe(302);
    expect(clickCalls).toHaveLength(0);
  });
});
