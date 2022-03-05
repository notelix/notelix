import { Injectable } from '@nestjs/common';
import {
  AnnotationChangeHistory,
  AnnotationChangeHistoryKindDelete,
  AnnotationChangeHistoryKindSave,
} from '../models/annotationChangeHistory.entity';
import { Annotation } from '../models/annotation.entity';

@Injectable()
export default class AnnotationChangeHistoryService {
  createAnnotationChangeHistoryForSave = async (annotation: Annotation) => {
    let history = new AnnotationChangeHistory();
    history.uid = annotation.uid;
    history.annotationId = annotation.id;
    history.data = annotation;
    history.user = annotation.user;
    history.kind = AnnotationChangeHistoryKindSave;
    history = await history.save();
    this.rememberAnnotationChangeHistoryLatestId(
      annotation.user.id,
      history.id,
    );
  };

  createAnnotationChangeHistoryForDelete = async (annotation: Annotation) => {
    let history = new AnnotationChangeHistory();
    history.uid = annotation.uid;
    history.annotationId = annotation.id;
    history.data = annotation;
    history.user = annotation.user;
    history.kind = AnnotationChangeHistoryKindDelete;
    history = await history.save();
    this.rememberAnnotationChangeHistoryLatestId(
      annotation.user.id,
      history.id,
    );
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
