import { Logger } from '@nestjs/common';
import * as meilisearch from '../src/meilisearch';
import { meilisearchClient } from '../src/meilisearch';
import { Annotation } from '../src/models/annotation.entity';
import {
  ensureAgentAnnotationSearchIndexReady,
  rebuildAgentAnnotationSearchIndex,
} from '../src/services/agentSearchIndex';

describe('Agent search index recovery', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rebuilds all local annotations in bounded id-ordered batches', async () => {
    const firstBatch = Array.from({ length: 500 }, (_, index) => ({
      id: index + 1,
    })) as Annotation[];
    const secondBatch = [{ id: 501 }] as Annotation[];
    const find = jest
      .spyOn(Annotation, 'find')
      .mockResolvedValueOnce(firstBatch)
      .mockResolvedValueOnce(secondBatch);
    const index = jest
      .spyOn(meilisearchClient, 'IndexAnnotations')
      .mockResolvedValue(undefined);

    await rebuildAgentAnnotationSearchIndex();

    expect(find).toHaveBeenCalledTimes(2);
    expect(find.mock.calls[0][0]).toEqual(
      expect.objectContaining({ order: { id: 'ASC' }, take: 500 }),
    );
    expect(find.mock.calls[1][0]).toEqual(
      expect.objectContaining({ order: { id: 'ASC' }, take: 500 }),
    );
    expect(index).toHaveBeenNthCalledWith(1, firstBatch);
    expect(index).toHaveBeenNthCalledWith(2, secondBatch);
  });

  it('supplies the local rebuild as the schema repair callback', async () => {
    jest.spyOn(Annotation, 'find').mockResolvedValue([]);
    const ensure = jest
      .spyOn(meilisearch, 'ensureAnnotationIndexReady')
      .mockImplementation(async (beforeSchemaRepair) => beforeSchemaRepair());

    await ensureAgentAnnotationSearchIndexReady();

    expect(ensure).toHaveBeenCalledTimes(1);
    expect(Annotation.find).toHaveBeenCalledTimes(1);
  });
});
