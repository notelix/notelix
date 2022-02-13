import {
  Controller,
  Inject,
  NotFoundException,
  Post,
  Request,
} from '@nestjs/common';
import { AuthenticationService } from '../authenticators/authentication.service';
import { Annotation } from '../models/annotation.entity';
import { REQUEST } from '@nestjs/core';
import { TypeSenseClient } from '../typesense';
import { getManager } from 'typeorm';
import { AnnotationChangeHistory } from '../models/annotationChangeHistory.entity';

@Controller('annotations')
export class AnnotationsController {
  constructor(
    @Inject(REQUEST) private request: Request,
    private authenticationService: AuthenticationService,
  ) {}

  @Post('/save')
  async Save(): Promise<any> {
    const user = await this.authenticationService.getAuthenticatedUser();
    const uid = this.request.body['uid'];

    let annotation = await Annotation.findOne({
      user,
      uid,
    });

    if (!annotation) {
      annotation = new Annotation();
    }
    annotation.user = user;
    annotation.data = { ...this.request.body };
    annotation.uid = uid;
    annotation.url = this.request.body['url'] || '';
    delete annotation.data.uid;
    delete annotation.data.url;
    await annotation.save();

    setTimeout(() => {
      TypeSenseClient.indexAnnotation(user, annotation);
    });
    return {};
  }

  @Post('/delete')
  async Delete(): Promise<any> {
    const user = await this.authenticationService.getAuthenticatedUser();
    const annotation = await Annotation.findOne({
      user: user,
      uid: this.request.body['uid'],
    });

    if (!annotation) {
      throw new NotFoundException();
    }

    await annotation.remove();
    setTimeout(() => {
      TypeSenseClient.deleteAnnotation(annotation);
    });
    return {};
  }

  @Post('/queryByUrl')
  async QueryByUrl(): Promise<any> {
    const user = await this.authenticationService.getAuthenticatedUser();
    const list = await Annotation.find({
      user: user,
      url: this.request.body['url'],
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

  @Post('/watch')
  async Watch(): Promise<any> {
    const user = await this.authenticationService.getAuthenticatedUser();
    const fromId = this.request.body['fromId'];

    return await new Promise(async (resolve) => {
      await getManager().transaction(async () => {
        const annotation = await AnnotationChangeHistory.findOne({
          id: fromId,
          user,
        });
        if (!annotation) {
          // already pruned
          resolve({ ok: false });
          return;
        }

        // 1. send all AnnotationChangeHistory larger than `fromId` immediately
        // 2. establish WATCH connection, register callback
        resolve({ ok: true });
      });
    });
  }
}
