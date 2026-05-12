type LogLevel = 'info' | 'warn' | 'error';

export function logEvent(level: LogLevel, event: string, data: Record<string, unknown> = {}): void {
  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    ...data,
  };

  const line = `[folioai] ${JSON.stringify(payload)}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}
