import {
  Controller,
  NotFoundException,
  Post,
  Req,
  Request,
} from '@nestjs/common';
import { AuthenticationService } from '../authenticators/authentication.service';
import { Annotation } from '../models/annotation.entity';
import { getManager, MoreThan } from 'typeorm';
import { AnnotationChangeHistory } from '../models/annotationChangeHistory.entity';
import AnnotationChangeHistoryService from '../services/annotationChangeHistory';
import { meilisearchClient } from '../meilisearch';
import { isRunModeAgent } from './agentSyncController';

@Controller('annotations')
export class AnnotationsController {
  constructor(
    private authenticationService: AuthenticationService,
    private annotationChangeHistoryService: AnnotationChangeHistoryService,
  ) {}

  @Post('/save')
  async Save(@Req() request: Request): Promise<any> {
    const user = await this.authenticationService.getAuthenticatedUser();
    const uid = request.body['uid'];

    let annotation = await Annotation.findOne({
      user,
      uid,
    });

    if (!annotation) {
      annotation = new Annotation();
    }
    annotation.user = user;
    annotation.data = request.body['data'] || {};
    annotation.uid = uid;
    annotation.url = request.body['url'] || '';
    delete annotation.data.uid;
    delete annotation.data.url;
    annotation = await annotation.save();

    setTimeout(() => {
      this.annotationChangeHistoryService.createAnnotationChangeHistoryForSave(
        annotation,
      );

      if (!user.client_side_encryption) {
        meilisearchClient.IndexAnnotation(annotation);
      }
    });
    return {};
  }

  @Post('/delete')
  async Delete(@Req() request: Request): Promise<any> {
    const user = await this.authenticationService.getAuthenticatedUser();
    const annotation = await Annotation.findOne({
      user: user,
      uid: request.body['uid'],
    });

    if (!annotation) {
      throw new NotFoundException();
    }

    const annotationId = annotation.id;
    await annotation.remove();
    setTimeout(() => {
      const anno = {
        ...annotation,
        user: user,
        id: annotationId,
      } as any;

      this.annotationChangeHistoryService.createAnnotationChangeHistoryForDelete(
        anno,
      );

      meilisearchClient.UnIndexAnnotation(anno);
    });
    return {};
  }

  @Post('/queryByUrl')
  async QueryByUrl(@Req() request: Request): Promise<any> {
    const user = await this.authenticationService.getAuthenticatedUser();
    const list = await Annotation.find({
      user: user,
      url: request.body['url'],
    });

    return { list };
  }

  @Post('/list')
  async List(): Promise<any> {
    const user = await this.authenticationService.getAuthenticatedUser();

    return await new Promise(async (resolve) => {
      await getManager().transaction(async () => {
        const list = await Annotation.find({
          user: user,
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
      await getManager().transaction(async () => {
        let diff = [];
        if (sinceId !== 0) {
          const history = await AnnotationChangeHistory.findOne({
            id: sinceId,
            user,
          });
          if (!history) {
            // already pruned
            resolve({ ok: false });
            return;
          }
        }

        diff = await AnnotationChangeHistory.find({
          id: MoreThan(sinceId),
          user: user,
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

    return { results: await meilisearchClient.queryAnnotations(q, userId) };
  }
}
