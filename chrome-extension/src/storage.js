import {
  NotelixAuthStorageKey,
  NotelixChromeStorageKey,
  NotelixEncryptionKeyStorageKey,
} from "./popup/consts";

const authenticationStateVersion = 1;

function normalizeServer(server) {
  return (server || "").trim().replace(/\/+$/, "");
}

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

async function clearLocalCredentials() {
  await Promise.all([
    storageRemove(chrome.storage.local, NotelixAuthStorageKey),
    storageRemove(chrome.storage.local, NotelixEncryptionKeyStorageKey),
  ]);
}

export async function getUser() {
  const localAuthenticationState = await storageGet(
    chrome.storage.local,
    NotelixAuthStorageKey
  );
  if (localAuthenticationState) {
    const currentServer = normalizeServer(await getServer());
    if (
      localAuthenticationState.version === authenticationStateVersion &&
      localAuthenticationState.server === currentServer &&
      localAuthenticationState.user
    ) {
      return localAuthenticationState.user;
    }

    await clearLocalCredentials();
  }
  return null;
}

export function setUser(user) {
  return getServer().then((server) =>
    storageSet(chrome.storage.local, {
      [NotelixAuthStorageKey]: {
        version: authenticationStateVersion,
        server: normalizeServer(server),
        user,
      },
    })
  );
}

export async function clearUser() {
  await storageRemove(chrome.storage.local, NotelixAuthStorageKey);
}

export async function getServer() {
  const server = (await getSyncedConfig()).notelixServer;
  return server ? normalizeServer(server) : null;
}

export async function setServer(server) {
  const syncedConfig = await getSyncedConfig();
  const normalizedServer = normalizeServer(server);
  if (normalizeServer(syncedConfig.notelixServer) !== normalizedServer) {
    await clearLocalCredentials();
  }
  syncedConfig.notelixServer = normalizedServer;
  await setSyncedConfig(syncedConfig);
}

export async function clearServer() {
  const syncedConfig = await getSyncedConfig();
  await clearLocalCredentials();
  delete syncedConfig.notelixServer;
  await setSyncedConfig(syncedConfig);
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
