import { createAppState } from './app';
import { createLogger } from './logger';
import { initTracing } from './tracing';

const main = async () => {
  const logger = createLogger();
  const tracing = await initTracing('drafty-bird-server', logger);
  const appState = await createAppState({ logger });

  const server = appState.app.listen(appState.config.port, () => {
    appState.logger.info(
      {
        port: appState.config.port,
        storage_mode: appState.store.mode,
        chaos_enabled: appState.config.chaos.enabled,
      },
      'Drafty Bird server listening',
    );
  });

  const shutdown = async (signal: string) => {
    appState.logger.info({ signal }, 'Shutting down server');

    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    await appState.store.close();
    await tracing.shutdown();
  };

  const handleSignal = (signal: string) => {
    void shutdown(signal)
      .then(() => {
        process.exit(0);
      })
      .catch((error) => {
        appState.logger.error({ err: error }, 'Shutdown failed');
        process.exit(1);
      });
  };

  process.on('SIGINT', () => handleSignal('SIGINT'));
  process.on('SIGTERM', () => handleSignal('SIGTERM'));
};

void main().catch((error: unknown) => {
  console.error('Fatal startup error', error);
  process.exit(1);
});
