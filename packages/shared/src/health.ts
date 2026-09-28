export type HealthStatus = {
  status: 'ok' | 'degraded';
  service: string;
  db: 'up' | 'down' | 'none';
  uptimeSeconds: number;
  timestamp: string;
};

export function buildHealth(service: string, db: HealthStatus['db']): HealthStatus {
  return {
    status: db === 'down' ? 'degraded' : 'ok',
    service,
    db,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  };
}
