const GATEWAY_URL = process.env.GATEWAY_URL ?? 'http://localhost:3001';
const ANALYTICS_URL = process.env.ANALYTICS_URL ?? 'http://localhost:3003';
const KEY = process.env.INTERNAL_API_KEY ?? 'dev-internal-key-change-me';
const FORCE = process.argv.includes('--force');
const RESET = process.argv.includes('--reset');
const headers = { 'x-internal-key': KEY, 'content-type': 'application/json' };

const TARGETS = [
  { code: 'synerry', clicks: 140 },
  { code: 'Gh7kQ2', clicks: 45 },
];

const AGENTS = [
  [
    5,
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  ],
  [
    5,
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  ],
  [
    4,
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  ],
  [
    2,
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  ],
  [1, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0'],
  [
    1,
    'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  ],
];

const REFERERS = [
  [6, ''],
  [3, 'https://www.facebook.com/'],
  [2, 'https://line.me/'],
  [2, 'https://www.google.com/'],
  [1, 'https://www.linkedin.com/'],
];

const IP_RANGES = [
  [24, '1.46'],
  [23, '1.47'],
  [23, '171.96'],
  [6, '103.6'],
  [5, '133.242'],
  [5, '8.8'],
  [4, '60.48'],
  [4, '14.160'],
  [3, '39.192'],
  [3, '81.2'],
];

function randomIp() {
  const prefix = pick(IP_RANGES);
  return `${prefix}.${10 + Math.floor(Math.random() * 3)}.${1 + Math.floor(Math.random() * 20)}`;
}

function pick(weighted) {
  const total = weighted.reduce((sum, [w]) => sum + w, 0);
  let r = Math.random() * total;
  for (const [w, value] of weighted) {
    if ((r -= w) < 0) return value;
  }
  return weighted.at(-1)[1];
}

function randomTime() {
  const daysAgo = Math.floor(Math.pow(Math.random(), 1.6) * 30);
  const hourTh = 8 + Math.floor(Math.random() * 15);
  const d = new Date(Date.now() - daysAgo * 86_400_000);
  d.setUTCHours(hourTh - 7, Math.floor(Math.random() * 60), 0, 0);
  return d.getTime() > Date.now() ? new Date(Date.now() - Math.random() * 3_600_000) : d;
}

async function api(url, init) {
  let res;
  try {
    res = await fetch(url, { ...init, headers });
  } catch {
    throw new Error(`Cannot reach ${url}. Start the services first with: npm run dev`);
  }
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${url} -> HTTP ${res.status}`);
  return res.json();
}

for (const target of TARGETS) {
  const link = await api(`${GATEWAY_URL}/internal/links/${target.code}`);
  if (RESET) await api(`${ANALYTICS_URL}/internal/clicks/${link.id}`, { method: 'DELETE' });
  const summary = await api(`${ANALYTICS_URL}/internal/stats/summary`, {
    method: 'POST',
    body: JSON.stringify({ linkIds: [link.id] }),
  });
  if (summary.totalClicks > 0 && !FORCE) {
    console.log(`skip ${target.code}: already has ${summary.totalClicks} clicks (use --force to add more)`);
    continue;
  }
  for (let i = 0; i < target.clicks; i++) {
    await api(`${ANALYTICS_URL}/internal/clicks`, {
      method: 'POST',
      body: JSON.stringify({
        linkId: link.id,
        clickedAt: randomTime().toISOString(),
        ip: randomIp(),
        userAgent: pick(AGENTS),
        referer: pick(REFERERS) || undefined,
      }),
    });
  }
  for (let i = 0; i < 3; i++) {
    await api(`${ANALYTICS_URL}/internal/clicks`, {
      method: 'POST',
      body: JSON.stringify({
        linkId: link.id,
        userAgent: 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
      }),
    });
  }
  console.log(`seeded ${target.clicks} clicks + 3 bot previews for /${target.code} (link id ${link.id})`);
}
