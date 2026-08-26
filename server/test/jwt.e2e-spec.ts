import { generateKeyPairSync } from 'crypto';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import { User } from '../src/models/user.entity';
import JwtService, { genRsaKeyPair } from '../src/services/jwt';

jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  generateKeyPair: jest.fn(),
}));

const generateKeyPairMock = crypto.generateKeyPair as unknown as jest.Mock;

describe('JWT sessions', () => {
  const keyPair = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  });
  let jwtService: JwtService;

  beforeEach(() => {
    generateKeyPairMock.mockReset();
    jwtService = new JwtService();
    (jwtService as any).jwtPrivateKey = keyPair;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function makeUser(tokenVersion: number): User {
    return Object.assign(new User(), { id: 42, tokenVersion });
  }

  it('binds new tokens to the current user token version', async () => {
    const user = makeUser(3);
    jest.spyOn(User, 'findOne').mockResolvedValue(user);

    const token = jwtService.signForUser(user);
    expect(jwt.decode(token)).toEqual(
      expect.objectContaining({ id: 42, tokenVersion: 3, iss: 'notelix' }),
    );
    await expect(jwtService.getUserFromToken(token)).resolves.toBe(user);

    user.tokenVersion = 4;
    await expect(jwtService.getUserFromToken(token)).rejects.toThrow(
      'jwt has been revoked',
    );
  });

  it('keeps pre-migration tokens valid until the user version changes', async () => {
    const user = makeUser(0);
    jest.spyOn(User, 'findOne').mockResolvedValue(user);
    const legacyToken = jwt.sign({ id: user.id }, keyPair.privateKey, {
      algorithm: 'RS256',
      issuer: 'notelix',
      expiresIn: '1h',
    });

    await expect(jwtService.getUserFromToken(legacyToken)).resolves.toBe(user);
    user.tokenVersion = 1;
    await expect(jwtService.getUserFromToken(legacyToken)).rejects.toThrow(
      'jwt has been revoked',
    );
  });

  it('rejects asynchronous RSA generation failures', async () => {
    const failure = new Error('OpenSSL unavailable');
    generateKeyPairMock.mockImplementation((_algorithm, _options, callback) => {
      queueMicrotask(() => callback(failure));
    });

    await expect(genRsaKeyPair()).rejects.toBe(failure);
  });
});
