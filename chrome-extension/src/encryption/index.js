import AES from "crypto-js/aes";
import CryptoJS from "crypto-js";
import {
  clearEncryptionKey,
  getEncryptionKey,
  getUser,
  setEncryptionKey,
} from "../storage";

export { clearEncryptionKey } from "../storage";

const emptyIV = { words: [0, 0, 0, 0], sigBytes: 16 };

export async function storeEncryptionKey(user, password) {
  if (user && user.client_side_encryption) {
    const key = decryptKey(user.client_side_encryption, password);
    await setEncryptionKey(key);
    return key;
  }

  await clearEncryptionKey();
  return null;
}

export async function getKey() {
  if (window.NotelixEmbeddedConfig) {
    return null;
  }

  const user = await getUser();
  const encryptedConfig = user?.client_side_encryption;
  if (!encryptedConfig) {
    return null;
  }

  const localKey = await getEncryptionKey();
  if (localKey) {
    return localKey;
  }

  throw new Error("client-side encryption key is unavailable; log in again");
}

export function ensureLocalEncryptionKey(user, password) {
  return storeEncryptionKey(user, password);
}

export function clientSideEncryptionEnabled() {
  if (window.NotelixEmbeddedConfig) {
    return Promise.resolve(false);
  }
  return getUser().then((user) => !!user?.client_side_encryption);
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
