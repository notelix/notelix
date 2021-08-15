import { Annotation } from '../models/annotation.entity';
import { User } from '../models/user.entity';
import env from '../../env';
import axios from 'axios';

export async function bootstrapTypeSense() {}

export const TypeSenseClient = {
  getTypeSenseHost() {
    const firstTypeSenseNode = env.typeSenseSearchConfig.nodes[0];
    return `${firstTypeSenseNode.protocol}://${firstTypeSenseNode.host}:${firstTypeSenseNode.port}`;
  },
  getTypeSenseDocumentsUrl: function (indexName: string) {
    return `${this.getTypeSenseHost()}/collections/${indexName}/documents`;
  },
  getTypeSenseHeaders() {
    return {
      headers: {
        'X-TYPESENSE-API-KEY': env.typeSenseSearchConfig.apiKey,
      },
    };
  },
  delete(indexName: string, document: any) {
    return axios.request({
      method: 'DELETE',
      url: `${this.getTypeSenseDocumentsUrl(indexName)}/${document.id}`,
      ...this.getTypeSenseHeaders(),
      data: document,
    });
  },
  index(indexName: string, document: any) {
    const firstTypeSenseNode = env.typeSenseSearchConfig.nodes[0];
    return axios.request({
      method: 'POST',
      url: `${this.getTypeSenseDocumentsUrl(indexName)}?action=upsert`,
      ...this.getTypeSenseHeaders(),
      data: document,
    });
  },
  indexAnnotation(user: User, annotation: Annotation) {
    return this.index('annotations', {
      id: annotation.uid,
      user_id: user.id,
      uid: annotation.uid,
      url: annotation.url,
      text: annotation.data.originalText || '',
      notes: annotation.data.notes || '',
    });
  },
  deleteAnnotation(annotation: Annotation) {
    return this.delete('annotations', {
      id: annotation.uid,
    });
  },
};
