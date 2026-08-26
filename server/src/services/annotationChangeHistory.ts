import { Injectable } from '@nestjs/common';
import {
  AnnotationChangeHistory,
  AnnotationChangeHistoryKindDelete,
  AnnotationChangeHistoryKindSave,
} from '../models/annotationChangeHistory.entity';
import { Annotation } from '../models/annotation.entity';
import { EntityManager } from 'typeorm';

@Injectable()
export default class AnnotationChangeHistoryService {
  createAnnotationChangeHistoryForSave = async (
    annotation: Annotation,
    manager?: EntityManager,
  ) => {
    let history = new AnnotationChangeHistory();
    history.uid = annotation.uid;
    history.annotationId = annotation.id;
    history.data = annotation;
    history.user = annotation.user;
    history.kind = AnnotationChangeHistoryKindSave;
    history = manager
      ? await manager.save(history)
      : await AnnotationChangeHistory.save(history);
    return history;
  };

  createAnnotationChangeHistoryForDelete = async (
    annotation: Annotation,
    manager?: EntityManager,
  ) => {
    let history = new AnnotationChangeHistory();
    history.uid = annotation.uid;
    history.annotationId = annotation.id;
    history.data = annotation;
    history.user = annotation.user;
    history.kind = AnnotationChangeHistoryKindDelete;
    history = manager
      ? await manager.save(history)
      : await AnnotationChangeHistory.save(history);
    return history;
  };
}
