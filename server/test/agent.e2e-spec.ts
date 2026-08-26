import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { createValidationPipe } from '../src/application';
import {
  AgentSyncController,
  parseSyncCursor,
} from '../src/controllers/agentSyncController';
import { meilisearchClient } from '../src/meilisearch';
import { Annotation } from '../src/models/annotation.entity';
import { AnnotationChangeHistoryKindSave } from '../src/models/annotationChangeHistory.entity';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

describe('Agent control API', () => {
  let app: INestApplication;
  const originalRunMode = process.env.RUN_MODE;
  const originalRequestTimeout = process.env.AGENT_SYNC_REQUEST_TIMEOUT_MS;
  const originalMaxResponseBytes = process.env.AGENT_SYNC_MAX_RESPONSE_BYTES;
  const originalStatePath = process.env.AGENT_SYNC_STATE_PATH;
  const temporaryDirectories: string[] = [];

  const validConfig = {
    enabled: true,
    url: 'https://notelix.example',
    token: 'signed-jwt',
    clientSideEncryptionKey: null,
  };

  beforeEach(async () => {
    delete process.env.RUN_MODE;
    const moduleRef = await Test.createTestingModule({
      controllers: [AgentSyncController],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    if (originalRunMode === undefined) {
      delete process.env.RUN_MODE;
    } else {
      process.env.RUN_MODE = originalRunMode;
    }
    if (originalRequestTimeout === undefined) {
      delete process.env.AGENT_SYNC_REQUEST_TIMEOUT_MS;
    } else {
      process.env.AGENT_SYNC_REQUEST_TIMEOUT_MS = originalRequestTimeout;
    }
    if (originalMaxResponseBytes === undefined) {
      delete process.env.AGENT_SYNC_MAX_RESPONSE_BYTES;
    } else {
      process.env.AGENT_SYNC_MAX_RESPONSE_BYTES = originalMaxResponseBytes;
    }
    if (originalStatePath === undefined) {
      delete process.env.AGENT_SYNC_STATE_PATH;
    } else {
      process.env.AGENT_SYNC_STATE_PATH = originalStatePath;
    }
    for (const directory of temporaryDirectories.splice(0)) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
    await app.close();
  });

  it('rejects agent commands when the server is not in agent mode', async () => {
    await request(app.getHttpServer())
      .post('/agentsync/set')
      .set('Origin', 'chrome-extension://extension-id')
      .send({ config: validConfig })
      .expect(403);
  });

  it('rejects website origins in agent mode', async () => {
    process.env.RUN_MODE = 'AGENT';

    await request(app.getHttpServer())
      .post('/agentsync/set')
      .set('Origin', 'https://malicious.example')
      .send({ config: validConfig })
      .expect(403);
  });

  it('accepts extension origins without echoing secrets', async () => {
    process.env.RUN_MODE = 'AGENT';

    const response = await request(app.getHttpServer())
      .post('/agentsync/set')
      .set('Origin', 'chrome-extension://extension-id')
      .send({ config: validConfig })
      .expect(201);

    expect(response.body).toEqual({ ok: true, enabled: true });
    expect(response.body).not.toHaveProperty('token');
    expect(response.body).not.toHaveProperty('clientSideEncryptionKey');
  });

  it('validates agent configuration fields', async () => {
    process.env.RUN_MODE = 'AGENT';

    await request(app.getHttpServer())
      .post('/agentsync/set')
      .set('Origin', 'chrome-extension://extension-id')
      .send({
        config: {
          ...validConfig,
          url: 'file:///etc/passwd',
        },
      })
      .expect(400);
  });

  it('applies annotation-only history snapshots without a user object', async () => {
    const snapshot = {
      id: 12,
      uid: 'annotation-uid',
      url: 'https://example.com/article',
      title: 'Article',
      host: 'example.com',
      data: { text: 'highlighted text' },
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-02T00:00:00.000Z',
    };
    const persist = jest
      .spyOn(Annotation, 'agentSyncPersist')
      .mockResolvedValue(undefined);
    const index = jest
      .spyOn(meilisearchClient, 'IndexAnnotation')
      .mockResolvedValue(undefined);

    await new AgentSyncController().applyDiff({
      kind: AnnotationChangeHistoryKindSave,
      data: snapshot,
    });

    expect(persist).toHaveBeenCalledWith(snapshot);
    expect(index).toHaveBeenCalledWith(snapshot);
  });

  it('rejects unsupported history kinds instead of advancing past them', async () => {
    await expect(
      new AgentSyncController().applyDiff({ kind: 999, data: {} }),
    ).rejects.toThrow('unsupported annotation diff kind 999');
  });

  it('parses only non-negative safe integer sync cursors', () => {
    expect(parseSyncCursor('0\n')).toBe(0);
    expect(parseSyncCursor(Number.MAX_SAFE_INTEGER.toString())).toBe(
      Number.MAX_SAFE_INTEGER,
    );
    expect(parseSyncCursor('')).toBeNull();
    expect(parseSyncCursor('-1')).toBeNull();
    expect(parseSyncCursor('1.5')).toBeNull();
    expect(parseSyncCursor('9007199254740992')).toBeNull();
    expect(parseSyncCursor('partial-write')).toBeNull();
  });

  it('rejects unsafe sync request limits at startup', () => {
    process.env.AGENT_SYNC_REQUEST_TIMEOUT_MS = '99';
    expect(() => new AgentSyncController()).toThrow(
      'AGENT_SYNC_REQUEST_TIMEOUT_MS must be an integer between 100 and 300000',
    );

    delete process.env.AGENT_SYNC_REQUEST_TIMEOUT_MS;
    process.env.AGENT_SYNC_MAX_RESPONSE_BYTES = '512';
    expect(() => new AgentSyncController()).toThrow(
      'AGENT_SYNC_MAX_RESPONSE_BYTES must be an integer between 1024 and 268435456',
    );
  });

  it('atomically persists zero and positive sync cursors', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'notelix-agent-cursor-'),
    );
    temporaryDirectories.push(directory);
    const statePath = path.join(directory, 'cursor');
    process.env.AGENT_SYNC_STATE_PATH = statePath;
    const controller = new AgentSyncController();

    (controller as any).saveAnnotationChangeHistoryLatestId(0);
    expect(fs.readFileSync(statePath, 'utf8')).toBe('0\n');
    expect((controller as any).getAnnotationChangeHistoryLatestId()).toBe(0);

    (controller as any).saveAnnotationChangeHistoryLatestId(41);
    expect(fs.readFileSync(statePath, 'utf8')).toBe('41\n');
    expect(fs.readdirSync(directory)).toEqual(['cursor']);

    fs.writeFileSync(statePath, 'partial-write', 'utf8');
    expect((controller as any).getAnnotationChangeHistoryLatestId()).toBeNull();
  });

  it('treats a persisted zero cursor as initialized incremental state', async () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'notelix-agent-zero-cursor-'),
    );
    temporaryDirectories.push(directory);
    const statePath = path.join(directory, 'cursor');
    fs.writeFileSync(statePath, '0\n', 'utf8');
    process.env.AGENT_SYNC_STATE_PATH = statePath;
    const controller = new AgentSyncController();
    controller.config.url = 'https://notelix.example';
    controller.config.token = 'signed-jwt';
    const fetchRequest = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true, diff: [] }), { status: 200 }),
      );

    await (controller as any).sync();

    expect(fetchRequest).toHaveBeenCalledWith(
      'https://notelix.example/annotations/listDiff',
      expect.objectContaining({ body: JSON.stringify({ sinceId: 0 }) }),
    );
    expect(fs.readFileSync(statePath, 'utf8')).toBe('0\n');
  });

  it('preserves local data when a full snapshot request fails', async () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'notelix-agent-failed-snapshot-'),
    );
    temporaryDirectories.push(directory);
    process.env.AGENT_SYNC_STATE_PATH = path.join(directory, 'missing-cursor');
    const controller = new AgentSyncController();
    controller.config.url = 'https://notelix.example';
    controller.config.token = 'signed-jwt';
    const resetData = jest.spyOn(controller as any, 'resetData');
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('upstream unavailable', { status: 503 }));

    await expect((controller as any).sync()).rejects.toThrow(
      'annotation list request failed with status 503',
    );
    expect(resetData).not.toHaveBeenCalled();
  });

  it('times out a stalled remote sync request', async () => {
    process.env.AGENT_SYNC_REQUEST_TIMEOUT_MS = '100';
    const controller = new AgentSyncController();
    controller.config.url = 'https://notelix.example';
    controller.config.token = 'signed-jwt';
    jest.spyOn(global, 'fetch').mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          });
        }),
    );

    await expect(
      (controller as any).requestJson(
        'annotation list request',
        '/annotations/list',
      ),
    ).rejects.toThrow('annotation list request timed out after 100ms');
  });

  it('rejects an oversized sync response while streaming it', async () => {
    process.env.AGENT_SYNC_MAX_RESPONSE_BYTES = '1024';
    const controller = new AgentSyncController();
    controller.config.url = 'https://notelix.example';
    controller.config.token = 'signed-jwt';
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ payload: 'x'.repeat(2048) }), {
        status: 200,
      }),
    );

    await expect(
      (controller as any).requestJson(
        'annotation list request',
        '/annotations/list',
      ),
    ).rejects.toThrow('annotation list request response exceeded 1024 bytes');
  });

  it('aborts an active sync request during shutdown', async () => {
    const controller = new AgentSyncController();
    controller.config.url = 'https://notelix.example';
    controller.config.token = 'signed-jwt';
    let requestSignal: AbortSignal;
    jest.spyOn(global, 'fetch').mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          requestSignal = init.signal;
          init.signal.addEventListener('abort', () => {
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          });
        }),
    );

    const requestPromise = (controller as any).requestJson(
      'annotation list request',
      '/annotations/list',
    );
    const rejection = expect(requestPromise).rejects.toThrow(
      'annotation list request aborted during shutdown',
    );
    await controller.onApplicationShutdown();
    await rejection;
    expect(requestSignal.aborted).toBe(true);
  });
});
