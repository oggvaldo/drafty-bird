import pino from 'pino';

export const createLogger = () => {
  const logLevel =
    process.env.LOG_LEVEL ??
    (process.env.NODE_ENV === 'test'
      ? 'silent'
      : process.env.NODE_ENV === 'production'
        ? 'info'
        : 'debug');
  return pino({
    level: logLevel,
    base: null,
    timestamp: pino.stdTimeFunctions.isoTime,
  });
};
