type LogLevel = 'info' | 'warn' | 'error';

interface LogInput {
  level: LogLevel;
  message: string;
  meta?: object;
}

interface LogWithRequestId extends LogInput {
  requestId: string;
}

const LOG_LEVELS: Record<LogLevel, string> = {
  info: 'INFO',
  warn: 'WARN',
  error: 'ERROR',
};

const C = {
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  blue: (s: string) => `\x1b[34m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
};

function formatLog(entry: LogWithRequestId): string {
  const timestamp = new Date().toISOString().slice(11, 23);
  const levelStr = LOG_LEVELS[entry.level];
  const coloredLevel = entry.level === 'error'
    ? C.red(levelStr)
    : entry.level === 'warn'
    ? C.yellow(levelStr)
    : C.blue(levelStr);
  const metaStr = Object.keys(entry.meta || {}).length > 0 ? ` ${JSON.stringify(entry.meta)}` : '';
  return `${C.dim(`[${timestamp}]`)} ${coloredLevel} ${entry.message}${metaStr}`;
}

function logWithRequestId(requestId: string, input: LogInput): void {
  const entry: LogWithRequestId = { ...input, requestId };
  const formatted = formatLog(entry);
  if (input.level === 'error') {
    console.error(formatted);
  } else {
    console.log(formatted);
  }
}

// Singleton log proxy — calling log({ level, message, meta }) uses '-' as requestId placeholder
const log = (input: LogInput, requestId?: string): void => {
  logWithRequestId(requestId || '-', input);
};

export const logger = {
  info: (message: string, meta?: object, requestId?: string) =>
    logWithRequestId(requestId || '-', { level: 'info', message, meta }),
  warn: (message: string, meta?: object, requestId?: string) =>
    logWithRequestId(requestId || '-', { level: 'warn', message, meta }),
  error: (message: string, meta?: object, requestId?: string) =>
    logWithRequestId(requestId || '-', { level: 'error', message, meta }),
  /**
   * Audit log for security-sensitive admin actions.
   * Always logged at ERROR level so it stands out in log aggregation systems.
   * Fields: action, userId, targetId, requestId, timestamp.
   */
  audit: (action: string, meta?: Record<string, unknown>) =>
    logWithRequestId('-', {
      level: 'error',
      message: `[AUDIT] ${action}`,
      meta: { action, timestamp: new Date().toISOString(), ...meta },
    }),
};

export type { LogLevel, LogInput };
export default log;
