import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AuthenticationService } from '../src/authenticators/authentication.service';
import { AnnotationsController } from '../src/controllers/annotations.controller';
import { Annotation } from '../src/models/annotation.entity';
import { AnnotationChangeHistory } from '../src/models/annotationChangeHistory.entity';
import AnnotationChangeHistoryService from '../src/services/annotationChangeHistory';
import { AppDataSource } from '../src/database';
import { createValidationPipe } from '../src/application';
import { AnnotationSearchSyncService } from '../src/services/annotationSearchSync';
import { meilisearchClient } from '../src/meilisearch';

describe('Annotations API durability', () => {
  const originalRunMode = process.env.RUN_MODE;
  const originalAgentControlOrigins = process.env.AGENT_CONTROL_ORIGINS;
  let app: INestApplication;
  let authenticationService: { getAuthenticatedUser: jest.Mock };
  let historyService: {
    createAnnotationChangeHistoryForSave: jest.Mock;
    createAnnotationChangeHistoryForDelete: jest.Mock;
    getCachedAnnotationChangeHistoryLatestId: jest.Mock;
  };
  let searchSyncService: {
    enqueue: jest.Mock;
    wake: jest.Mock;
  };
  let annotationRepository: {
    findOne: jest.Mock;
    find: jest.Mock;
    save: jest.Mock;
    remove: jest.Mock;
  };
  let historyRepository: {
    findOne: jest.Mock;
    find: jest.Mock;
  };
  let manager: {
    getRepository: jest.Mock;
    query: jest.Mock;
    transaction: jest.Mock;
  };
  let databaseQuery: jest.SpyInstance;

  const user = {
    id: 9,
    client_side_encryption: '',
  };

  beforeEach(async () => {
    authenticationService = {
      getAuthenticatedUser: jest.fn().mockResolvedValue(user),
    };
    historyService = {
      createAnnotationChangeHistoryForSave: jest.fn(),
      createAnnotationChangeHistoryForDelete: jest.fn(),
      getCachedAnnotationChangeHistoryLatestId: jest.fn(),
    };
    searchSyncService = {
      enqueue: jest.fn().mockResolvedValue(undefined),
      wake: jest.fn(),
    };
    annotationRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
    };
    historyRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
    };
    manager = {
      getRepository: jest.fn((entity) =>
        entity === Annotation ? annotationRepository : historyRepository,
      ),
      query: jest.fn(),
      transaction: jest.fn(async (...args) => {
        const callback = args[args.length - 1];
        return callback(manager);
      }),
    };
    jest
      .spyOn(AppDataSource, 'transaction')
      .mockImplementation(manager.transaction);
    databaseQuery = jest
      .spyOn(AppDataSource.manager, 'query')
      .mockResolvedValue([]);
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const moduleRef = await Test.createTestingModule({
      controllers: [AnnotationsController],
      providers: [
        {
          provide: AuthenticationService,
          useValue: authenticationService,
        },
        {
          provide: AnnotationChangeHistoryService,
          useValue: historyService,
        },
        {
          provide: AnnotationSearchSyncService,
          useValue: searchSyncService,
        },
      ],
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
    if (originalAgentControlOrigins === undefined) {
      delete process.env.AGENT_CONTROL_ORIGINS;
    } else {
      process.env.AGENT_CONTROL_ORIGINS = originalAgentControlOrigins;
    }
    await app.close();
  });

  it('commits annotation and sync history before acknowledging a save', async () => {
    const events = [];
    annotationRepository.findOne.mockResolvedValue(undefined);
    manager.query.mockImplementation(async () => {
      events.push('lock');
    });
    annotationRepository.save.mockImplementation(async (annotation) => {
      events.push('annotation');
      annotation.id = 12;
      return annotation;
    });
    historyService.createAnnotationChangeHistoryForSave.mockImplementation(
      async () => {
        events.push('history');
        return { id: 34 };
      },
    );
    searchSyncService.enqueue.mockImplementation(async () => {
      events.push('outbox');
    });
    searchSyncService.wake.mockImplementation(() => {
      events.push('wake');
    });
    manager.transaction.mockImplementation(async (...args) => {
      const callback = args[args.length - 1];
      const result = await callback(manager);
      events.push('commit');
      return result;
    });
    await request(app.getHttpServer())
      .post('/annotations/save')
      .send({
        uid: 'annotation-uid',
        url: 'https://example.com',
        data: { text: 'important text' },
      })
      .expect(201);

    expect(events).toEqual([
      'lock',
      'annotation',
      'history',
      'outbox',
      'commit',
      'wake',
    ]);
    expect(manager.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      ['notelix-annotation:9:annotation-uid'],
    );
    expect(
      historyService.createAnnotationChangeHistoryForSave,
    ).toHaveBeenCalledWith(expect.objectContaining({ id: 12 }), manager);
    expect(searchSyncService.enqueue).toHaveBeenCalledWith(12, manager);
  });

  it('does not acknowledge or enqueue a save when history persistence fails', async () => {
    annotationRepository.findOne.mockResolvedValue(undefined);
    annotationRepository.save.mockImplementation(async (annotation) => {
      annotation.id = 12;
      return annotation;
    });
    historyService.createAnnotationChangeHistoryForSave.mockRejectedValue(
      new Error('history unavailable'),
    );
    await request(app.getHttpServer())
      .post('/annotations/save')
      .send({ uid: 'annotation-uid', data: {} })
      .expect(500);

    expect(searchSyncService.enqueue).not.toHaveBeenCalled();
    expect(searchSyncService.wake).not.toHaveBeenCalled();
  });

  it('does not acknowledge a save unless its search retry is durable', async () => {
    annotationRepository.findOne.mockResolvedValue(undefined);
    annotationRepository.save.mockImplementation(async (annotation) => {
      annotation.id = 12;
      return annotation;
    });
    historyService.createAnnotationChangeHistoryForSave.mockResolvedValue({
      id: 34,
    });
    searchSyncService.enqueue.mockRejectedValue(
      new Error('search outbox unavailable'),
    );

    await request(app.getHttpServer())
      .post('/annotations/save')
      .send({ uid: 'annotation-uid', data: {} })
      .expect(500);

    expect(searchSyncService.wake).not.toHaveBeenCalled();
  });

  it('commits deletion history and search retry together', async () => {
    const annotation = Object.assign(new Annotation(), {
      id: 12,
      uid: 'annotation-uid',
      user,
      data: {},
    });
    annotationRepository.findOne.mockResolvedValue(annotation);
    annotationRepository.remove.mockImplementation(async (removed) => {
      removed.id = undefined;
      return removed;
    });
    historyService.createAnnotationChangeHistoryForDelete.mockResolvedValue({
      id: 35,
    });
    await request(app.getHttpServer())
      .post('/annotations/delete')
      .send({ uid: 'annotation-uid' })
      .expect(201);

    expect(
      historyService.createAnnotationChangeHistoryForDelete,
    ).toHaveBeenCalledWith(expect.objectContaining({ id: 12 }), manager);
    expect(manager.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      ['notelix-annotation:9:annotation-uid'],
    );
    expect(searchSyncService.enqueue).toHaveBeenCalledWith(12, manager);
    expect(searchSyncService.wake).toHaveBeenCalledTimes(1);
  });

  it('returns a full snapshot and watermark from one repeatable-read transaction', async () => {
    const annotation = Object.assign(new Annotation(), {
      id: 12,
      uid: 'annotation-uid',
      user,
      data: {},
    });
    annotationRepository.find.mockResolvedValue([annotation]);
    const getLatestId = jest
      .spyOn(AnnotationChangeHistory, 'getLatestIdForUser')
      .mockResolvedValue(41);

    const response = await request(app.getHttpServer())
      .post('/annotations/list')
      .send({})
      .expect(201);

    expect(response.body.annotationChangeHistoryLatestId).toBe(41);
    expect(response.body.list).toHaveLength(1);
    expect(manager.transaction).toHaveBeenCalledWith(
      'REPEATABLE READ',
      expect.any(Function),
    );
    expect(annotationRepository.find).toHaveBeenCalledWith({
      where: { user: { id: 9 } },
    });
    expect(getLatestId).toHaveBeenCalledWith(user, manager);
  });

  it('materializes and reuses bounded full-snapshot pages', async () => {
    const snapshotRows = [
      { id: 1, uid: 'one', data: {} },
      { id: 2, uid: 'two', data: {} },
      { id: 3, uid: 'three', data: {} },
    ];
    manager.query.mockImplementation(async (sql, parameters = []) => {
      if (
        sql.includes('SELECT "id", "watermark"') &&
        sql.includes('FROM "annotation_sync_snapshot"')
      ) {
        return [{ id: parameters[0], watermark: 41 }];
      }
      if (sql.includes('FROM "annotation_sync_snapshot_item"')) {
        const afterId = parameters[1];
        const limit = parameters[2];
        return snapshotRows.filter((row) => row.id > afterId).slice(0, limit);
      }
      return [];
    });

    const firstPage = await request(app.getHttpServer())
      .post('/annotations/listPage')
      .send({ limit: 2 })
      .expect(201);

    expect(firstPage.body).toEqual({
      list: snapshotRows.slice(0, 2),
      annotationChangeHistoryLatestId: 41,
      snapshotId: expect.any(String),
      nextAfterId: 2,
      hasMore: true,
    });

    const secondPage = await request(app.getHttpServer())
      .post('/annotations/listPage')
      .send({
        snapshotId: firstPage.body.snapshotId,
        afterId: firstPage.body.nextAfterId,
        limit: 2,
      })
      .expect(201);

    expect(secondPage.body).toEqual({
      list: snapshotRows.slice(2),
      annotationChangeHistoryLatestId: 41,
      snapshotId: firstPage.body.snapshotId,
      nextAfterId: 3,
      hasMore: false,
    });
    expect(
      manager.query.mock.calls.filter(([sql]) =>
        sql.includes('WITH "watermark"'),
      ),
    ).toHaveLength(1);
  });

  it('rejects expired and malformed full-snapshot continuations', async () => {
    const snapshotId = '123e4567-e89b-42d3-a456-426614174000';
    manager.query.mockResolvedValue([]);

    await request(app.getHttpServer())
      .post('/annotations/listPage')
      .send({ snapshotId, afterId: 0 })
      .expect(410);

    manager.transaction.mockClear();
    await request(app.getHttpServer())
      .post('/annotations/listPage')
      .send({ snapshotId })
      .expect(400);
    expect(manager.transaction).not.toHaveBeenCalled();
  });

  it('queries committed history even when a replica-local watermark is stale', async () => {
    historyService.getCachedAnnotationChangeHistoryLatestId.mockReturnValue(41);
    historyRepository.findOne.mockResolvedValue({ id: 41 });
    historyRepository.find.mockResolvedValue([
      { id: 42, kind: 1, uid: 'annotation-uid' },
    ]);

    const response = await request(app.getHttpServer())
      .post('/annotations/listDiff')
      .send({ sinceId: 41 })
      .expect(201);

    expect(response.body).toEqual({
      ok: true,
      diff: [{ id: 42, kind: 1, uid: 'annotation-uid' }],
      hasMore: false,
    });
    expect(manager.transaction).toHaveBeenCalledWith(
      'REPEATABLE READ',
      expect.any(Function),
    );
    expect(historyRepository.findOne).toHaveBeenCalled();
    expect(historyRepository.find).toHaveBeenCalled();
    expect(historyRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({ take: 251 }),
    );
  });

  it('returns bounded history pages and advertises remaining changes', async () => {
    historyRepository.find.mockResolvedValue([
      { id: 1, kind: 1 },
      { id: 2, kind: 1 },
      { id: 3, kind: 1 },
    ]);

    const response = await request(app.getHttpServer())
      .post('/annotations/listDiff')
      .send({ sinceId: 0, limit: 2 })
      .expect(201);

    expect(response.body).toEqual({
      ok: true,
      diff: [
        { id: 1, kind: 1 },
        { id: 2, kind: 1 },
      ],
      hasMore: true,
    });
    expect(historyRepository.find).toHaveBeenCalledWith({
      where: {
        id: expect.anything(),
        user: { id: 9 },
      },
      order: { id: 'ASC' },
      take: 3,
    });
  });

  it('uses allowlisted columns and forces the authenticated user scope', async () => {
    databaseQuery.mockResolvedValue([{ count: '1', title: 'A title' }]);

    const response = await request(app.getHttpServer())
      .post('/annotations/find')
      .send({ selectors: { host: 'example.com' }, groupBy: 'title' })
      .expect(201);

    expect(response.body.list).toEqual([{ count: '1', title: 'A title' }]);
    expect(databaseQuery).toHaveBeenCalledWith(
      'select count(1) as count, title from annotation where host=$1 AND "userId"=$2 GROUP BY title',
      ['example.com', 9],
    );
  });

  it('authorizes agent search and find at the endpoint boundary', async () => {
    process.env.RUN_MODE = 'AGENT';
    process.env.AGENT_CONTROL_ORIGINS = 'chrome-extension://trusted-extension';
    const search = jest
      .spyOn(meilisearchClient, 'queryAnnotations')
      .mockResolvedValue({ hits: [{ id: 12 }] } as any);
    databaseQuery.mockResolvedValue([{ id: 12, uid: 'agent-annotation' }]);

    const trustedSearch = await request(app.getHttpServer())
      .post('/annotations/search')
      .set('Origin', 'chrome-extension://trusted-extension')
      .send({ q: 'private text' })
      .expect(201);
    expect(trustedSearch.body.results.hits).toEqual([{ id: 12 }]);
    expect(search).toHaveBeenCalledWith('private text', 0);

    const trustedFind = await request(app.getHttpServer())
      .post('/annotations/find')
      .set('Origin', 'chrome-extension://trusted-extension')
      .send({ selectors: { uid: 'agent-annotation' } })
      .expect(201);
    expect(trustedFind.body.list).toEqual([
      { id: 12, uid: 'agent-annotation' },
    ]);
    expect(databaseQuery).toHaveBeenCalledWith(
      'select * from annotation where uid=$1 AND "userId"=$2',
      ['agent-annotation', 0],
    );
    expect(authenticationService.getAuthenticatedUser).not.toHaveBeenCalled();
  });

  it('rejects untrusted extension origins before querying decrypted agent data', async () => {
    process.env.RUN_MODE = 'AGENT';
    process.env.AGENT_CONTROL_ORIGINS = 'chrome-extension://trusted-extension';
    const search = jest.spyOn(meilisearchClient, 'queryAnnotations');

    await request(app.getHttpServer())
      .post('/annotations/search')
      .set('Origin', 'chrome-extension://untrusted-extension')
      .send({ q: 'private text' })
      .expect(403);
    await request(app.getHttpServer())
      .post('/annotations/find')
      .set('Origin', 'chrome-extension://untrusted-extension')
      .send({ selectors: {} })
      .expect(403);

    expect(search).not.toHaveBeenCalled();
    expect(databaseQuery).not.toHaveBeenCalled();
    expect(authenticationService.getAuthenticatedUser).not.toHaveBeenCalled();
  });

  it('rejects arbitrary selector and grouping identifiers', async () => {
    await request(app.getHttpServer())
      .post('/annotations/find')
      .send({ selectors: { 'host; DROP TABLE annotation': 'example.com' } })
      .expect(400);

    await request(app.getHttpServer())
      .post('/annotations/find')
      .send({ selectors: {}, groupBy: 'title; SELECT pg_sleep(10)' })
      .expect(400);

    expect(databaseQuery).not.toHaveBeenCalled();
  });

  it('returns a safe retryable error while annotation search is unavailable', async () => {
    jest
      .spyOn(meilisearchClient, 'queryAnnotations')
      .mockRejectedValue(new Error('internal search connection details'));

    const response = await request(app.getHttpServer())
      .post('/annotations/search')
      .send({ q: 'important text' })
      .expect(503);

    expect(response.body).toEqual({
      message: 'annotation search unavailable',
      error: 'Service Unavailable',
      statusCode: 503,
    });
    expect(JSON.stringify(response.body)).not.toContain('connection details');
  });

  it('rejects malformed annotation and diff payloads before persistence', async () => {
    await request(app.getHttpServer())
      .post('/annotations/save')
      .send({ uid: 'x'.repeat(65), data: {} })
      .expect(400);

    await request(app.getHttpServer())
      .post('/annotations/listDiff')
      .send({ sinceId: 1.5 })
      .expect(400);

    await request(app.getHttpServer())
      .post('/annotations/listDiff')
      .send({ sinceId: 0, limit: 501 })
      .expect(400);

    expect(manager.transaction).not.toHaveBeenCalled();
  });
});
