import * as CryptoJS from 'crypto-js';

const { AES } = CryptoJS;

const emptyIV = { words: [0, 0, 0, 0], sigBytes: 16 };

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
