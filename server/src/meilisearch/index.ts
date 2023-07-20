import {MeiliSearch} from 'meilisearch';
import {Annotation} from '../models/annotation.entity';

const client = new MeiliSearch({
    host: 'http://meilisearch:7700',
    apiKey: process.env.MEILISEARCH_API_KEY,
});

const annotationIndex = client.index('annotations');

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
    IndexAnnotation(annotation) {
        return annotationIndex.addDocuments([toMeiliEntry(annotation)]);
    }

    UnIndexAnnotation(annotation) {
        return annotationIndex.deleteDocuments([annotation.id]);
    }

    UnIndexAllAnnotations() {
        return annotationIndex.deleteAllDocuments();
    }

    queryAnnotations(q, userId) {
        return annotationIndex.search(q, {
            filter: userId ? `userId = ${userId}` : undefined,
            attributesToHighlight: ['text', 'notes', 'title'],
        });
    }
}

export function bootstrapMeiliSearch() {
    return annotationIndex.updateSettings({
        filterableAttributes: ['userId'],
    });
}

const meilisearchClient = new MeilisearchClient();

export {meilisearchClient};
