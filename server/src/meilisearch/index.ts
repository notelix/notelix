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

async function ensureAnnotationIndex() {
  try {
    await waitForTask(
      await client.createIndex(annotationIndexName, { primaryKey: 'id' }),
    );
  } catch (error) {
    if (!error.toString().includes('index_already_exists')) {
      throw error;
    }
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
    return waitForTask(
      await annotationIndex.addDocuments([toMeiliEntry(annotation)]),
    );
  }

  async UnIndexAnnotation(annotation) {
    return waitForTask(await annotationIndex.deleteDocuments([annotation.id]));
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

export async function bootstrapMeiliSearch() {
  await ensureAnnotationIndex();
  await waitForTask(
    await annotationIndex.updateSettings({
      filterableAttributes: ['userId'],
    }),
  );
}

const meilisearchClient = new MeilisearchClient();

export { meilisearchClient };
