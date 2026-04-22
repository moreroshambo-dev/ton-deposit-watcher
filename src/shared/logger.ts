import pino, { type Logger } from "pino";

export function createLogger(env: NodeJS.ProcessEnv = process.env): Logger {
  const level = env.TON_LOG_LEVEL ?? env.LOG_LEVEL ?? "info";

  return pino(
    {
      level,
      base: undefined,
      messageKey: "message",
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        level: (label) => ({ level: label }),
      },
      serializers: {
        err: pino.stdSerializers.err,
      },
    },
    pino.destination({ fd: 2, sync: true }),
  );
}
