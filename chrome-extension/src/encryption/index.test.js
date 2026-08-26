import AES from "crypto-js/aes";
import {
  ensureLocalEncryptionKey,
  getKey,
  storeEncryptionKey,
} from ".";
import {
  NotelixChromeStorageKey,
  NotelixEncryptionKeyStorageKey,
} from "../popup/consts";

function storageArea(initialValue = {}) {
  let value = { ...initialValue };

  return {
    get: jest.fn((key, callback) => callback({ [key]: value[key] })),
    set: jest.fn((nextValue, callback) => {
      value = { ...value, ...nextValue };
      callback();
    }),
    remove: jest.fn((key, callback) => {
      delete value[key];
      callback();
    }),
    value: () => value,
  };
}

describe("client-side encryption key storage", () => {
  const password = "correct horse battery staple";
  const key = "f".repeat(64);
  const encryptedConfig = AES.encrypt(JSON.stringify({ key }), password).toString();

  beforeEach(() => {
    global.window = {};
    global.chrome = {
      storage: {
        sync: storageArea(),
        local: storageArea(),
      },
    };
  });

  it("stores the decrypted key locally without storing the password", async () => {
    await ensureLocalEncryptionKey(
      { client_side_encryption: encryptedConfig },
      password
    );

    expect(chrome.storage.local.value()).toEqual({
      [NotelixEncryptionKeyStorageKey]: key,
    });
    expect(JSON.stringify(chrome.storage.sync.value())).not.toContain(password);
  });

  it("migrates and removes a legacy synced password", async () => {
    chrome.storage.sync = storageArea({
      [NotelixChromeStorageKey]: {
        notelixUser: { client_side_encryption: encryptedConfig },
        notelixPassword: password,
      },
    });

    await expect(getKey()).resolves.toBe(key);
    expect(chrome.storage.local.value()).toEqual({
      [NotelixEncryptionKeyStorageKey]: key,
    });
    expect(chrome.storage.sync.value()[NotelixChromeStorageKey]).not.toHaveProperty(
      "notelixPassword"
    );
  });

  it("fails closed when encryption is enabled but no key is available", async () => {
    chrome.storage.sync = storageArea({
      [NotelixChromeStorageKey]: {
        notelixUser: { client_side_encryption: encryptedConfig },
      },
    });

    await expect(getKey()).rejects.toThrow("log in again");
  });

  it("removes a stale local key when encryption is disabled", async () => {
    chrome.storage.local = storageArea({
      [NotelixEncryptionKeyStorageKey]: key,
    });

    await expect(storeEncryptionKey({}, password)).resolves.toBeNull();
    expect(chrome.storage.local.value()).toEqual({});
  });
});
