import type { createApp } from '../src/app';

type App = ReturnType<typeof createApp>;

type SendOptions = { body?: unknown; cookie?: string; origin?: string; headers?: Record<string, string> };

export function send(app: App, method: string, path: string, opts: SendOptions = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json', ...opts.headers };
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.origin) headers.origin = opts.origin;
  return app.request(path, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}

export function sidCookie(res: Response): string {
  return (res.headers.get('set-cookie') ?? '').split(';')[0];
}

export const json = (res: Response): Promise<any> => res.json();

export async function registerAndLogin(app: App, username: string): Promise<string> {
  const res = await send(app, 'POST', '/api/auth/register', { body: { username, password: 'Password123' } });
  if (res.status !== 201) throw new Error(`register failed: ${res.status}`);
  return sidCookie(res);
}
