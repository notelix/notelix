import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AuthenticationService } from '../src/authenticators/authentication.service';
import { AnnotationsController } from '../src/controllers/annotations.controller';
import { meilisearchClient } from '../src/meilisearch';
import { Annotation } from '../src/models/annotation.entity';
import { AnnotationChangeHistory } from '../src/models/annotationChangeHistory.entity';
import AnnotationChangeHistoryService from '../src/services/annotationChangeHistory';
import { AppDataSource } from '../src/database';
import { createValidationPipe } from '../src/application';

describe('Annotations API durability', () => {
  let app: INestApplication;
  let authenticationService: { getAuthenticatedUser: jest.Mock };
  let historyService: {
    createAnnotationChangeHistoryForSave: jest.Mock;
    createAnnotationChangeHistoryForDelete: jest.Mock;
    getCachedAnnotationChangeHistoryLatestId: jest.Mock;
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
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
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
    manager.transaction.mockImplementation(async (...args) => {
      const callback = args[args.length - 1];
      const result = await callback(manager);
      events.push('commit');
      return result;
    });
    jest
      .spyOn(meilisearchClient, 'IndexAnnotation')
      .mockImplementation(async () => {
        events.push('index');
        return {} as any;
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
      'commit',
      'index',
    ]);
    expect(manager.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      ['notelix-annotation:9:annotation-uid'],
    );
    expect(
      historyService.createAnnotationChangeHistoryForSave,
    ).toHaveBeenCalledWith(expect.objectContaining({ id: 12 }), manager);
  });

  it('does not acknowledge or index a save when history persistence fails', async () => {
    annotationRepository.findOne.mockResolvedValue(undefined);
    annotationRepository.save.mockImplementation(async (annotation) => {
      annotation.id = 12;
      return annotation;
    });
    historyService.createAnnotationChangeHistoryForSave.mockRejectedValue(
      new Error('history unavailable'),
    );
    const indexAnnotation = jest.spyOn(meilisearchClient, 'IndexAnnotation');

    await request(app.getHttpServer())
      .post('/annotations/save')
      .send({ uid: 'annotation-uid', data: {} })
      .expect(500);

    expect(indexAnnotation).not.toHaveBeenCalled();
  });

  it('keeps a durable save successful when search indexing is unavailable', async () => {
    annotationRepository.findOne.mockResolvedValue(undefined);
    annotationRepository.save.mockImplementation(async (annotation) => {
      annotation.id = 12;
      return annotation;
    });
    historyService.createAnnotationChangeHistoryForSave.mockResolvedValue({
      id: 34,
    });
    jest
      .spyOn(meilisearchClient, 'IndexAnnotation')
      .mockRejectedValue(new Error('search unavailable'));

    await request(app.getHttpServer())
      .post('/annotations/save')
      .send({ uid: 'annotation-uid', data: {} })
      .expect(201);

    await new Promise((resolve) => setImmediate(resolve));
    expect(Logger.prototype.error).toHaveBeenCalledWith(
      'Failed to index annotation',
      expect.stringContaining('search unavailable'),
    );
  });

  it('commits deletion history before removing the search document', async () => {
    const annotation = Object.assign(new Annotation(), {
      id: 12,
      uid: 'annotation-uid',
      user,
      data: {},
    });
    annotationRepository.findOne.mockResolvedValue(annotation);
    annotationRepository.remove.mockResolvedValue(annotation);
    historyService.createAnnotationChangeHistoryForDelete.mockResolvedValue({
      id: 35,
    });
    const unindexAnnotation = jest
      .spyOn(meilisearchClient, 'UnIndexAnnotation')
      .mockResolvedValue(undefined);

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
    expect(unindexAnnotation).toHaveBeenCalledWith(
      expect.objectContaining({ id: 12 }),
    );
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
    });
    expect(manager.transaction).toHaveBeenCalledWith(
      'REPEATABLE READ',
      expect.any(Function),
    );
    expect(historyRepository.findOne).toHaveBeenCalled();
    expect(historyRepository.find).toHaveBeenCalled();
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

  it('rejects malformed annotation and diff payloads before persistence', async () => {
    await request(app.getHttpServer())
      .post('/annotations/save')
      .send({ uid: 'x'.repeat(65), data: {} })
      .expect(400);

    await request(app.getHttpServer())
      .post('/annotations/listDiff')
      .send({ sinceId: 1.5 })
      .expect(400);

    expect(manager.transaction).not.toHaveBeenCalled();
  });
});
