import { StaticTokenAuth } from '../src/authenticators/authenticators/staticTokenAuth';
import { InvalidAuthenticationCredentialError } from '../src/authenticators/invalidAuthenticationCredential.error';
import { StaticToken } from '../src/models/staticToken.entity';
import { digestStaticToken } from '../src/security/staticToken';

describe('Static-token authentication', () => {
  afterEach(() => {
    jest.restoreAllMocks();
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
});
