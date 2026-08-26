import {
  readBoundedIntegerEnvironment,
  readBooleanEnvironment,
  readEnvironmentChoice,
  readPortEnvironment,
} from '../runtime-config';
import { validateAgentControlOrigins } from '../src/agentControl';
import { createMeilisearchSdkClient } from '../src/meilisearch';

describe('Runtime numeric configuration', () => {
  const originalDatabasePort = process.env.DB_PORT;
  const originalDatabasePoolMax = process.env.DB_POOL_MAX;
  const originalDatabasePoolAcquireTimeout =
    process.env.DB_POOL_ACQUIRE_TIMEOUT_MS;
  const originalDatabaseQueryTimeout = process.env.DB_QUERY_TIMEOUT_MS;
  const originalMeiliTaskTimeout = process.env.MEILISEARCH_TASK_TIMEOUT_MS;
  const originalMeiliRequestTimeout =
    process.env.MEILISEARCH_REQUEST_TIMEOUT_MS;

  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
    if (originalDatabasePort === undefined) {
      delete process.env.DB_PORT;
    } else {
      process.env.DB_PORT = originalDatabasePort;
    }
    if (originalMeiliTaskTimeout === undefined) {
      delete process.env.MEILISEARCH_TASK_TIMEOUT_MS;
    } else {
      process.env.MEILISEARCH_TASK_TIMEOUT_MS = originalMeiliTaskTimeout;
    }
    if (originalDatabasePoolMax === undefined) {
      delete process.env.DB_POOL_MAX;
    } else {
      process.env.DB_POOL_MAX = originalDatabasePoolMax;
    }
    if (originalDatabasePoolAcquireTimeout === undefined) {
      delete process.env.DB_POOL_ACQUIRE_TIMEOUT_MS;
    } else {
      process.env.DB_POOL_ACQUIRE_TIMEOUT_MS =
        originalDatabasePoolAcquireTimeout;
    }
    if (originalDatabaseQueryTimeout === undefined) {
      delete process.env.DB_QUERY_TIMEOUT_MS;
    } else {
      process.env.DB_QUERY_TIMEOUT_MS = originalDatabaseQueryTimeout;
    }
    if (originalMeiliRequestTimeout === undefined) {
      delete process.env.MEILISEARCH_REQUEST_TIMEOUT_MS;
    } else {
      process.env.MEILISEARCH_REQUEST_TIMEOUT_MS = originalMeiliRequestTimeout;
    }
  });

  it('uses defaults only for missing or empty values', () => {
    expect(readBoundedIntegerEnvironment('LIMIT', 20, 1, 100, {})).toBe(20);
    expect(
      readBoundedIntegerEnvironment('LIMIT', 20, 1, 100, { LIMIT: '' }),
    ).toBe(20);
    expect(
      readBoundedIntegerEnvironment('LIMIT', 20, 1, 100, { LIMIT: '0010' }),
    ).toBe(10);
  });

  it.each([' 10', '10 ', '+10', '-10', '1.5', '1e2', '0x10', 'NaN'])(
    'rejects non-decimal integer syntax %p',
    (configured) => {
      expect(() =>
        readBoundedIntegerEnvironment('LIMIT', 20, 1, 100, {
          LIMIT: configured,
        }),
      ).toThrow('LIMIT must be an integer between 1 and 100');
    },
  );

  it('rejects out-of-range and unsafe values', () => {
    for (const configured of ['0', '101', '9007199254740992']) {
      expect(() =>
        readBoundedIntegerEnvironment('LIMIT', 20, 1, 100, {
          LIMIT: configured,
        }),
      ).toThrow('LIMIT must be an integer between 1 and 100');
    }
  });

  it('rejects invalid parser bounds instead of returning an unsafe default', () => {
    expect(() => readBoundedIntegerEnvironment('LIMIT', 0, 1, 100, {})).toThrow(
      'invalid numeric configuration bounds for LIMIT',
    );
    expect(() =>
      readBoundedIntegerEnvironment('LIMIT', 20, 100, 1, {}),
    ).toThrow('invalid numeric configuration bounds for LIMIT');
  });

  it('accepts only valid TCP ports', () => {
    expect(readPortEnvironment('PORT', 3000, { PORT: '1' })).toBe(1);
    expect(readPortEnvironment('PORT', 3000, { PORT: '65535' })).toBe(65535);
    expect(() => readPortEnvironment('PORT', 3000, { PORT: '65536' })).toThrow(
      'PORT must be an integer between 1 and 65535',
    );
  });

  it('accepts only explicit runtime modes', () => {
    expect(
      readEnvironmentChoice('RUN_MODE', 'SERVER', ['SERVER', 'AGENT'], {}),
    ).toBe('SERVER');
    expect(
      readEnvironmentChoice('RUN_MODE', 'SERVER', ['SERVER', 'AGENT'], {
        RUN_MODE: 'AGENT',
      }),
    ).toBe('AGENT');
    expect(() =>
      readEnvironmentChoice('RUN_MODE', 'SERVER', ['SERVER', 'AGENT'], {
        RUN_MODE: 'agent',
      }),
    ).toThrow('RUN_MODE must be one of: SERVER, AGENT');
  });

  it('requires exact browser-extension origins in agent mode', () => {
    const message =
      'AGENT_CONTROL_ORIGINS must contain one or more comma-separated chrome-extension:// or moz-extension:// origins when RUN_MODE=AGENT';
    expect(() => validateAgentControlOrigins('AGENT', {})).toThrow(message);
    expect(() =>
      validateAgentControlOrigins('AGENT', {
        AGENT_CONTROL_ORIGINS: '*',
      }),
    ).toThrow(message);
    expect(() =>
      validateAgentControlOrigins('AGENT', {
        AGENT_CONTROL_ORIGINS: 'https://notelix.example',
      }),
    ).toThrow(message);
    expect(() =>
      validateAgentControlOrigins('AGENT', {
        AGENT_CONTROL_ORIGINS:
          'chrome-extension://notelix-extension,moz-extension://local-addon',
      }),
    ).not.toThrow();
    expect(() => validateAgentControlOrigins('SERVER', {})).not.toThrow();
  });

  it('rejects ambiguous boolean values', () => {
    expect(readBooleanEnvironment('ENABLED', false, { ENABLED: 'true' })).toBe(
      true,
    );
    expect(readBooleanEnvironment('ENABLED', true, { ENABLED: 'false' })).toBe(
      false,
    );
    expect(() =>
      readBooleanEnvironment('ENABLED', false, { ENABLED: 'sometimes' }),
    ).toThrow('ENABLED must be true or false');
  });

  it('fails while loading database configuration with an invalid port', () => {
    process.env.DB_PORT = '5432.5';

    expect(() => jest.isolateModules(() => require('../ormconfig'))).toThrow(
      'DB_PORT must be an integer between 1 and 65535',
    );
  });

  it('passes bounded pool and query deadlines to PostgreSQL', () => {
    process.env.DB_POOL_MAX = '7';
    process.env.DB_POOL_ACQUIRE_TIMEOUT_MS = '1500';
    process.env.DB_QUERY_TIMEOUT_MS = '45000';

    jest.isolateModules(() => {
      const config = jest.requireActual<{
        poolSize: number;
        extra: {
          connectionTimeoutMillis: number;
          statement_timeout: number;
          query_timeout: number;
        };
      }>('../ormconfig');
      expect(config.poolSize).toBe(7);
      expect(config.extra).toEqual({
        connectionTimeoutMillis: 1500,
        statement_timeout: 45000,
        query_timeout: 45000,
      });
    });
  });

  it('fails while loading Meilisearch with an unsafe task timeout', () => {
    process.env.MEILISEARCH_TASK_TIMEOUT_MS = '0';

    expect(() =>
      jest.isolateModules(() => require('../src/meilisearch')),
    ).toThrow(
      'MEILISEARCH_TASK_TIMEOUT_MS must be an integer between 100 and 600000',
    );
  });

  it('aborts a stalled Meilisearch HTTP request at its configured deadline', async () => {
    let requestSignal: AbortSignal | undefined;
    jest.spyOn(global, 'fetch').mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          requestSignal = init?.signal || undefined;
          requestSignal?.addEventListener('abort', () => {
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          });
        }),
    );
    const client = createMeilisearchSdkClient({
      MEILISEARCH_HOST: 'http://meilisearch.invalid',
      MEILISEARCH_REQUEST_TIMEOUT_MS: '100',
    });

    const startedAt = Date.now();
    await expect(client.health()).rejects.toThrow();
    expect(Date.now() - startedAt).toBeLessThan(1000);
    expect(requestSignal?.aborted).toBe(true);
  });
});
