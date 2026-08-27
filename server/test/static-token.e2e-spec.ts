import { StaticTokenAuth } from '../src/authenticators/authenticators/staticTokenAuth';
import { InvalidAuthenticationCredentialError } from '../src/authenticators/invalidAuthenticationCredential.error';
import { StaticToken } from '../src/models/staticToken.entity';
import { digestStaticToken } from '../src/security/staticToken';
import { AppDataSource } from '../src/database';
import { readStaticTokenProvisioningConfig } from '../src/security/staticTokenProvisioning';
import * as staticTokenVerifier from '../src/security/staticTokenVerifier';

describe('Static-token authentication', () => {
  const originalAutoProvision = process.env.STATIC_TOKEN_AUTO_PROVISION;
  const originalProvisioningLimit =
    process.env.STATIC_TOKEN_AUTO_PROVISION_LIMIT;
  const originalVerifierUrl = process.env.STATIC_TOKEN_VERIFIER_URL;
  const originalVerifierSecret = process.env.STATIC_TOKEN_VERIFIER_SECRET;

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalAutoProvision === undefined) {
      delete process.env.STATIC_TOKEN_AUTO_PROVISION;
    } else {
      process.env.STATIC_TOKEN_AUTO_PROVISION = originalAutoProvision;
    }
    if (originalProvisioningLimit === undefined) {
      delete process.env.STATIC_TOKEN_AUTO_PROVISION_LIMIT;
    } else {
      process.env.STATIC_TOKEN_AUTO_PROVISION_LIMIT = originalProvisioningLimit;
    }
    if (originalVerifierUrl === undefined) {
      delete process.env.STATIC_TOKEN_VERIFIER_URL;
    } else {
      process.env.STATIC_TOKEN_VERIFIER_URL = originalVerifierUrl;
    }
    if (originalVerifierSecret === undefined) {
      delete process.env.STATIC_TOKEN_VERIFIER_SECRET;
    } else {
      process.env.STATIC_TOKEN_VERIFIER_SECRET = originalVerifierSecret;
    }
  });

  it('defaults anonymous provisioning to disabled', () => {
    expect(readStaticTokenProvisioningConfig({})).toEqual({
      enabled: false,
      accountLimit: 1000,
      verifier: null,
    });
  });

  it('validates explicit provisioning configuration', () => {
    expect(
      readStaticTokenProvisioningConfig({
        STATIC_TOKEN_AUTO_PROVISION: 'true',
        STATIC_TOKEN_AUTO_PROVISION_LIMIT: '2500',
      }),
    ).toEqual({ enabled: true, accountLimit: 2500, verifier: null });
    expect(() =>
      readStaticTokenProvisioningConfig({
        STATIC_TOKEN_AUTO_PROVISION: 'sometimes',
      }),
    ).toThrow('STATIC_TOKEN_AUTO_PROVISION must be true or false');
    expect(() =>
      readStaticTokenProvisioningConfig({
        STATIC_TOKEN_AUTO_PROVISION_LIMIT: '0',
      }),
    ).toThrow(
      'STATIC_TOKEN_AUTO_PROVISION_LIMIT must be an integer between 1 and 1000000',
    );
  });

  it('requires a verifier for production provisioning', () => {
    expect(() =>
      readStaticTokenProvisioningConfig({
        NODE_ENV: 'production',
        STATIC_TOKEN_AUTO_PROVISION: 'true',
      }),
    ).toThrow('production static-token provisioning requires');

    expect(
      readStaticTokenProvisioningConfig({
        NODE_ENV: 'production',
        STATIC_TOKEN_AUTO_PROVISION: 'true',
        STATIC_TOKEN_VERIFIER_URL: 'http://icdesign-backend/api/verify',
        STATIC_TOKEN_VERIFIER_SECRET: 's'.repeat(32),
      }),
    ).toEqual({
      enabled: true,
      accountLimit: 1000,
      verifier: {
        url: 'http://icdesign-backend/api/verify',
        secret: 's'.repeat(32),
        timeoutMs: 2000,
      },
    });
  });

  it('looks up only a digest of the supplied token', async () => {
    const rawToken = 'a'.repeat(64);
    const user = { id: 42 };
    const findOne = jest.spyOn(StaticToken, 'findOne').mockResolvedValue(
      Object.assign(new StaticToken(), {
        tokenDigest: digestStaticToken(rawToken),
        user,
      }),
    );

    await expect(new StaticTokenAuth().authenticate(rawToken)).resolves.toBe(
      user,
    );
    expect(findOne).toHaveBeenCalledWith({
      relations: { user: true },
      where: { tokenDigest: digestStaticToken(rawToken) },
    });
    expect(JSON.stringify(findOne.mock.calls)).not.toContain(rawToken);
  });

  it('rejects tokens with an invalid length before querying storage', async () => {
    const findOne = jest.spyOn(StaticToken, 'findOne');

    await expect(
      new StaticTokenAuth().authenticate('short'),
    ).rejects.toBeInstanceOf(InvalidAuthenticationCredentialError);
    expect(findOne).not.toHaveBeenCalled();
  });

  it('propagates token lookup failures as infrastructure errors', async () => {
    const databaseFailure = new Error('database unavailable');
    jest.spyOn(StaticToken, 'findOne').mockRejectedValue(databaseFailure);

    await expect(
      new StaticTokenAuth().authenticate('a'.repeat(64)),
    ).rejects.toBe(databaseFailure);
  });

  it('allows registered tokens while provisioning is disabled', async () => {
    process.env.STATIC_TOKEN_AUTO_PROVISION = 'false';
    const user = { id: 43 };
    jest.spyOn(StaticToken, 'findOne').mockResolvedValue(
      Object.assign(new StaticToken(), {
        tokenDigest: digestStaticToken('b'.repeat(64)),
        user,
      }),
    );
    const transaction = jest.spyOn(AppDataSource, 'transaction');

    await expect(
      new StaticTokenAuth().authenticate('b'.repeat(64)),
    ).resolves.toBe(user);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects unknown tokens without opening a transaction when provisioning is disabled', async () => {
    process.env.STATIC_TOKEN_AUTO_PROVISION = 'false';
    jest.spyOn(StaticToken, 'findOne').mockResolvedValue(null);
    const transaction = jest.spyOn(AppDataSource, 'transaction');

    await expect(
      new StaticTokenAuth().authenticate('c'.repeat(64)),
    ).rejects.toThrow('static-token is not registered');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects an unknown token when the external verifier denies it', async () => {
    process.env.STATIC_TOKEN_AUTO_PROVISION = 'true';
    process.env.STATIC_TOKEN_VERIFIER_URL =
      'http://icdesign-backend/api/integrations/notelix/static-token/verify';
    process.env.STATIC_TOKEN_VERIFIER_SECRET = 's'.repeat(32);
    jest.spyOn(StaticToken, 'findOne').mockResolvedValue(null);
    const verify = jest
      .spyOn(staticTokenVerifier, 'verifyStaticTokenDigest')
      .mockResolvedValue(false);
    const transaction = jest.spyOn(AppDataSource, 'transaction');
    const rawToken = 'e'.repeat(64);

    await expect(new StaticTokenAuth().authenticate(rawToken)).rejects.toThrow(
      'static-token is not registered',
    );
    expect(verify).toHaveBeenCalledWith(
      digestStaticToken(rawToken),
      expect.objectContaining({
        url: 'http://icdesign-backend/api/integrations/notelix/static-token/verify',
      }),
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it('serializes provisioning and enforces the configured account limit', async () => {
    process.env.STATIC_TOKEN_AUTO_PROVISION = 'true';
    process.env.STATIC_TOKEN_AUTO_PROVISION_LIMIT = '1';
    jest.spyOn(StaticToken, 'findOne').mockResolvedValue(null);
    const repository = {
      findOne: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(1),
      save: jest.fn(),
    };
    const manager = {
      query: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ acquired: true }]),
      getRepository: jest.fn().mockReturnValue(repository),
      save: jest.fn(),
    };
    jest
      .spyOn(AppDataSource, 'transaction')
      .mockImplementation((operation: any) => operation(manager));

    await expect(
      new StaticTokenAuth().authenticate('d'.repeat(64)),
    ).rejects.toThrow('static-token provisioning limit reached');
    expect(manager.query).toHaveBeenNthCalledWith(
      1,
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`notelix-static-token:${digestStaticToken('d'.repeat(64))}`],
    );
    expect(manager.query).toHaveBeenNthCalledWith(
      2,
      'SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS acquired',
      ['notelix-static-token-provisioning'],
    );
    expect(repository.count).toHaveBeenCalledTimes(1);
    expect(manager.save).not.toHaveBeenCalled();
  });
});
