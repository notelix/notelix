import AES from "crypto-js/aes";
import CryptoJS from "crypto-js";
import {
  NotelixChromeStorageKey,
  NotelixEncryptionKeyStorageKey,
} from "../popup/consts";

const emptyIV = { words: [0, 0, 0, 0], sigBytes: 16 };

function storageGet(area, key) {
  return new Promise((resolve, reject) => {
    area.get(key, (value) => {
      const error = chrome.runtime?.lastError;
      if (error) {
        reject(new Error(error.message));
      } else {
        resolve(value);
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

export async function storeEncryptionKey(user, password) {
  if (user && user.client_side_encryption) {
    const key = decryptKey(user.client_side_encryption, password);
    await storageSet(chrome.storage.local, {
      [NotelixEncryptionKeyStorageKey]: key,
    });
    return key;
  }

  await clearEncryptionKey();
  return null;
}

export function clearEncryptionKey() {
  return storageRemove(chrome.storage.local, NotelixEncryptionKeyStorageKey);
}

export async function getKey() {
  if (window.NotelixEmbeddedConfig) {
    return null;
  }

  const syncedValue = await storageGet(
    chrome.storage.sync,
    NotelixChromeStorageKey
  );
  const syncedStorage = syncedValue[NotelixChromeStorageKey] || {};
  const encryptedConfig = syncedStorage.notelixUser?.client_side_encryption;
  if (!encryptedConfig) {
    return null;
  }

  const localValue = await storageGet(
    chrome.storage.local,
    NotelixEncryptionKeyStorageKey
  );
  if (localValue[NotelixEncryptionKeyStorageKey]) {
    return localValue[NotelixEncryptionKeyStorageKey];
  }

  if (syncedStorage.notelixPassword) {
    const key = decryptKey(encryptedConfig, syncedStorage.notelixPassword);
    await storageSet(chrome.storage.local, {
      [NotelixEncryptionKeyStorageKey]: key,
    });
    delete syncedStorage.notelixPassword;
    await storageSet(chrome.storage.sync, syncedValue);
    return key;
  }

  throw new Error("client-side encryption key is unavailable; log in again");
}

export async function clearLegacyPassword() {
  const syncedValue = await storageGet(
    chrome.storage.sync,
    NotelixChromeStorageKey
  );
  const syncedStorage = syncedValue[NotelixChromeStorageKey];
  if (syncedStorage && "notelixPassword" in syncedStorage) {
    delete syncedStorage.notelixPassword;
    await storageSet(chrome.storage.sync, syncedValue);
  }
}

export function ensureLocalEncryptionKey(user, password) {
  return storeEncryptionKey(user, password).then(async (key) => {
    await clearLegacyPassword();
    return key;
  });
}

export function clientSideEncryptionEnabled() {
  return new Promise((resolve) => {
    if (window.NotelixEmbeddedConfig) {
      resolve(false);
      return;
    }
    chrome.storage.sync.get(NotelixChromeStorageKey, (value) => {
      const NotelixChromeStorage = value[NotelixChromeStorageKey];
      resolve(
        !!(
          NotelixChromeStorage &&
          NotelixChromeStorage.notelixUser &&
          NotelixChromeStorage.notelixUser.client_side_encryption
        )
      );
    });
  });
}

export function decryptKey(encryptedCfg, password) {
  const bytes = AES.decrypt(encryptedCfg, password);
  const originalText = bytes.toString(CryptoJS.enc.Utf8);

  return JSON.parse(originalText).key;
}

export function encryptFields({ key, object, fields = [], iv = "" }) {
  return new Promise((resolve) => {
    if (window.NotelixEmbeddedConfig) {
      resolve(object);
      return;
    }

    if (!key) {
      resolve(object);
    } else {
      const result = { ...object };
      fields.forEach((k) => {
        if (!object[k]) {
          result[k] = object[k];
          return;
        }

        result[k] = CryptoJS.AES.encrypt(object[k], key, {
          iv: iv ? CryptoJS.enc.Utf8.parse(iv) : emptyIV,
        }).toString();
      });
      resolve(result);
    }
  });
}

export function decryptFields({ key, object, fields, iv }) {
  return new Promise((resolve) => {
    if (!key) {
      resolve(object);
    } else {
      const result = { ...object };
      (fields || []).forEach((k) => {
        if (!object[k]) {
          result[k] = object[k];
          return;
        }

        result[k] = AES.decrypt(object[k], key, {
          iv: iv ? CryptoJS.enc.Utf8.parse(iv) : emptyIV,
        }).toString(CryptoJS.enc.Utf8);
      });
      resolve(result);
    }
  });
}
