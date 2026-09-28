import { serve } from '@hono/node-server';
import { createLogger } from './logger';

type FetchHandler = Parameters<typeof serve>[0]['fetch'];

type ServiceOptions = {
  name: string;
  defaultPort: number;
  fetch: FetchHandler;
  onShutdown?: () => Promise<void>;
};

export function startService({ name, defaultPort, fetch, onShutdown }: ServiceOptions) {
  const log = createLogger(name);
  const port = Number(process.env.PORT ?? defaultPort);
  const server = serve({ fetch, port }, (info) => log.info('listening', { port: info.port }));

  const shutdown = async () => {
    log.info('shutting down');
    server.close();
    await onShutdown?.();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return server;
}
