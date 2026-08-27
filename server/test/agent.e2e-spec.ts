import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { createValidationPipe } from '../src/application';
import {
  AgentSyncController,
  createAgentSyncSourceIdentity,
  normalizeAgentSyncAnnotation,
  normalizeAgentSyncUrl,
  parseAgentSyncState,
  parseSyncCursor,
} from '../src/controllers/agentSyncController';
import { meilisearchClient } from '../src/meilisearch';
import { Annotation } from '../src/models/annotation.entity';
import {
  AnnotationChangeHistoryKindDelete,
  AnnotationChangeHistoryKindSave,
} from '../src/models/annotationChangeHistory.entity';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { AppDataSource } from '../src/database';
import * as agentSearchIndex from '../src/services/agentSearchIndex';
import { isAgentControlOriginAllowed } from '../src/agentControl';

describe('Agent control API', () => {
  let app: INestApplication;
  const originalRunMode = process.env.RUN_MODE;
  const originalRequestTimeout = process.env.AGENT_SYNC_REQUEST_TIMEOUT_MS;
  const originalMaxResponseBytes = process.env.AGENT_SYNC_MAX_RESPONSE_BYTES;
  const originalMaxDiffPages = process.env.AGENT_SYNC_MAX_DIFF_PAGES_PER_CYCLE;
  const originalMaxSnapshotPages =
    process.env.AGENT_SYNC_MAX_SNAPSHOT_PAGES_PER_CYCLE;
  const originalStatePath = process.env.AGENT_SYNC_STATE_PATH;
  const originalAgentControlOrigins = process.env.AGENT_CONTROL_ORIGINS;
  const originalSyncUrlOverride = process.env.AGENT_SYNC_URL_OVERRIDE;
  const temporaryDirectories: string[] = [];

  const validConfig = {
    enabled: true,
    url: 'https://notelix.example',
    token: 'signed-jwt',
    clientSideEncryptionKey: null,
  };

  function makeSyncAnnotation(
    id: number,
    uid: string,
    overrides: Record<string, unknown> = {},
  ) {
    return {
      id,
      uid,
      url: `https://example.com/${uid}`,
      title: uid,
      host: 'example.com',
      data: {},
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-02T00:00:00.000Z',
      ...overrides,
    };
  }

  function configureController(
    controller: AgentSyncController,
    config = validConfig,
  ): void {
    controller.config = {
      ...controller.config,
      ...config,
      clientSideEncryptionKey: config.clientSideEncryptionKey || '',
      sourceIdentity: createAgentSyncSourceIdentity(config),
    };
  }

  function unsignedJwt(payload: Record<string, unknown>, signature: string) {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString(
      'base64url',
    );
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${header}.${body}.${signature}`;
  }

  function readPersistedCursor(): number | null {
    const state = parseAgentSyncState(
      fs.readFileSync(process.env.AGENT_SYNC_STATE_PATH, 'utf8'),
    );
    return state?.version === 1 ? state.cursor : null;
  }

  beforeEach(async () => {
    delete process.env.RUN_MODE;
    process.env.AGENT_CONTROL_ORIGINS = 'chrome-extension://extension-id';
    jest
      .spyOn(agentSearchIndex, 'ensureAgentAnnotationSearchIndexReady')
      .mockResolvedValue(undefined);
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'notelix-agent-test-'),
    );
    temporaryDirectories.push(directory);
    process.env.AGENT_SYNC_STATE_PATH = path.join(directory, 'sync-state');
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
    if (originalMaxDiffPages === undefined) {
      delete process.env.AGENT_SYNC_MAX_DIFF_PAGES_PER_CYCLE;
    } else {
      process.env.AGENT_SYNC_MAX_DIFF_PAGES_PER_CYCLE = originalMaxDiffPages;
    }
    if (originalMaxSnapshotPages === undefined) {
      delete process.env.AGENT_SYNC_MAX_SNAPSHOT_PAGES_PER_CYCLE;
    } else {
      process.env.AGENT_SYNC_MAX_SNAPSHOT_PAGES_PER_CYCLE =
        originalMaxSnapshotPages;
    }
    if (originalStatePath === undefined) {
      delete process.env.AGENT_SYNC_STATE_PATH;
    } else {
      process.env.AGENT_SYNC_STATE_PATH = originalStatePath;
    }
    if (originalAgentControlOrigins === undefined) {
      delete process.env.AGENT_CONTROL_ORIGINS;
    } else {
      process.env.AGENT_CONTROL_ORIGINS = originalAgentControlOrigins;
    }
    if (originalSyncUrlOverride === undefined) {
      delete process.env.AGENT_SYNC_URL_OVERRIDE;
    } else {
      process.env.AGENT_SYNC_URL_OVERRIDE = originalSyncUrlOverride;
    }
    await app.close();
    for (const directory of temporaryDirectories.splice(0)) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects agent commands when the server is not in agent mode', async () => {
    await request(app.getHttpServer())
      .post('/agentsync/set')
      .set('Origin', 'chrome-extension://extension-id')
      .send({ config: validConfig })
      .expect(403);
  });

  it('clears server-only search work before starting the agent loop', async () => {
    process.env.RUN_MODE = 'AGENT';
    const databaseQuery = jest
      .spyOn(AppDataSource.manager, 'query')
      .mockResolvedValue([]);
    const controller = new AgentSyncController();
    const syncLoop = jest
      .spyOn(controller as any, 'syncLoop')
      .mockResolvedValue(undefined);

    await controller.onModuleInit();

    expect(databaseQuery).toHaveBeenCalledWith(
      'DELETE FROM "annotation_search_outbox"',
    );
    expect(syncLoop).toHaveBeenCalledTimes(1);
    await controller.onApplicationShutdown();
  });

  it('rejects website origins in agent mode', async () => {
    process.env.RUN_MODE = 'AGENT';

    await request(app.getHttpServer())
      .post('/agentsync/set')
      .set('Origin', 'https://malicious.example')
      .send({ config: validConfig })
      .expect(403);
  });

  it('rejects extension origins outside the configured allowlist', async () => {
    process.env.RUN_MODE = 'AGENT';

    await request(app.getHttpServer())
      .post('/agentsync/set')
      .set('Origin', 'chrome-extension://untrusted-extension')
      .send({ config: validConfig })
      .expect(403);
  });

  it('accepts the configured extension origin without echoing secrets', async () => {
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

  it('allows only configured browser origins and origin-less local tools', () => {
    expect(isAgentControlOriginAllowed('chrome-extension://extension-id')).toBe(
      true,
    );
    expect(
      isAgentControlOriginAllowed('chrome-extension://other-extension'),
    ).toBe(false);
    expect(isAgentControlOriginAllowed('https://malicious.example')).toBe(
      false,
    );
    expect(isAgentControlOriginAllowed()).toBe(true);
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

  it('pins sync requests to an unambiguous HTTP(S) base URL', async () => {
    expect(normalizeAgentSyncUrl('https://NOTELIX.example/api')).toBe(
      'https://notelix.example/api',
    );
    expect(normalizeAgentSyncUrl('http://127.0.0.1:18555')).toBe(
      'http://127.0.0.1:18555/',
    );
    for (const invalid of [
      'file:///data/token',
      'https://user:password@notelix.example',
      'https://notelix.example?destination=other',
      'https://notelix.example/#other',
    ]) {
      expect(() => normalizeAgentSyncUrl(invalid)).toThrow('agent sync URL');
    }
  });

  it('rejects an unsafe environment URL override before enabling sync', async () => {
    process.env.RUN_MODE = 'AGENT';
    process.env.AGENT_SYNC_URL_OVERRIDE =
      'https://user:password@notelix.example';

    await request(app.getHttpServer())
      .post('/agentsync/set')
      .set('Origin', 'chrome-extension://extension-id')
      .send({ config: validConfig })
      .expect(400);

    expect(app.get(AgentSyncController).config.enabled).toBe(false);
  });

  it('applies annotation-only history snapshots without a user object', async () => {
    const snapshot = makeSyncAnnotation(12, 'annotation-uid', {
      url: 'https://example.com/article',
      title: 'Article',
      data: { text: 'highlighted text' },
    });
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

  it('rejects malformed remote annotations before local mutations', async () => {
    const persist = jest.spyOn(Annotation, 'agentSyncPersist');
    const index = jest.spyOn(meilisearchClient, 'IndexAnnotation');

    for (const malformed of [
      makeSyncAnnotation(0, 'zero-id'),
      makeSyncAnnotation(1, ''),
      makeSyncAnnotation(1, 'array-data', { data: [] }),
      makeSyncAnnotation(1, 'bad-date', { updated_at: 'not-a-date' }),
    ]) {
      await expect(
        new AgentSyncController().applyDiff({
          kind: AnnotationChangeHistoryKindSave,
          data: malformed,
        }),
      ).rejects.toThrow('agent annotation');
    }

    expect(persist).not.toHaveBeenCalled();
    expect(index).not.toHaveBeenCalled();
  });

  it('keeps only protocol fields from remote annotations', () => {
    const expected = makeSyncAnnotation(12, 'annotation-uid');
    const normalized = normalizeAgentSyncAnnotation({
      ...expected,
      user: { id: 999 },
      password: 'remote-secret',
    });

    expect(normalized).toEqual(expected);
    expect(normalized).not.toHaveProperty('user');
    expect(normalized).not.toHaveProperty('password');
  });

  it('replays deletes idempotently and ignores remote entity fields', async () => {
    const remove = jest.spyOn(Annotation, 'delete').mockResolvedValue({
      raw: [],
      affected: 0,
    });
    const unindex = jest
      .spyOn(meilisearchClient, 'UnIndexAnnotation')
      .mockResolvedValue(undefined);
    const controller = new AgentSyncController();

    await controller.applyDiff({
      kind: AnnotationChangeHistoryKindDelete,
      data: { id: 12, user: { id: 999 }, password: 'remote-secret' },
    });

    expect(remove).toHaveBeenCalledWith({ id: 12 });
    expect(unindex).toHaveBeenCalledWith({ id: 12 });
  });

  it('fences a superseded delete before its database mutation', async () => {
    const remove = jest.spyOn(Annotation, 'delete');

    await expect(
      new AgentSyncController().applyDiff(
        { kind: AnnotationChangeHistoryKindDelete, data: { id: 12 } },
        () => {
          throw new Error('sync superseded');
        },
      ),
    ).rejects.toThrow('sync superseded');
    expect(remove).not.toHaveBeenCalled();
  });

  it('does not assign remote relations while updating an existing row', async () => {
    const originalUser = { id: 0 } as any;
    const existing = Object.assign(
      new Annotation(),
      makeSyncAnnotation(12, 'old-uid'),
      { user: originalUser },
    );
    jest.spyOn(Annotation, 'findOne').mockResolvedValue(existing);
    const save = jest.spyOn(existing, 'save').mockResolvedValue(existing);

    await Annotation.agentSyncPersist({
      ...makeSyncAnnotation(12, 'new-uid'),
      user: { id: 999 },
      password: 'remote-secret',
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(existing.uid).toBe('new-uid');
    expect(existing.user).toBe(originalUser);
    expect(existing).not.toHaveProperty('password');
  });

  it('rejects unsupported history kinds instead of advancing past them', async () => {
    await expect(
      new AgentSyncController().applyDiff({ kind: 999, data: {} }),
    ).rejects.toThrow('unsupported annotation diff kind 999');
  });

  it('fences a superseded diff before its first persistence mutation', async () => {
    const controller = new AgentSyncController();
    jest
      .spyOn(controller, 'decryptAnnotation')
      .mockResolvedValue({ id: 12, data: {} });
    const persist = jest
      .spyOn(Annotation, 'agentSyncPersist')
      .mockResolvedValue(undefined);

    await expect(
      controller.applyDiff(
        { kind: AnnotationChangeHistoryKindSave, data: { id: 12 } },
        () => {
          throw new Error('sync superseded');
        },
      ),
    ).rejects.toThrow('sync superseded');
    expect(persist).not.toHaveBeenCalled();
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

  it('derives stable non-secret identities for refreshed user tokens', () => {
    const firstToken = unsignedJwt(
      { iss: 'notelix', id: 7, tokenVersion: 2, iat: 1, exp: 2 },
      'first-signature',
    );
    const refreshedToken = unsignedJwt(
      { iss: 'notelix', id: 7, tokenVersion: 2, iat: 3, exp: 4 },
      'second-signature',
    );
    const firstIdentity = createAgentSyncSourceIdentity({
      ...validConfig,
      token: firstToken,
    });
    const refreshedIdentity = createAgentSyncSourceIdentity({
      ...validConfig,
      token: refreshedToken,
    });

    expect(refreshedIdentity).toBe(firstIdentity);
    expect(firstIdentity).toMatch(/^[a-f\d]{64}$/);
    expect(firstIdentity).not.toContain(firstToken);
    expect(
      createAgentSyncSourceIdentity({
        ...validConfig,
        token: unsignedJwt(
          { iss: 'notelix', id: 8, tokenVersion: 2 },
          'third-signature',
        ),
      }),
    ).not.toBe(firstIdentity);
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

    delete process.env.AGENT_SYNC_MAX_RESPONSE_BYTES;
    process.env.AGENT_SYNC_MAX_DIFF_PAGES_PER_CYCLE = '101';
    expect(() => new AgentSyncController()).toThrow(
      'AGENT_SYNC_MAX_DIFF_PAGES_PER_CYCLE must be an integer between 1 and 100',
    );

    delete process.env.AGENT_SYNC_MAX_DIFF_PAGES_PER_CYCLE;
    process.env.AGENT_SYNC_MAX_SNAPSHOT_PAGES_PER_CYCLE = '0';
    expect(() => new AgentSyncController()).toThrow(
      'AGENT_SYNC_MAX_SNAPSHOT_PAGES_PER_CYCLE must be an integer between 1 and 100',
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
    const sourceIdentity = createAgentSyncSourceIdentity(validConfig);

    (controller as any).saveAnnotationChangeHistoryLatestId(0, sourceIdentity);
    expect(parseAgentSyncState(fs.readFileSync(statePath, 'utf8'))).toEqual({
      version: 1,
      sourceIdentity,
      cursor: 0,
    });
    expect(
      (controller as any).getAnnotationChangeHistoryLatestId(sourceIdentity),
    ).toBe(0);

    (controller as any).saveAnnotationChangeHistoryLatestId(41, sourceIdentity);
    expect(readPersistedCursor()).toBe(41);
    expect(fs.readdirSync(directory)).toEqual(['cursor']);

    fs.writeFileSync(statePath, 'partial-write', 'utf8');
    expect(
      (controller as any).getAnnotationChangeHistoryLatestId(sourceIdentity),
    ).toBeNull();
  });

  it('treats a persisted zero cursor as initialized incremental state', async () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'notelix-agent-zero-cursor-'),
    );
    temporaryDirectories.push(directory);
    const statePath = path.join(directory, 'cursor');
    process.env.AGENT_SYNC_STATE_PATH = statePath;
    const controller = new AgentSyncController();
    configureController(controller);
    (controller as any).saveAnnotationChangeHistoryLatestId(
      0,
      controller.config.sourceIdentity,
    );
    const fetchRequest = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true, diff: [] }), { status: 200 }),
      );

    await (controller as any).sync();

    expect(fetchRequest).toHaveBeenCalledWith(
      'https://notelix.example/annotations/listDiff',
      expect.objectContaining({
        body: JSON.stringify({ sinceId: 0 }),
        redirect: 'error',
      }),
    );
    expect(readPersistedCursor()).toBe(0);
  });

  it('drains bounded diff pages and advances the cursor between requests', async () => {
    const controller = new AgentSyncController();
    configureController(controller);
    (controller as any).saveAnnotationChangeHistoryLatestId(
      0,
      controller.config.sourceIdentity,
    );
    jest.spyOn(controller, 'applyDiff').mockResolvedValue(undefined);
    const fetchRequest = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            diff: [{ id: 1, kind: AnnotationChangeHistoryKindSave }],
            hasMore: true,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            diff: [{ id: 2, kind: AnnotationChangeHistoryKindSave }],
            hasMore: false,
          }),
          { status: 200 },
        ),
      );

    await (controller as any).sync();

    expect(fetchRequest).toHaveBeenNthCalledWith(
      1,
      'https://notelix.example/annotations/listDiff',
      expect.objectContaining({ body: JSON.stringify({ sinceId: 0 }) }),
    );
    expect(fetchRequest).toHaveBeenNthCalledWith(
      2,
      'https://notelix.example/annotations/listDiff',
      expect.objectContaining({ body: JSON.stringify({ sinceId: 1 }) }),
    );
    expect(readPersistedCursor()).toBe(2);
  });

  it('caps diff pages per cycle while retaining progress', async () => {
    process.env.AGENT_SYNC_MAX_DIFF_PAGES_PER_CYCLE = '1';
    const controller = new AgentSyncController();
    configureController(controller);
    (controller as any).saveAnnotationChangeHistoryLatestId(
      0,
      controller.config.sourceIdentity,
    );
    jest.spyOn(controller, 'applyDiff').mockResolvedValue(undefined);
    const fetchRequest = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          diff: [{ id: 1, kind: AnnotationChangeHistoryKindSave }],
          hasMore: true,
        }),
        { status: 200 },
      ),
    );

    await (controller as any).sync();

    expect(fetchRequest).toHaveBeenCalledTimes(1);
    expect(readPersistedCursor()).toBe(1);
  });

  it('preserves state for a refreshed token and invalidates it on source changes', async () => {
    process.env.RUN_MODE = 'AGENT';
    const statePath = process.env.AGENT_SYNC_STATE_PATH;
    const firstConfig = {
      ...validConfig,
      token: unsignedJwt(
        { iss: 'notelix', id: 7, tokenVersion: 0, iat: 1 },
        'first-signature',
      ),
    };
    const refreshedConfig = {
      ...firstConfig,
      token: unsignedJwt(
        { iss: 'notelix', id: 7, tokenVersion: 0, iat: 2 },
        'refreshed-signature',
      ),
    };
    const sourceIdentity = createAgentSyncSourceIdentity(firstConfig);
    const controller = app.get(AgentSyncController);
    const resetData = jest
      .spyOn(controller as any, 'resetData')
      .mockImplementation(async () =>
        (controller as any).clearAgentSyncState(),
      );
    (controller as any).saveAnnotationChangeHistoryLatestId(41, sourceIdentity);

    await request(app.getHttpServer())
      .post('/agentsync/set')
      .set('Origin', 'chrome-extension://extension-id')
      .send({ config: refreshedConfig })
      .expect(201);
    expect(readPersistedCursor()).toBe(41);

    await request(app.getHttpServer())
      .post('/agentsync/set')
      .set('Origin', 'chrome-extension://extension-id')
      .send({
        config: { ...refreshedConfig, url: 'https://other.notelix.example' },
      })
      .expect(201);
    expect(fs.existsSync(statePath)).toBe(false);
    expect(resetData).toHaveBeenCalledTimes(1);
  });

  it('invalidates a legacy cursor that has no source identity', async () => {
    process.env.RUN_MODE = 'AGENT';
    const statePath = process.env.AGENT_SYNC_STATE_PATH;
    fs.writeFileSync(statePath, '41\n', 'utf8');

    await request(app.getHttpServer())
      .post('/agentsync/set')
      .set('Origin', 'chrome-extension://extension-id')
      .send({ config: validConfig })
      .expect(201);

    expect(fs.existsSync(statePath)).toBe(false);
  });

  it('aborts and fences an in-flight sync when its source changes', async () => {
    process.env.RUN_MODE = 'AGENT';
    const controller = app.get(AgentSyncController);
    const resetData = jest
      .spyOn(controller as any, 'resetData')
      .mockResolvedValue(undefined);
    await request(app.getHttpServer())
      .post('/agentsync/set')
      .set('Origin', 'chrome-extension://extension-id')
      .send({ config: validConfig })
      .expect(201);
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

    const syncPromise = (controller as any).runSync();
    const syncRejection = expect(syncPromise).rejects.toThrow(
      'agent sync configuration changed',
    );
    await request(app.getHttpServer())
      .post('/agentsync/set')
      .set('Origin', 'chrome-extension://extension-id')
      .send({
        config: { ...validConfig, url: 'https://other.notelix.example' },
      })
      .expect(201);

    await syncRejection;
    expect(requestSignal.aborted).toBe(true);
    expect(fs.existsSync(process.env.AGENT_SYNC_STATE_PATH)).toBe(false);
    expect(resetData).toHaveBeenCalledTimes(1);
  });

  it('retries a failed source-data purge before accepting the source', async () => {
    process.env.RUN_MODE = 'AGENT';
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const controller = app.get(AgentSyncController);
    configureController(controller);
    const resetData = jest
      .spyOn(controller as any, 'resetData')
      .mockRejectedValueOnce(new Error('search unavailable'))
      .mockResolvedValueOnce(undefined);
    const nextConfig = {
      ...validConfig,
      url: 'https://other.notelix.example',
    };

    await request(app.getHttpServer())
      .post('/agentsync/set')
      .set('Origin', 'chrome-extension://extension-id')
      .send({ config: nextConfig })
      .expect(500);

    await request(app.getHttpServer())
      .post('/agentsync/set')
      .set('Origin', 'chrome-extension://extension-id')
      .send({ config: nextConfig })
      .expect(201);

    expect(resetData).toHaveBeenCalledTimes(2);
  });

  it('applies bounded full-snapshot pages before saving their watermark', async () => {
    const controller = new AgentSyncController();
    configureController(controller);
    const events: string[] = [];
    jest.spyOn(controller as any, 'resetData').mockImplementation(async () => {
      events.push('reset');
    });
    jest
      .spyOn(Annotation, 'agentSyncPersist')
      .mockImplementation(async (annotation) => {
        events.push(`persist-${annotation.id}`);
      });
    jest
      .spyOn(meilisearchClient, 'IndexAnnotation')
      .mockResolvedValue(undefined);
    const snapshotId = '123e4567-e89b-42d3-a456-426614174000';
    const annotationOne = makeSyncAnnotation(1, 'one');
    const annotationTwo = makeSyncAnnotation(2, 'two');
    const fetchRequest = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            list: [annotationOne],
            annotationChangeHistoryLatestId: 7,
            snapshotId,
            nextAfterId: 1,
            hasMore: true,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            list: [annotationTwo],
            annotationChangeHistoryLatestId: 7,
            snapshotId,
            nextAfterId: 2,
            hasMore: false,
          }),
          { status: 200 },
        ),
      );

    await (controller as any).sync();

    expect(events).toEqual(['reset', 'persist-1', 'persist-2']);
    expect(fetchRequest).toHaveBeenNthCalledWith(
      1,
      'https://notelix.example/annotations/listPage',
      expect.objectContaining({ body: '{}' }),
    );
    expect(fetchRequest).toHaveBeenNthCalledWith(
      2,
      'https://notelix.example/annotations/listPage',
      expect.objectContaining({
        body: JSON.stringify({ snapshotId, afterId: 1 }),
      }),
    );
    expect(readPersistedCursor()).toBe(7);
  });

  it('checkpoints a bounded snapshot cycle and resumes it after restart', async () => {
    process.env.AGENT_SYNC_MAX_SNAPSHOT_PAGES_PER_CYCLE = '1';
    const snapshotId = '123e4567-e89b-42d3-a456-426614174000';
    const persist = jest
      .spyOn(Annotation, 'agentSyncPersist')
      .mockResolvedValue(undefined);
    jest
      .spyOn(meilisearchClient, 'IndexAnnotation')
      .mockResolvedValue(undefined);
    const fetchRequest = jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          list: [makeSyncAnnotation(1, 'one')],
          annotationChangeHistoryLatestId: 7,
          snapshotId,
          nextAfterId: 1,
          hasMore: true,
        }),
        { status: 200 },
      ),
    );
    const firstController = new AgentSyncController();
    configureController(firstController);
    const firstReset = jest
      .spyOn(firstController as any, 'resetData')
      .mockResolvedValue(undefined);

    await (firstController as any).sync();

    expect(firstReset).toHaveBeenCalledTimes(1);
    expect(
      parseAgentSyncState(
        fs.readFileSync(process.env.AGENT_SYNC_STATE_PATH, 'utf8'),
      ),
    ).toEqual({
      version: 2,
      sourceIdentity: firstController.config.sourceIdentity,
      snapshotId,
      afterId: 1,
      watermark: 7,
    });

    fetchRequest.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          list: [makeSyncAnnotation(2, 'two')],
          annotationChangeHistoryLatestId: 7,
          snapshotId,
          nextAfterId: 2,
          hasMore: false,
        }),
        { status: 200 },
      ),
    );
    const resumedController = new AgentSyncController();
    configureController(resumedController);
    const resumedReset = jest.spyOn(resumedController as any, 'resetData');

    await (resumedController as any).sync();

    expect(resumedReset).not.toHaveBeenCalled();
    expect(fetchRequest).toHaveBeenNthCalledWith(
      2,
      'https://notelix.example/annotations/listPage',
      expect.objectContaining({
        body: JSON.stringify({ snapshotId, afterId: 1 }),
      }),
    );
    expect(persist.mock.calls.map(([annotation]) => annotation.id)).toEqual([
      1, 2,
    ]);
    expect(readPersistedCursor()).toBe(7);
  });

  it('replays a partially persisted snapshot page from its last checkpoint', async () => {
    const snapshotId = '123e4567-e89b-42d3-a456-426614174000';
    const controller = new AgentSyncController();
    configureController(controller);
    (controller as any).saveSnapshotProgress(
      controller.config.sourceIdentity,
      snapshotId,
      1,
      7,
    );
    const page = new Response(
      JSON.stringify({
        list: [makeSyncAnnotation(2, 'two'), makeSyncAnnotation(3, 'three')],
        annotationChangeHistoryLatestId: 7,
        snapshotId,
        nextAfterId: 3,
        hasMore: false,
      }),
      { status: 200 },
    );
    const fetchRequest = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(page)
      .mockResolvedValueOnce(page.clone());
    const persistedIds: number[] = [];
    let failOnce = true;
    jest
      .spyOn(Annotation, 'agentSyncPersist')
      .mockImplementation(async (annotation) => {
        persistedIds.push(annotation.id);
        if (annotation.id === 3 && failOnce) {
          failOnce = false;
          throw new Error('simulated persistence failure');
        }
      });
    jest
      .spyOn(meilisearchClient, 'IndexAnnotation')
      .mockResolvedValue(undefined);
    const resetData = jest.spyOn(controller as any, 'resetData');

    await expect((controller as any).sync()).rejects.toThrow(
      'simulated persistence failure',
    );
    expect(
      parseAgentSyncState(
        fs.readFileSync(process.env.AGENT_SYNC_STATE_PATH, 'utf8'),
      ),
    ).toEqual({
      version: 2,
      sourceIdentity: controller.config.sourceIdentity,
      snapshotId,
      afterId: 1,
      watermark: 7,
    });

    await (controller as any).sync();

    expect(fetchRequest).toHaveBeenCalledTimes(2);
    expect(persistedIds).toEqual([2, 3, 2, 3]);
    expect(resetData).not.toHaveBeenCalled();
    expect(readPersistedCursor()).toBe(7);
  });

  it('discards expired snapshot progress before starting over', async () => {
    const snapshotId = '123e4567-e89b-42d3-a456-426614174000';
    const controller = new AgentSyncController();
    configureController(controller);
    (controller as any).saveSnapshotProgress(
      controller.config.sourceIdentity,
      snapshotId,
      1,
      7,
    );
    const resetData = jest.spyOn(controller as any, 'resetData');
    const fetchRequest = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('expired', { status: 410 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            list: [],
            annotationChangeHistoryLatestId: 8,
            snapshotId: '123e4567-e89b-42d3-a456-426614174001',
            nextAfterId: 0,
            hasMore: false,
          }),
          { status: 200 },
        ),
      );

    await (controller as any).sync();

    expect(resetData).not.toHaveBeenCalled();
    expect(fs.existsSync(process.env.AGENT_SYNC_STATE_PATH)).toBe(false);

    resetData.mockResolvedValue(undefined);
    await (controller as any).sync();

    expect(fetchRequest).toHaveBeenNthCalledWith(
      2,
      'https://notelix.example/annotations/listPage',
      expect.objectContaining({ body: '{}' }),
    );
    expect(resetData).toHaveBeenCalledTimes(1);
    expect(readPersistedCursor()).toBe(8);
  });

  it('falls back to the legacy full-list endpoint for older servers', async () => {
    const controller = new AgentSyncController();
    configureController(controller);
    jest.spyOn(controller as any, 'resetData').mockResolvedValue(undefined);
    const fetchRequest = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            list: [],
            annotationChangeHistoryLatestId: 0,
          }),
          { status: 200 },
        ),
      );

    await (controller as any).sync();

    expect(fetchRequest.mock.calls[0][0]).toBe(
      'https://notelix.example/annotations/listPage',
    );
    expect(fetchRequest.mock.calls[1][0]).toBe(
      'https://notelix.example/annotations/list',
    );
    expect(readPersistedCursor()).toBe(0);
  });

  it('preserves local data when a full snapshot request fails', async () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'notelix-agent-failed-snapshot-'),
    );
    temporaryDirectories.push(directory);
    process.env.AGENT_SYNC_STATE_PATH = path.join(directory, 'missing-cursor');
    const controller = new AgentSyncController();
    configureController(controller);
    const resetData = jest.spyOn(controller as any, 'resetData');
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('upstream unavailable', { status: 503 }));

    await expect((controller as any).sync()).rejects.toThrow(
      'annotation snapshot request failed with status 503',
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
