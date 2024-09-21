import {
  getEndpoint,
  wrapRequestApi,
  wrapRequestApiRequireLoggedIn,
} from "./common";
import { NotelixChromeStorageTokenKey } from "../popup/consts";
import supabase from './supaClient';

const signUp = async (data) => {
  const { user, serror } = await supabase.auth.signUp({
    email: data.username,
    password: data.password,
  });
  if (serror) throw error;
  return user;
};


const changePassword = (data) => {
  // return wrapRequestApiRequireLoggedIn(({ headers }) =>
  //   getEndpoint("users/change-password").then((endpoint) =>
  //     client.post(endpoint, data, { headers: headers })
  //   )
  // );
};

const login = async (credentials) => {
  
  const auth = await supabase.auth.signInWithPassword({
    email: credentials.username,
    password: credentials.password,
  });
  if (auth.error) {
    alert(auth.error.message);
    throw auth.error;
  }

  chrome.storage.sync.set({
    [NotelixChromeStorageTokenKey]: auth.data.session
  });

  //set token to client
  const setToken = await supabase.auth.setSession({
    access_token: auth.data.session.access_token,
    refresh_token: auth.data.session.refresh_token
  })
  
  if (setToken.error) {
    alert(setToken.error.message);
    throw setToken.error;
  }

  // Insert user data into the users table in first login
  const {data, error} = await supabase
  .from('User')
  .select()
  .eq("user_id", auth.data.user.id);

  if (error) {
    alert(error.message);
    throw error;
  }
  if (data.length == 0){
    const firstTimeInsert = await supabase
      .from('User')
      .insert(
        { name: credentials.username } // Adjust fields as necessary
      );

    if (firstTimeInsert.error) {
      alert(firstTimeInsert.error.message);
      throw firstTimeInsert.error;
    }
    return firstTimeInsert.data;
  }
  return data[0];
};

export { signUp, login, changePassword };
