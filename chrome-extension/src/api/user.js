import { NotelixChromeStorageKey, NotelixChromeStorageTokenKey } from "../popup/consts";
import supabase from './supaClient';

const signUp = async (data) => {
  if (data.enableClientSideEncryption){
    var storage = await chrome.storage.sync.get(NotelixChromeStorageKey);
    storage = storage[NotelixChromeStorageKey] || {};
    storage[data.username] = data.client_side_encryption
    chrome.storage.sync.set(
      {
        [NotelixChromeStorageKey]: storage
      }
    );
  }
  const signup = await supabase.auth.signUp({
    email: data.username,
    password: data.password,
  });
  if (signup.error) { alert(signup.error.message); throw signup.error};
  return signup.data;
};

const changePasswordRequest = async () => {
  const value = await chrome.storage.sync.get(NotelixChromeStorageKey);
  const user = value[NotelixChromeStorageKey].notelixUser;
  const url = `chrome-extension://${chrome.runtime.id}/reset-password.html`;
  const { data, error } = await supabase.auth.resetPasswordForEmail(user.name, {
    redirectTo: url,
  });
  if (error) {alert(error.message); throw error};
  return data;
};

const changePassword = async (credentials) => {
  const value = await chrome.storage.sync.get(NotelixChromeStorageKey);
  const user = value[NotelixChromeStorageKey].notelixUser;
  
  const userUpdate = await supabase
  .from('User')
  .update({
    client_side_encryption: credentials.newClientSideEncryptionParams
  })
  .eq('id', user.id)
  .select();
  if (userUpdate.error) {alert(userUpdate.error.message); throw userUpdate.error};

  const { data, error } = await supabase.auth.updateUser({
    password: credentials.newPassword,
  });
  if (error) {alert(error.message); throw error};
  
  return data;
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
    var storage = await chrome.storage.sync.get(NotelixChromeStorageKey);
    storage = storage[NotelixChromeStorageKey] || {};
    const clientSideEncryption = storage[credentials.username] || '';
    const firstTimeInsert = await supabase
      .from('User')
      .insert(
        { name: credentials.username, client_side_encryption: clientSideEncryption } // Adjust fields as necessary
      )
      .select();
    delete storage[credentials.username];
    chrome.storage.sync.set({
      [NotelixChromeStorageKey]: storage
    });
    if (firstTimeInsert.error) {
      alert(firstTimeInsert.error.message);
      throw firstTimeInsert.error;
    }
    return firstTimeInsert.data[0];
  }
  return data[0];
};

export { signUp, login, changePasswordRequest, changePassword };