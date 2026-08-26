import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AuthenticationService } from '../src/authenticators/authentication.service';
import { AnnotationsController } from '../src/controllers/annotations.controller';
import { meilisearchClient } from '../src/meilisearch';
import { Annotation } from '../src/models/annotation.entity';
import AnnotationChangeHistoryService from '../src/services/annotationChangeHistory';
import { AppDataSource } from '../src/database';

describe('Annotations API durability', () => {
  let app: INestApplication;
  let authenticationService: { getAuthenticatedUser: jest.Mock };
  let historyService: {
    createAnnotationChangeHistoryForSave: jest.Mock;
    createAnnotationChangeHistoryForDelete: jest.Mock;
    rememberAnnotationChangeHistoryLatestId: jest.Mock;
    getCachedAnnotationChangeHistoryLatestId: jest.Mock;
  };
  let annotationRepository: {
    findOne: jest.Mock;
    save: jest.Mock;
    remove: jest.Mock;
  };
  let manager: {
    getRepository: jest.Mock;
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
      rememberAnnotationChangeHistoryLatestId: jest.fn(),
      getCachedAnnotationChangeHistoryLatestId: jest.fn(),
    };
    annotationRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
    };
    manager = {
      getRepository: jest.fn().mockReturnValue(annotationRepository),
      transaction: jest.fn(async (callback) => callback(manager)),
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
    await app.init();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await app.close();
  });

  it('commits annotation and sync history before acknowledging a save', async () => {
    const events = [];
    annotationRepository.findOne.mockResolvedValue(undefined);
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
    manager.transaction.mockImplementation(async (callback) => {
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

    expect(events).toEqual(['annotation', 'history', 'commit', 'index']);
    expect(
      historyService.createAnnotationChangeHistoryForSave,
    ).toHaveBeenCalledWith(expect.objectContaining({ id: 12 }), manager);
    expect(
      historyService.rememberAnnotationChangeHistoryLatestId,
    ).toHaveBeenCalledWith(9, 34);
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
    expect(
      historyService.rememberAnnotationChangeHistoryLatestId,
    ).not.toHaveBeenCalled();
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
    expect(
      historyService.rememberAnnotationChangeHistoryLatestId,
    ).toHaveBeenCalledWith(9, 35);
    expect(unindexAnnotation).toHaveBeenCalledWith(
      expect.objectContaining({ id: 12 }),
    );
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
});
