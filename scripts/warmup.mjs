const LIMIT_MS = Number(process.env.WARMUP_LIMIT_MS ?? 120_000);
const ATTEMPT_TIMEOUT_MS = 20_000;
const RETRY_DELAY_MS = 3_000;

const urls = (
  process.argv.slice(2).length
    ? process.argv.slice(2)
    : (process.env.WARMUP_URLS ?? 'http://localhost:3001,http://localhost:3002,http://localhost:3003').split(',')
)
  .map((u) => u.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const started = Date.now();

async function wake(base) {
  let attempts = 0;
  let last = '';
  while (Date.now() - started < LIMIT_MS) {
    attempts += 1;
    try {
      const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS) });
      const body = await res.json().catch(() => ({}));
      if (res.ok)
        return { base, ok: true, ms: Date.now() - started, attempts, service: body.service ?? '?', db: body.db ?? '?' };
      last = `HTTP ${res.status}${body.db ? ` (db: ${body.db})` : ''}`;
    } catch (err) {
      last = err.name === 'TimeoutError' ? 'timeout' : err.message;
    }
    await sleep(RETRY_DELAY_MS);
  }
  return { base, ok: false, ms: Date.now() - started, attempts, error: last };
}

console.log(`Waking ${urls.length} service(s), up to ${Math.round(LIMIT_MS / 1000)}s...`);
const results = await Promise.all(urls.map(wake));

for (const r of results) {
  const secs = (r.ms / 1000).toFixed(1).padStart(5);
  if (r.ok) console.log(`  OK    ${secs}s  ${r.service.padEnd(10)} db=${String(r.db).padEnd(5)} ${r.base}`);
  else console.log(`  FAIL  ${secs}s  ${r.base}  (${r.error}, ${r.attempts} attempts)`);
}

const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `${failed} service(s) not ready.` : 'All services are awake.');
process.exit(failed ? 1 : 0);
