import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import { AuthenticationService } from '../src/authenticators/authentication.service';
import { UsersController } from '../src/controllers/users.controller';
import { User } from '../src/models/user.entity';
import JwtService from '../src/services/jwt';
import { createValidationPipe } from '../src/application';
import { AppDataSource } from '../src/database';

describe('Users API', () => {
  let app: INestApplication;
  let authenticationService: { getAuthenticatedUser: jest.Mock };
  let jwtService: { signForUser: jest.Mock };

  beforeEach(async () => {
    authenticationService = {
      getAuthenticatedUser: jest.fn(),
    };
    jwtService = {
      signForUser: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: AuthenticationService,
          useValue: authenticationService,
        },
        {
          provide: JwtService,
          useValue: jwtService,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await app.close();
  });

  function makeUser(password: string): User {
    return Object.assign(new User(), {
      id: 42,
      name: 'alice',
      password,
      tokenVersion: 3,
      client_side_encryption: 'encrypted-client-key',
      created_at: new Date('2024-01-01T00:00:00.000Z'),
      updated_at: new Date('2024-01-02T00:00:00.000Z'),
    });
  }

  it('returns only client-safe user fields from login', async () => {
    const user = makeUser(await bcrypt.hash('correct-password', 4));
    jest.spyOn(User, 'findOne').mockResolvedValue(user);
    const save = jest
      .spyOn(User.prototype, 'save')
      .mockRejectedValue(new Error('login must not persist a stale user'));
    jwtService.signForUser.mockReturnValue('signed-jwt');

    const response = await request(app.getHttpServer())
      .post('/users/login')
      .send({ username: 'alice', password: 'correct-password' })
      .expect(201);

    expect(response.body).toEqual({
      id: 42,
      name: 'alice',
      client_side_encryption: 'encrypted-client-key',
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-02T00:00:00.000Z',
      jwt: 'signed-jwt',
    });
    expect(response.body).not.toHaveProperty('password');
    expect(save).not.toHaveBeenCalled();
  });

  it('does not reveal whether a username exists during login', async () => {
    const user = makeUser(await bcrypt.hash('correct-password', 4));
    jest
      .spyOn(User, 'findOne')
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(user);

    const missingUser = await request(app.getHttpServer())
      .post('/users/login')
      .send({ username: 'missing', password: 'incorrect-password' })
      .expect(403);
    const incorrectPassword = await request(app.getHttpServer())
      .post('/users/login')
      .send({ username: 'alice', password: 'incorrect-password' })
      .expect(403);

    expect(missingUser.body.message).toBe('invalid username or password');
    expect(incorrectPassword.body.message).toBe('invalid username or password');
  });

  it('does not expose the password hash from who-am-i', async () => {
    const user = makeUser('stored-password-hash');
    authenticationService.getAuthenticatedUser.mockResolvedValue(user);

    const response = await request(app.getHttpServer())
      .get('/users/who-am-i')
      .expect(200);

    expect(response.body.name).toBe('alice');
    expect(response.body.client_side_encryption).toBe('encrypted-client-key');
    expect(response.body).not.toHaveProperty('password');
  });

  it('changes passwords asynchronously without returning the new hash', async () => {
    const user = makeUser(await bcrypt.hash('old-password', 4));
    authenticationService.getAuthenticatedUser.mockResolvedValue(user);
    const repository = {
      findOne: jest.fn().mockResolvedValue(user),
      save: jest.fn().mockImplementation(async (candidate) => candidate),
    };
    jest
      .spyOn(AppDataSource, 'transaction')
      .mockImplementation(async (callback: any) =>
        callback({ getRepository: () => repository }),
      );

    const response = await request(app.getHttpServer())
      .post('/users/change-password')
      .send({
        oldPassword: 'old-password',
        newPassword: 'new-password',
        newClientSideEncryptionParams: 'new-encrypted-client-key',
      })
      .expect(201);

    expect(await bcrypt.compare('new-password', user.password)).toBe(true);
    expect(response.body.client_side_encryption).toBe(
      'new-encrypted-client-key',
    );
    expect(response.body).not.toHaveProperty('password');
    expect(user.tokenVersion).toBe(4);
    expect(repository.findOne).toHaveBeenCalledWith({
      where: { id: 42 },
      lock: { mode: 'pessimistic_write' },
    });
  });

  it('rejects disabling client-side encryption during a password change', async () => {
    const user = makeUser(await bcrypt.hash('old-password', 4));
    authenticationService.getAuthenticatedUser.mockResolvedValue(user);
    const transaction = jest.spyOn(AppDataSource, 'transaction');

    const response = await request(app.getHttpServer())
      .post('/users/change-password')
      .send({
        oldPassword: 'old-password',
        newPassword: 'new-password',
        newClientSideEncryptionParams: null,
      })
      .expect(400);

    expect(response.body.message).toBe(
      'client-side encryption cannot be enabled or disabled during a password change',
    );
    expect(transaction).not.toHaveBeenCalled();
    expect(await bcrypt.compare('old-password', user.password)).toBe(true);
    expect(user.client_side_encryption).toBe('encrypted-client-key');
    expect(user.tokenVersion).toBe(3);
  });

  it('rejects enabling client-side encryption during a password change', async () => {
    const user = makeUser(await bcrypt.hash('old-password', 4));
    user.client_side_encryption = '';
    authenticationService.getAuthenticatedUser.mockResolvedValue(user);
    const transaction = jest.spyOn(AppDataSource, 'transaction');

    await request(app.getHttpServer())
      .post('/users/change-password')
      .send({
        oldPassword: 'old-password',
        newPassword: 'new-password',
        newClientSideEncryptionParams: 'new-encrypted-client-key',
      })
      .expect(400);

    expect(transaction).not.toHaveBeenCalled();
    expect(user.client_side_encryption).toBe('');
    expect(user.tokenVersion).toBe(3);
  });

  it('rechecks the encryption mode after locking the user row', async () => {
    const authenticatedUser = makeUser(await bcrypt.hash('old-password', 4));
    const lockedUser = makeUser(authenticatedUser.password);
    lockedUser.client_side_encryption = '';
    authenticationService.getAuthenticatedUser.mockResolvedValue(
      authenticatedUser,
    );
    const repository = {
      findOne: jest.fn().mockResolvedValue(lockedUser),
      save: jest.fn(),
    };
    jest
      .spyOn(AppDataSource, 'transaction')
      .mockImplementation(async (callback: any) =>
        callback({ getRepository: () => repository }),
      );

    await request(app.getHttpServer())
      .post('/users/change-password')
      .send({
        oldPassword: 'old-password',
        newPassword: 'new-password',
        newClientSideEncryptionParams: 'new-encrypted-client-key',
      })
      .expect(400);

    expect(repository.save).not.toHaveBeenCalled();
    expect(lockedUser.tokenVersion).toBe(3);
  });

  it('rejects malformed and unexpected signup fields', async () => {
    await request(app.getHttpServer())
      .post('/users/signup')
      .send({ username: 'alice', password: 'short' })
      .expect(400);

    await request(app.getHttpServer())
      .post('/users/signup')
      .send({
        username: 'alice',
        password: 'long-enough-password',
        administrator: true,
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/users/signup')
      .send({
        username: 'alice',
        password: 'long-enough-password',
        enableClientSideEncryption: true,
        client_side_encryption: '',
      })
      .expect(400);
  });
});
