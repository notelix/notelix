import AES from "crypto-js/aes";
import CryptoJS from "crypto-js";
import { NotelixChromeStorageKey } from "../popup/consts";

const emptyIV = { words: [0, 0, 0, 0], sigBytes: 16 };

export function getKey() {
  return new Promise((resolve) => {
    if (window.notelixSaasConfig) {
      resolve(null);
      return;
    }
    chrome.storage.sync.get(NotelixChromeStorageKey, (value) => {
      const NotelixChromeStorage = value[NotelixChromeStorageKey];
      if (NotelixChromeStorage.notelixUser.client_side_encryption) {
        resolve(
          decryptKey(
            NotelixChromeStorage.notelixUser.client_side_encryption,
            NotelixChromeStorage.notelixPassword
          )
        );
      } else {
        resolve(null);
      }
    });
  });
}

export function clientSideEncryptionEnabled() {
  return new Promise((resolve) => {
    if (window.notelixSaasConfig) {
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

export function encryptFields(object, fields = []) {
  return new Promise((resolve) => {
    if (window.notelixSaasConfig) {
      resolve(object);
      return;
    }

    chrome.storage.sync.get(NotelixChromeStorageKey, (value) => {
      if (!value[NotelixChromeStorageKey].notelixUser.client_side_encryption) {
        resolve(object);
      } else {
        const key = CryptoJS.enc.Hex.parse(
          decryptKey(
            value[NotelixChromeStorageKey].notelixUser.client_side_encryption,
            value[NotelixChromeStorageKey].notelixPassword
          )
        );

        const result = { ...object };
        fields.forEach((k) => {
          if (!object[k]) {
            result[k] = object[k];
            return;
          }

          result[k] = CryptoJS.AES.encrypt(object[k], key, {
            iv: emptyIV,
          }).toString();
        });
        resolve(result);
      }
    });
  });
}

export function decryptFields({ decryptionKey, object, fields }) {
  return new Promise((resolve) => {
    if (!decryptionKey) {
      resolve(object);
    } else {
      const result = { ...object };
      (fields || []).forEach((k) => {
        if (!object[k]) {
          result[k] = object[k];
          return;
        }

        result[k] = AES.decrypt(object[k], decryptionKey, {
          iv: emptyIV,
        }).toString(CryptoJS.enc.Utf8);
      });
      resolve(result);
    }
  });
}
