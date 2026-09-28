export type User = {
  id: number;
  username: string;
  role: 'user' | 'admin';
  onboardedAt: string | null;
  createdAt: string;
};

export type LinkStatus = 'active' | 'locked' | 'disabled' | 'expired' | 'scheduled';

export type Link = {
  id: number;
  originalUrl: string;
  shortCode: string;
  shortUrl: string;
  title: string | null;
  tags: string[];
  isActive: boolean;
  startsAt: string | null;
  expiresAt: string | null;
  status: LinkStatus;
  deletedAt: string | null;
  lockedAt: string | null;
  lockReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LinkWithClicks = Link & { clicks: number | null };

export type LinkList = {
  items: LinkWithClicks[];
  total: number;
  page: number;
  pageSize: number;
  analyticsAvailable: boolean;
};

export type Breakdown = { name: string; count: number }[];

export type LinkStats = {
  days: number;
  totalClicks: number;
  uniqueVisitors: number;
  lastClickAt: string | null;
  botClicks: number;
  daily: { date: string; clicks: number }[];
  devices: Breakdown;
  browsers: Breakdown;
  os: Breakdown;
  referers: Breakdown;
  countries: Breakdown;
  recent: {
    clickedAt: string;
    deviceType: string;
    browser: string | null;
    os: string | null;
    referer: string | null;
    country: string | null;
  }[];
};

export type Summary = {
  totalLinks: number;
  activeLinks: number;
  totalClicks: number | null;
  topLinks: LinkWithClicks[];
  analyticsAvailable: boolean;
};

export type AdminSummary = {
  users: number;
  suspendedUsers: number;
  links: number;
  lockedLinks: number;
  linksLast7Days: number;
  blockedDomains: number;
  totalClicks: number | null;
};

export type AdminUser = {
  id: number;
  username: string;
  role: 'user' | 'admin';
  isActive: boolean;
  createdAt: string;
  linkCount: number;
};

export type AdminLink = LinkWithClicks & { owner: string; ownerActive: boolean };

export type Paged<T> = { items: T[]; total: number; page: number; pageSize: number };

export type BlockedDomain = {
  id: number;
  domain: string;
  reason: string | null;
  createdAt: string;
  createdBy: string | null;
};

export type FeedStatus = {
  domainCount: number;
  lastUpdatedAt: string | null;
  sources: { name: string; count: number; error: string | null }[];
};

export type FieldError = { field: string; message: string };

export class ApiError extends Error {
  status: number;
  code: string;
  fields: FieldError[];

  constructor(status: number, code: string, message: string, fields: FieldError[] = []) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }

  fieldError(field: string): string | undefined {
    return this.fields.find((f) => f.field === field)?.message;
  }
}

export const AUTH_EXPIRED_EVENT = 'auth:expired';

export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: options.method ?? 'GET',
      headers: options.body === undefined ? undefined : { 'content-type': 'application/json' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, 'network_error', 'Network error');
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (res.ok) return data as T;
  if (res.status === 401 && path !== '/auth/me') window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
  const err = data?.error ?? {};
  throw new ApiError(
    res.status,
    err.code ?? 'unknown',
    err.message ?? 'Error',
    Array.isArray(err.details) ? err.details : [],
  );
}
