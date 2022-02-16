import { MeiliSearch } from 'meilisearch';

const client = new MeiliSearch({
  host: 'http://meilisearch:7700',
  apiKey: process.env.MEILISEARCH_API_KEY,
});

const annotationIndex = client.index('annotations');

export function bootstrapMeiliSearch() {}

export function meiliSearchIndexAnnotation(annotation) {
  return annotationIndex.addDocuments([annotation]);
}
