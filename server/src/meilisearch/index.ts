import { MeiliSearch } from 'meilisearch';
import { Annotation } from '../models/annotation.entity';

const client = new MeiliSearch({
  host: process.env.MEILISEARCH_HOST || 'http://meilisearch:7700',
  apiKey: process.env.MEILISEARCH_API_KEY,
});

const annotationIndexName =
  process.env.MEILISEARCH_ANNOTATIONS_INDEX || 'annotations';
const annotationIndex = client.index(annotationIndexName);
const taskTimeoutMs = Number(process.env.MEILISEARCH_TASK_TIMEOUT_MS || 30000);

async function waitForTask(enqueuedTask) {
  const task = await client.tasks.waitForTask(enqueuedTask, {
    timeout: taskTimeoutMs,
  });
  if (task.status !== 'succeeded') {
    throw new Error(
      `Meilisearch task ${task.uid} ${task.status}: ${JSON.stringify(
        task.error,
      )}`,
    );
  }
  return task;
}

function hasMeiliErrorCode(error: unknown, code: string): boolean {
  const candidate = error as {
    cause?: { code?: string };
    code?: string;
    message?: string;
  };
  return (
    candidate?.cause?.code === code ||
    candidate?.code === code ||
    candidate?.message?.includes(code) === true
  );
}

export async function ensureAnnotationIndexReady(
  beforeSchemaRepair?: () => Promise<void>,
): Promise<void> {
  let created = false;
  try {
    await annotationIndex.getRawInfo();
  } catch (error) {
    if (!hasMeiliErrorCode(error, 'index_not_found')) {
      throw error;
    }
    try {
      await waitForTask(
        await client.createIndex(annotationIndexName, { primaryKey: 'id' }),
      );
      created = true;
    } catch (creationError) {
      if (!hasMeiliErrorCode(creationError, 'index_already_exists')) {
        throw creationError;
      }
    }
  }

  const indexInfo = await annotationIndex.getRawInfo();
  if (indexInfo.primaryKey !== 'id') {
    if (indexInfo.primaryKey !== null) {
      throw new Error(
        `Meilisearch index ${annotationIndexName} has unexpected primary key ${indexInfo.primaryKey}`,
      );
    }
    await waitForTask(
      await client.updateIndex(annotationIndexName, { primaryKey: 'id' }),
    );
  }

  const filterableAttributes = await annotationIndex.getFilterableAttributes();
  const needsFilterRepair = !filterableAttributes.includes('userId');
  if ((created || needsFilterRepair) && beforeSchemaRepair) {
    await beforeSchemaRepair();
  }
  if (needsFilterRepair) {
    await waitForTask(
      await annotationIndex.updateFilterableAttributes([
        ...filterableAttributes,
        'userId',
      ]),
    );
  }
}

function toMeiliEntry(annotation: Annotation) {
  return {
    id: annotation.id,
    text: annotation.data.text,
    textBefore: annotation.data.textBefore,
    textAfter: annotation.data.textAfter,
    color: annotation.data.color,
    notes: annotation.data.notes,
    userId: annotation.user ? annotation.user.id : undefined,
    url: annotation.url,
    title: annotation.title,
  };
}

class MeilisearchClient {
  async health() {
    return client.health();
  }

  async IndexAnnotation(annotation) {
    return this.IndexAnnotations([annotation]);
  }

  async IndexAnnotations(annotations: Annotation[]) {
    if (annotations.length === 0) {
      return;
    }
    return waitForTask(
      await annotationIndex.addDocuments(annotations.map(toMeiliEntry)),
    );
  }

  async UnIndexAnnotation(annotation) {
    return this.UnIndexAnnotations([annotation.id]);
  }

  async UnIndexAnnotations(annotationIds: number[]) {
    if (annotationIds.length === 0) {
      return;
    }
    return waitForTask(await annotationIndex.deleteDocuments(annotationIds));
  }

  async UnIndexAllAnnotations() {
    return waitForTask(await annotationIndex.deleteAllDocuments());
  }

  queryAnnotations(q, userId) {
    return annotationIndex.search(q, {
      filter: userId ? `userId = ${userId}` : undefined,
      attributesToHighlight: ['text', 'notes', 'title'],
    });
  }
}

export async function bootstrapMeiliSearch(
  beforeSchemaRepair?: () => Promise<void>,
) {
  await ensureAnnotationIndexReady(beforeSchemaRepair);
}

const meilisearchClient = new MeilisearchClient();

export { meilisearchClient };
