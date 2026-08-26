export class InvalidAuthenticationCredentialError extends Error {
  constructor(message = 'authentication credential is invalid') {
    super(message);
    this.name = 'InvalidAuthenticationCredentialError';
  }
}
