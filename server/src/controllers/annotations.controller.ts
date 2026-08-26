import {
  BadRequestException,
  Controller,
  Logger,
  NotFoundException,
  Post,
  Req,
  Request,
} from '@nestjs/common';
import { AuthenticationService } from '../authenticators/authentication.service';
import { Annotation } from '../models/annotation.entity';
import { MoreThan } from 'typeorm';
import { AnnotationChangeHistory } from '../models/annotationChangeHistory.entity';
import AnnotationChangeHistoryService from '../services/annotationChangeHistory';
import { meilisearchClient } from '../meilisearch';
import { isRunModeAgent } from './agentSyncController';
import { AppDataSource } from '../database';

const annotationColumnSql = {
  id: 'id',
  uid: 'uid',
  url: 'url',
  title: 'title',
  host: 'host',
  userId: '"userId"',
};

function getAnnotationColumnSql(column: string): string {
  const sql = annotationColumnSql[column];
  if (!sql) {
    throw new BadRequestException(`unsupported annotation field ${column}`);
  }
  return sql;
}

@Controller('annotations')
export class AnnotationsController {
  private readonly logger = new Logger(AnnotationsController.name);

  constructor(
    private authenticationService: AuthenticationService,
    private annotationChangeHistoryService: AnnotationChangeHistoryService,
  ) {}

  @Post('/save')
  async Save(@Req() request: Request): Promise<any> {
    const user = await this.authenticationService.getAuthenticatedUser();
    const uid = request.body['uid'];

    const { annotation, history } = await AppDataSource.transaction(
      async (manager) => {
        const annotationRepository = manager.getRepository(Annotation);
        let annotation = await annotationRepository.findOne({
          where: { user: { id: user.id }, uid },
        });

        if (!annotation) {
          annotation = new Annotation();
        }
        annotation.user = user;
        annotation.data = request.body['data'] || {};
        annotation.uid = uid;
        annotation.url = request.body['url'] || '';
        annotation.title = request.body['title'] || '';
        annotation.host = request.body['host'] || '';
        delete annotation.data.uid;
        delete annotation.data.url;
        delete annotation.data.title;
        delete annotation.data.host;
        annotation = await annotationRepository.save(annotation);

        const history =
          await this.annotationChangeHistoryService.createAnnotationChangeHistoryForSave(
            annotation,
            manager,
          );
        return { annotation, history };
      },
    );

    this.annotationChangeHistoryService.rememberAnnotationChangeHistoryLatestId(
      user.id,
      history.id,
    );
    if (!user.client_side_encryption) {
      this.runSearchUpdate('index annotation', () =>
        meilisearchClient.IndexAnnotation(annotation),
      );
    }
    return {};
  }

  private runSearchUpdate(
    description: string,
    operation: () => Promise<any>,
  ): void {
    void (async () => {
      try {
        await operation();
      } catch (error) {
        const trace = error instanceof Error ? error.stack : String(error);
        this.logger.error(`Failed to ${description}`, trace);
      }
    })();
  }

  @Post('/delete')
  async Delete(@Req() request: Request): Promise<any> {
    const user = await this.authenticationService.getAuthenticatedUser();
    const { annotation, history } = await AppDataSource.transaction(
      async (manager) => {
        const annotationRepository = manager.getRepository(Annotation);
        const annotation = await annotationRepository.findOne({
          where: {
            user: { id: user.id },
            uid: request.body['uid'],
          },
        });

        if (!annotation) {
          throw new NotFoundException();
        }

        const deletedAnnotation = {
          ...annotation,
          user,
          id: annotation.id,
        } as Annotation;
        await annotationRepository.remove(annotation);
        const history =
          await this.annotationChangeHistoryService.createAnnotationChangeHistoryForDelete(
            deletedAnnotation,
            manager,
          );
        return { annotation: deletedAnnotation, history };
      },
    );

    this.annotationChangeHistoryService.rememberAnnotationChangeHistoryLatestId(
      user.id,
      history.id,
    );
    this.runSearchUpdate('remove annotation from index', () =>
      meilisearchClient.UnIndexAnnotation(annotation),
    );
    return {};
  }

  @Post('/queryByUrl')
  async QueryByUrl(@Req() request: Request): Promise<any> {
    const user = await this.authenticationService.getAuthenticatedUser();
    const list = await Annotation.find({
      where: {
        user: { id: user.id },
        url: request.body['url'],
      },
    });

    return { list: list.map(Annotation.Neat) };
  }

  @Post('/list')
  async List(): Promise<any> {
    const user = await this.authenticationService.getAuthenticatedUser();

    return await new Promise(async (resolve) => {
      await AppDataSource.transaction(async () => {
        const list = await Annotation.find({
          where: { user: { id: user.id } },
        });
        const annotationChangeHistoryLatestId =
          await AnnotationChangeHistory.getLatestIdForUser(user);

        resolve({ list, annotationChangeHistoryLatestId });
      });
    });
  }

  @Post('/listDiff')
  async ListDiff(@Req() request: Request): Promise<any> {
    const user = await this.authenticationService.getAuthenticatedUser();
    const sinceId = request.body['sinceId'];
    const cachedSinceId =
      this.annotationChangeHistoryService.getCachedAnnotationChangeHistoryLatestId(
        user.id,
      );

    if (cachedSinceId === sinceId) {
      return Promise.resolve({ ok: true, diff: [] });
    }

    return await new Promise(async (resolve) => {
      await AppDataSource.transaction(async () => {
        let diff = [];
        if (sinceId !== 0) {
          const history = await AnnotationChangeHistory.findOne({
            where: { id: sinceId, user: { id: user.id } },
          });
          if (!history) {
            // already pruned
            resolve({ ok: false });
            return;
          }
        }

        diff = await AnnotationChangeHistory.find({
          where: {
            id: MoreThan(sinceId),
            user: { id: user.id },
          },
          order: { id: 'ASC' },
        });

        if (diff.length > 0) {
          const annotationChangeHistoryLatestId = diff[diff.length - 1].id;
          this.annotationChangeHistoryService.rememberAnnotationChangeHistoryLatestId(
            user.id,
            annotationChangeHistoryLatestId,
          );
        } else {
          this.annotationChangeHistoryService.rememberAnnotationChangeHistoryLatestId(
            user.id,
            await AnnotationChangeHistory.getLatestIdForUser(user),
          );
        }
        resolve({ ok: true, diff: diff });
      });
    });
  }

  @Post('/search')
  async Search(@Req() request: Request): Promise<any> {
    let userId = 0;
    if (!isRunModeAgent()) {
      const user = await this.authenticationService.getAuthenticatedUser();
      userId = user.id;
    }
    const q = request.body['q'];
    if (!q || !q.trim()) {
      return { results: { hits: [] } };
    }

    return { results: await meilisearchClient.queryAnnotations(q, userId) };
  }

  @Post('/find')
  async Find(@Req() request: Request): Promise<any> {
    let userId = 0;
    if (!isRunModeAgent()) {
      const user = await this.authenticationService.getAuthenticatedUser();
      userId = user.id;
    }
    const requestedSelectors = request.body['selectors'] || {};
    if (
      typeof requestedSelectors !== 'object' ||
      Array.isArray(requestedSelectors)
    ) {
      throw new BadRequestException('selectors must be an object');
    }
    const selectors = { ...requestedSelectors };
    const groupBy = request.body['groupBy'] || '';
    selectors['userId'] = userId;

    const selectorsKeyAndValues = Object.entries(selectors);
    const whereSql = selectorsKeyAndValues
      .map(
        (entry, index) => `${getAnnotationColumnSql(entry[0])}=$${index + 1}`,
      )
      .join(' AND ');
    const values = selectorsKeyAndValues.map((entry) => entry[1]);

    if (groupBy) {
      const groupBySql = getAnnotationColumnSql(groupBy);
      const sqlQuery = `select count(1) as count, ${groupBySql} from annotation where ${whereSql} GROUP BY ${groupBySql}`;

      const list = await AppDataSource.manager.query(sqlQuery, values);

      return { list };
    } else {
      const sqlQuery = `select * from annotation where ${whereSql}`;

      const list = await AppDataSource.manager.query(sqlQuery, values);

      return { list };
    }
  }
}
