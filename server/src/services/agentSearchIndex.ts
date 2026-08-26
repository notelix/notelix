import { Logger } from '@nestjs/common';
import { MoreThan } from 'typeorm';
import { ensureAnnotationIndexReady, meilisearchClient } from '../meilisearch';
import { Annotation } from '../models/annotation.entity';

const rebuildBatchSize = 500;
const logger = new Logger('AgentSearchIndex');

export async function rebuildAgentAnnotationSearchIndex(): Promise<void> {
  let afterId = 0;
  let indexedCount = 0;

  while (true) {
    const annotations = await Annotation.find({
      where: { id: MoreThan(afterId) },
      order: { id: 'ASC' },
      take: rebuildBatchSize,
    });
    if (annotations.length === 0) {
      break;
    }

    await meilisearchClient.IndexAnnotations(annotations);
    indexedCount += annotations.length;
    afterId = annotations[annotations.length - 1].id;
    if (annotations.length < rebuildBatchSize) {
      break;
    }
  }

  logger.log(`Rebuilt agent search index with ${indexedCount} annotations`);
}

export async function ensureAgentAnnotationSearchIndexReady(): Promise<void> {
  await ensureAnnotationIndexReady(rebuildAgentAnnotationSearchIndex);
}
