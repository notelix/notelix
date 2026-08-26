import {
  NotelixAuthStorageKey,
  NotelixChromeStorageKey,
  NotelixEncryptionKeyStorageKey,
} from "./popup/consts";

function storageGet(area, key) {
  return new Promise((resolve, reject) => {
    area.get(key, (value) => {
      const error = chrome.runtime?.lastError;
      if (error) {
        reject(new Error(error.message));
      } else {
        resolve(value[key]);
      }
    });
  });
}

function storageSet(area, value) {
  return new Promise((resolve, reject) => {
    area.set(value, () => {
      const error = chrome.runtime?.lastError;
      if (error) {
        reject(new Error(error.message));
      } else {
        resolve();
      }
    });
  });
}

function storageRemove(area, key) {
  return new Promise((resolve, reject) => {
    area.remove(key, () => {
      const error = chrome.runtime?.lastError;
      if (error) {
        reject(new Error(error.message));
      } else {
        resolve();
      }
    });
  });
}

async function getSyncedConfig() {
  return (await storageGet(chrome.storage.sync, NotelixChromeStorageKey)) || {};
}

function setSyncedConfig(config) {
  return storageSet(chrome.storage.sync, {
    [NotelixChromeStorageKey]: config,
  });
}

export async function getUser() {
  const localUser = await storageGet(
    chrome.storage.local,
    NotelixAuthStorageKey
  );
  if (localUser) {
    return localUser;
  }

  const syncedConfig = await getSyncedConfig();
  const legacyUser = syncedConfig.notelixUser;
  if (!legacyUser) {
    return null;
  }

  await setUser(legacyUser);
  delete syncedConfig.notelixUser;
  if (!legacyUser.client_side_encryption) {
    delete syncedConfig.notelixPassword;
  }
  await setSyncedConfig(syncedConfig);
  return legacyUser;
}

export function setUser(user) {
  return storageSet(chrome.storage.local, { [NotelixAuthStorageKey]: user });
}

export async function clearUser() {
  await storageRemove(chrome.storage.local, NotelixAuthStorageKey);
  const syncedConfig = await getSyncedConfig();
  delete syncedConfig.notelixUser;
  delete syncedConfig.notelixPassword;
  await setSyncedConfig(syncedConfig);
}

export async function getServer() {
  return (await getSyncedConfig()).notelixServer || null;
}

export async function setServer(server) {
  const syncedConfig = await getSyncedConfig();
  syncedConfig.notelixServer = server;
  await setSyncedConfig(syncedConfig);
}

export async function clearServer() {
  const syncedConfig = await getSyncedConfig();
  delete syncedConfig.notelixServer;
  await setSyncedConfig(syncedConfig);
}

export async function getLegacyPassword() {
  return (await getSyncedConfig()).notelixPassword || null;
}

export async function clearLegacyPassword() {
  const syncedConfig = await getSyncedConfig();
  if ("notelixPassword" in syncedConfig) {
    delete syncedConfig.notelixPassword;
    await setSyncedConfig(syncedConfig);
  }
}

export function getEncryptionKey() {
  return storageGet(chrome.storage.local, NotelixEncryptionKeyStorageKey);
}

export function setEncryptionKey(key) {
  return storageSet(chrome.storage.local, {
    [NotelixEncryptionKeyStorageKey]: key,
  });
}

export function clearEncryptionKey() {
  return storageRemove(chrome.storage.local, NotelixEncryptionKeyStorageKey);
}
