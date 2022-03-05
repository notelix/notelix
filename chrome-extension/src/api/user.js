import {
  getEndpoint,
  wrapRequestApi,
  wrapRequestApiRequireLoggedIn,
} from "./common";
import client from "./client";

const signUp = (data) => {
  return wrapRequestApi(({ headers }) =>
    getEndpoint("users/signup").then((endpoint) =>
      client.post(endpoint, data, { headers: headers })
    )
  );
};

const changePassword = (data) => {
  return wrapRequestApiRequireLoggedIn(({ headers }) =>
    getEndpoint("users/change-password").then((endpoint) =>
      client.post(endpoint, data, { headers: headers })
    )
  );
};

const login = (data) => {
  return wrapRequestApi(({ headers }) =>
    getEndpoint("users/login").then((endpoint) =>
      client
        .post(endpoint, data, { headers: headers })
        .then((item) => item.data)
    )
  );
};

export { signUp, login, changePassword };
