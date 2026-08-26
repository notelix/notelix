import {
  BadRequestException,
  Body,
  Controller,
  Logger,
  NotFoundException,
  Post,
} from '@nestjs/common';
import { AuthenticationService } from '../authenticators/authentication.service';
import { Annotation } from '../models/annotation.entity';
import { EntityManager, MoreThan } from 'typeorm';
import { AnnotationChangeHistory } from '../models/annotationChangeHistory.entity';
import AnnotationChangeHistoryService from '../services/annotationChangeHistory';
import { meilisearchClient } from '../meilisearch';
import { isRunModeAgent } from './agentSyncController';
import { AppDataSource } from '../database';
import {
  DeleteAnnotationDto,
  FindAnnotationsDto,
  ListDiffDto,
  QueryAnnotationsByUrlDto,
  SaveAnnotationDto,
  SearchAnnotationsDto,
} from '../dto/annotations.dto';

const annotationColumnSql = {
  id: 'id',
  uid: 'uid',
  url: 'url',
  title: 'title',
  host: 'host',
  userId: '"userId"',
};
const defaultAnnotationDiffPageSize = 250;

function getAnnotationColumnSql(column: string): string {
  const sql = annotationColumnSql[column];
  if (!sql) {
    throw new BadRequestException(`unsupported annotation field ${column}`);
  }
  return sql;
}

async function lockAnnotation(
  manager: EntityManager,
  userId: number,
  uid: string,
): Promise<void> {
  await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    `notelix-annotation:${userId}:${uid}`,
  ]);
}

@Controller('annotations')
export class AnnotationsController {
  private readonly logger = new Logger(AnnotationsController.name);

  constructor(
    private authenticationService: AuthenticationService,
    private annotationChangeHistoryService: AnnotationChangeHistoryService,
  ) {}

  @Post('/save')
  async Save(@Body() request: SaveAnnotationDto): Promise<any> {
    const user = await this.authenticationService.getAuthenticatedUser();
    const uid = request.uid;

    const annotation = await AppDataSource.transaction(async (manager) => {
      await lockAnnotation(manager, user.id, uid);
      const annotationRepository = manager.getRepository(Annotation);
      let annotation = await annotationRepository.findOne({
        where: { user: { id: user.id }, uid },
      });

      if (!annotation) {
        annotation = new Annotation();
      }
      annotation.user = user;
      annotation.data = request.data || {};
      annotation.uid = uid;
      annotation.url = request.url || '';
      annotation.title = request.title || '';
      annotation.host = request.host || '';
      delete annotation.data.uid;
      delete annotation.data.url;
      delete annotation.data.title;
      delete annotation.data.host;
      annotation = await annotationRepository.save(annotation);

      await this.annotationChangeHistoryService.createAnnotationChangeHistoryForSave(
        annotation,
        manager,
      );
      return annotation;
    });

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
  async Delete(@Body() request: DeleteAnnotationDto): Promise<any> {
    const user = await this.authenticationService.getAuthenticatedUser();
    const annotation = await AppDataSource.transaction(async (manager) => {
      await lockAnnotation(manager, user.id, request.uid);
      const annotationRepository = manager.getRepository(Annotation);
      const annotation = await annotationRepository.findOne({
        where: {
          user: { id: user.id },
          uid: request.uid,
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
      await this.annotationChangeHistoryService.createAnnotationChangeHistoryForDelete(
        deletedAnnotation,
        manager,
      );
      return deletedAnnotation;
    });

    this.runSearchUpdate('remove annotation from index', () =>
      meilisearchClient.UnIndexAnnotation(annotation),
    );
    return {};
  }

  @Post('/queryByUrl')
  async QueryByUrl(@Body() request: QueryAnnotationsByUrlDto): Promise<any> {
    const user = await this.authenticationService.getAuthenticatedUser();
    const list = await Annotation.find({
      where: {
        user: { id: user.id },
        url: request.url,
      },
    });

    return { list: list.map(Annotation.Neat) };
  }

  @Post('/list')
  async List(): Promise<any> {
    const user = await this.authenticationService.getAuthenticatedUser();

    return AppDataSource.transaction('REPEATABLE READ', async (manager) => {
      const list = await manager.getRepository(Annotation).find({
        where: { user: { id: user.id } },
      });
      const annotationChangeHistoryLatestId =
        await AnnotationChangeHistory.getLatestIdForUser(user, manager);

      return { list, annotationChangeHistoryLatestId };
    });
  }

  @Post('/listDiff')
  async ListDiff(@Body() request: ListDiffDto): Promise<any> {
    const user = await this.authenticationService.getAuthenticatedUser();
    const sinceId = request.sinceId;
    const limit = request.limit ?? defaultAnnotationDiffPageSize;

    return AppDataSource.transaction('REPEATABLE READ', async (manager) => {
      const historyRepository = manager.getRepository(AnnotationChangeHistory);
      if (sinceId !== 0) {
        const history = await historyRepository.findOne({
          where: { id: sinceId, user: { id: user.id } },
        });
        if (!history) {
          // The requested history may have been pruned; the agent must re-list.
          return { ok: false };
        }
      }

      const rows = await historyRepository.find({
        where: {
          id: MoreThan(sinceId),
          user: { id: user.id },
        },
        order: { id: 'ASC' },
        take: limit + 1,
      });
      const hasMore = rows.length > limit;
      const diff = hasMore ? rows.slice(0, limit) : rows;

      return { ok: true, diff, hasMore };
    });
  }

  @Post('/search')
  async Search(@Body() request: SearchAnnotationsDto): Promise<any> {
    let userId = 0;
    if (!isRunModeAgent()) {
      const user = await this.authenticationService.getAuthenticatedUser();
      userId = user.id;
    }
    const q = request.q;
    if (!q || !q.trim()) {
      return { results: { hits: [] } };
    }

    return { results: await meilisearchClient.queryAnnotations(q, userId) };
  }

  @Post('/find')
  async Find(@Body() request: FindAnnotationsDto): Promise<any> {
    let userId = 0;
    if (!isRunModeAgent()) {
      const user = await this.authenticationService.getAuthenticatedUser();
      userId = user.id;
    }
    const requestedSelectors = request.selectors || {};
    if (
      typeof requestedSelectors !== 'object' ||
      Array.isArray(requestedSelectors)
    ) {
      throw new BadRequestException('selectors must be an object');
    }
    const selectors = { ...requestedSelectors };
    const groupBy = request.groupBy || '';
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
