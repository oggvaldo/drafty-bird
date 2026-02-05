import { trace } from '@opentelemetry/api';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';
import type pino from 'pino';

const ensureTraceUrl = (endpoint: string): string => {
  const trimmed = endpoint.replace(/\/$/, '');
  return trimmed.endsWith('/v1/traces') ? trimmed : `${trimmed}/v1/traces`;
};

export interface TracingHandle {
  sdk?: NodeSDK;
  shutdown: () => Promise<void>;
}

export const initTracing = async (
  serviceName: string,
  logger: pino.Logger,
): Promise<TracingHandle> => {
  if (process.env.NODE_ENV === 'test') {
    return {
      shutdown: async () => {
        return;
      },
    };
  }

  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  const traceExporter = endpoint
    ? new OTLPTraceExporter({ url: ensureTraceUrl(endpoint) })
    : new ConsoleSpanExporter();

  const sdk = new NodeSDK({
    serviceName,
    traceExporter,
    instrumentations: [getNodeAutoInstrumentations()],
  });

  await sdk.start();

  logger.info(
    {
      traceExporter: endpoint ? 'otlp-http' : 'console',
      otlpEndpoint: endpoint,
    },
    'OpenTelemetry tracing initialized',
  );

  return {
    sdk,
    shutdown: async () => {
      await sdk.shutdown();
    },
  };
};

export const tracer = trace.getTracer('drafty-bird-server');
