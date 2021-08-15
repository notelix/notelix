import axios from "axios";
import {
  getEndpoint,
  wrapRequestApi,
  wrapRequestApiRequireLoggedIn,
} from "./common";

const signUp = (data) => {
  return wrapRequestApi(({ headers }) =>
    getEndpoint("users/signup").then((endpoint) =>
      axios.post(endpoint, data, { headers: headers })
    )
  );
};

const changePassword = (data) => {
  return wrapRequestApiRequireLoggedIn(({ headers }) =>
    getEndpoint("users/change-password").then((endpoint) =>
      axios.post(endpoint, data, { headers: headers })
    )
  );
};

const login = (data) => {
  return wrapRequestApi(({ headers }) =>
    getEndpoint("users/login").then((endpoint) =>
      axios.post(endpoint, data, { headers: headers }).then((item) => item.data)
    )
  );
};

export { signUp, login, changePassword };
