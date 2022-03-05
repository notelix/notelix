interface Authenticator {
  getAuthenticatorName();
  authenticate(params);
}

export default Authenticator;
