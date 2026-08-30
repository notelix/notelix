import { DataSource } from 'typeorm';
import {
  currentSchemaRevision,
  ensureCurrentSchema,
} from '../src/databaseSchema';

const tableRows = [
  'annotation',
  'annotation_change_history',
  'annotation_search_outbox',
  'annotation_sync_snapshot',
  'annotation_sync_snapshot_item',
  'jwt_private_key',
  'notelix_schema',
  'request_rate_limit',
  'static_token',
  'user',
].map((tablename) => ({ tablename }));

function dataSourceWithQuery(query: jest.Mock): DataSource {
  return {
    transaction: (callback: (manager: { query: jest.Mock }) => unknown) =>
      callback({ query }),
  } as unknown as DataSource;
}

describe('Current database schema contract', () => {
  it('initializes an empty database directly to the current schema', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await ensureCurrentSchema(dataSourceWithQuery(query));

    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[2][0]).toContain('CREATE TABLE "user"');
    expect(query.mock.calls[2][0]).toContain(
      'CREATE TABLE "annotation_search_outbox"',
    );
    expect(query.mock.calls[2][0]).toContain(currentSchemaRevision);
  });

  it('accepts only the complete current schema and revision', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(tableRows)
      .mockResolvedValueOnce([{ revision: currentSchemaRevision }]);

    await expect(
      ensureCurrentSchema(dataSourceWithQuery(query)),
    ).resolves.toBeUndefined();
  });

  it('rejects a populated database that is not the current schema', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ tablename: 'user' }]);

    await expect(
      ensureCurrentSchema(dataSourceWithQuery(query)),
    ).rejects.toThrow('start with an empty database');
  });

  it('rejects a schema with a different revision', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(tableRows)
      .mockResolvedValueOnce([{ revision: 'different' }]);

    await expect(
      ensureCurrentSchema(dataSourceWithQuery(query)),
    ).rejects.toThrow('start with an empty database');
  });
});
