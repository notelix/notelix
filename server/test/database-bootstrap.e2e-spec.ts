import { quoteIdentifier, readBoolean } from '../tools/ensure-pg-db';

describe('Database bootstrap configuration', () => {
  const originalAutoCreate = process.env.DB_AUTO_CREATE;

  afterEach(() => {
    if (originalAutoCreate === undefined) {
      delete process.env.DB_AUTO_CREATE;
    } else {
      process.env.DB_AUTO_CREATE = originalAutoCreate;
    }
  });

  it('quotes PostgreSQL identifiers without allowing SQL syntax', () => {
    expect(quoteIdentifier('database"; DROP DATABASE postgres; --')).toBe(
      '"database""; DROP DATABASE postgres; --"',
    );
  });

  it('parses explicit automatic-creation settings', () => {
    delete process.env.DB_AUTO_CREATE;
    expect(readBoolean('DB_AUTO_CREATE', true)).toBe(true);

    process.env.DB_AUTO_CREATE = 'false';
    expect(readBoolean('DB_AUTO_CREATE', true)).toBe(false);

    process.env.DB_AUTO_CREATE = 'true';
    expect(readBoolean('DB_AUTO_CREATE', false)).toBe(true);
  });

  it('rejects ambiguous automatic-creation settings', () => {
    process.env.DB_AUTO_CREATE = 'yes';
    expect(() => readBoolean('DB_AUTO_CREATE', true)).toThrow(
      'DB_AUTO_CREATE must be true or false',
    );
  });
});
