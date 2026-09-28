type Level = 'info' | 'warn' | 'error';

export function createLogger(service: string) {
  const write = (level: Level, message: string, extra?: Record<string, unknown>) => {
    const line = { time: new Date().toISOString(), level, service, message, ...extra };
    (level === 'error' ? console.error : console.log)(JSON.stringify(line));
  };
  return {
    info: (message: string, extra?: Record<string, unknown>) => write('info', message, extra),
    warn: (message: string, extra?: Record<string, unknown>) => write('warn', message, extra),
    error: (message: string, extra?: Record<string, unknown>) => write('error', message, extra),
  };
}
