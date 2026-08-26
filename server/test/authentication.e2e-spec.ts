import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthenticationService } from '../src/authenticators/authentication.service';
import { InvalidAuthenticationCredentialError } from '../src/authenticators/invalidAuthenticationCredential.error';

describe('Authentication service', () => {
  function makeService(header?: string) {
    const jwtAuth = {
      getAuthenticatorName: jest.fn().mockReturnValue('jwt'),
      authenticate: jest.fn(),
    };
    const staticTokenAuth = {
      getAuthenticatorName: jest.fn().mockReturnValue('static-token'),
      authenticate: jest.fn(),
    };
    const request = { headers: { authorization: header } };
    return {
      service: new AuthenticationService(
        request as any,
        jwtAuth as any,
        staticTokenAuth as any,
      ),
      jwtAuth,
      staticTokenAuth,
    };
  }

  it('accepts authentication schemes case-insensitively', async () => {
    const { service, jwtAuth } = makeService('JWT signed-token');
    const user = { id: 42 };
    jwtAuth.authenticate.mockResolvedValue(user);

    await expect(service.getAuthenticatedUser()).resolves.toBe(user);
    expect(jwtAuth.authenticate).toHaveBeenCalledWith('signed-token');
  });

  it('clears client credentials only for rejected credentials', async () => {
    const { service, jwtAuth } = makeService('jwt expired-token');
    jwtAuth.authenticate.mockRejectedValue(
      new InvalidAuthenticationCredentialError('expired token details'),
    );

    let error: UnauthorizedException;
    try {
      await service.getAuthenticatedUser();
      throw new Error('authentication unexpectedly succeeded');
    } catch (caught) {
      error = caught as UnauthorizedException;
    }

    expect(error).toBeInstanceOf(UnauthorizedException);
    expect(error.getResponse()).toEqual({
      message: 'authentication failed',
      clearClientCredentials: true,
    });
    expect(JSON.stringify(error.getResponse())).not.toContain('expired');
  });

  it('returns a retryable outage without clearing valid credentials', async () => {
    const { service, jwtAuth } = makeService('jwt invalid-token');
    jwtAuth.authenticate.mockRejectedValue(
      new Error('database connection string and internal details'),
    );

    let error: ServiceUnavailableException;
    try {
      await service.getAuthenticatedUser();
      throw new Error('authentication unexpectedly succeeded');
    } catch (caught) {
      error = caught as ServiceUnavailableException;
    }

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(error.getResponse()).toEqual({
      message: 'authentication temporarily unavailable',
      retryable: true,
    });
    expect(JSON.stringify(error.getResponse())).not.toContain('database');
    expect(error.getResponse()).not.toHaveProperty('clearClientCredentials');
  });

  it.each([undefined, '', 'jwt', 'unsupported value'])(
    'rejects malformed headers without clearing unrelated credentials',
    async (header) => {
      const { service } = makeService(header);

      let error: UnauthorizedException;
      try {
        await service.getAuthenticatedUser();
        throw new Error('authentication unexpectedly succeeded');
      } catch (caught) {
        error = caught as UnauthorizedException;
      }

      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(error.getResponse()).toEqual({
        message: 'authentication failed',
        clearClientCredentials: false,
      });
    },
  );
});
