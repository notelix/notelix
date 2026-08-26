import { Injectable } from '@nestjs/common';
import {
  AnnotationChangeHistory,
  AnnotationChangeHistoryKindDelete,
  AnnotationChangeHistoryKindSave,
} from '../models/annotationChangeHistory.entity';
import { Annotation } from '../models/annotation.entity';
import { EntityManager, getManager } from 'typeorm';

@Injectable()
export default class AnnotationChangeHistoryService {
  createAnnotationChangeHistoryForSave = async (
    annotation: Annotation,
    manager: EntityManager = getManager(),
  ) => {
    let history = new AnnotationChangeHistory();
    history.uid = annotation.uid;
    history.annotationId = annotation.id;
    history.data = annotation;
    history.user = annotation.user;
    history.kind = AnnotationChangeHistoryKindSave;
    history = await manager.save(history);
    return history;
  };

  createAnnotationChangeHistoryForDelete = async (
    annotation: Annotation,
    manager: EntityManager = getManager(),
  ) => {
    let history = new AnnotationChangeHistory();
    history.uid = annotation.uid;
    history.annotationId = annotation.id;
    history.data = annotation;
    history.user = annotation.user;
    history.kind = AnnotationChangeHistoryKindDelete;
    history = await manager.save(history);
    return history;
  };

  userIdToAnnotationChangeHistoryLatestId = {};

  public rememberAnnotationChangeHistoryLatestId(
    userId,
    annotationChangeHistoryLatestId,
  ) {
    if (
      this.userIdToAnnotationChangeHistoryLatestId[userId] >
      annotationChangeHistoryLatestId
    ) {
      return;
    }
    this.userIdToAnnotationChangeHistoryLatestId[userId] =
      annotationChangeHistoryLatestId;
  }

  public getCachedAnnotationChangeHistoryLatestId(userId) {
    return this.userIdToAnnotationChangeHistoryLatestId[userId];
  }
}
