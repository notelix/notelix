import { Annotation } from '../src/models/annotation.entity';
import { User } from '../src/models/user.entity';
import AnnotationChangeHistoryService from '../src/services/annotationChangeHistory';

describe('Annotation sync history', () => {
  const createdAt = new Date('2026-01-01T00:00:00.000Z');
  const updatedAt = new Date('2026-01-02T00:00:00.000Z');

  function makeAnnotation(): Annotation {
    const user = Object.assign(new User(), {
      id: 9,
      name: 'alice',
      password: 'stored-password-hash',
      client_side_encryption: 'private-encryption-metadata',
      tokenVersion: 3,
    });
    return Object.assign(new Annotation(), {
      id: 12,
      uid: 'annotation-uid',
      url: 'https://example.com/article',
      title: 'Article',
      host: 'example.com',
      data: { text: 'highlighted text', notes: 'a note' },
      user,
      created_at: createdAt,
      updated_at: updatedAt,
    });
  }

  it.each([
    ['save', 'createAnnotationChangeHistoryForSave', 1],
    ['delete', 'createAnnotationChangeHistoryForDelete', 2],
  ])(
    'stores an annotation-only snapshot for %s history',
    async (_operation, method, kind) => {
      const annotation = makeAnnotation();
      const manager = {
        save: jest.fn(async (history) => history),
        query: jest.fn().mockResolvedValue([]),
      };
      const service = new AnnotationChangeHistoryService();

      const history = await service[method](annotation, manager as any);

      expect(history.kind).toBe(kind);
      expect(history.user).toBe(annotation.user);
      expect(history.data).toEqual({
        id: 12,
        uid: 'annotation-uid',
        url: 'https://example.com/article',
        title: 'Article',
        host: 'example.com',
        data: { text: 'highlighted text', notes: 'a note' },
        created_at: createdAt,
        updated_at: updatedAt,
      });
      expect(JSON.stringify(history.data)).not.toContain(
        'stored-password-hash',
      );
      expect(JSON.stringify(history.data)).not.toContain(
        'private-encryption-metadata',
      );
      expect(manager.query).toHaveBeenNthCalledWith(
        1,
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        ['notelix-annotation-history:9'],
      );
      expect(manager.query.mock.calls[1][0]).toContain(
        'DELETE FROM "annotation_change_history"',
      );
      expect(manager.query.mock.calls[1][1]).toEqual([9, 10000, 67108864]);
      expect(manager.query.mock.invocationCallOrder[0]).toBeLessThan(
        manager.save.mock.invocationCallOrder[0],
      );
      expect(manager.save.mock.invocationCallOrder[0]).toBeLessThan(
        manager.query.mock.invocationCallOrder[1],
      );
    },
  );
});
