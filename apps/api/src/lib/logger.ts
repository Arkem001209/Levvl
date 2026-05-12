// Thin wrapper around console so we have a single import to swap later
// (e.g. for pino or winston). Never use console.log directly — use this.

type LogLevel = 'info' | 'warn' | 'error' | 'debug'

// meta is an optional bag of extra key/value pairs to log alongside the message
function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...meta,
  }
  // JSON lines format — one object per line, easy to parse in Railway log aggregators
  if (level === 'error') {
    console.error(JSON.stringify(entry))
  } else if (level === 'warn') {
    console.warn(JSON.stringify(entry))
  } else {
    console.log(JSON.stringify(entry))
  }
}

export const logger = {
  info:  (message: string, meta?: Record<string, unknown>): void => log('info',  message, meta),
  warn:  (message: string, meta?: Record<string, unknown>): void => log('warn',  message, meta),
  error: (message: string, meta?: Record<string, unknown>): void => log('error', message, meta),
  debug: (message: string, meta?: Record<string, unknown>): void => log('debug', message, meta),
}
