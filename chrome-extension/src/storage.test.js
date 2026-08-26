import {
  clearServer,
  getEncryptionKey,
  getServer,
  getUser,
  setEncryptionKey,
  setServer,
  setUser,
} from "./storage";
import {
  NotelixAuthStorageKey,
  NotelixChromeStorageKey,
  NotelixEncryptionKeyStorageKey,
} from "./popup/consts";

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

describe("extension storage", () => {
  beforeEach(() => {
    global.chrome = {
      storage: {
        sync: storageArea(),
        local: storageArea(),
      },
    };
  });

  it("stores new authentication state only in local storage", async () => {
    const user = { id: 1, jwt: "secret-jwt" };
    await setServer("https://example.test/");

    await setUser(user);

    expect(chrome.storage.local.value()).toEqual({
      [NotelixAuthStorageKey]: {
        version: 1,
        server: "https://example.test",
        user,
      },
    });
    expect(JSON.stringify(chrome.storage.sync.value())).not.toContain(
      "secret-jwt"
    );
  });

  it("moves legacy authentication out of synced storage", async () => {
    const user = { id: 1, jwt: "legacy-jwt", client_side_encryption: "" };
    chrome.storage.sync = storageArea({
      [NotelixChromeStorageKey]: {
        notelixServer: "https://example.test",
        notelixUser: user,
        notelixPassword: "legacy-password",
      },
    });

    await expect(getUser()).resolves.toEqual(user);
    await expect(getServer()).resolves.toBe("https://example.test");
    expect(chrome.storage.local.value()).toEqual({
      [NotelixAuthStorageKey]: {
        version: 1,
        server: "https://example.test",
        user,
      },
    });
    expect(chrome.storage.sync.value()).toEqual({
      [NotelixChromeStorageKey]: {
        notelixServer: "https://example.test",
      },
    });
  });

  it("invalidates local credentials when a synced server changes", async () => {
    await setServer("https://first.example");
    await setUser({ id: 1, jwt: "first-server-jwt" });
    await setEncryptionKey("first-server-encryption-key");
    chrome.storage.sync = storageArea({
      [NotelixChromeStorageKey]: {
        notelixServer: "https://second.example",
      },
    });

    await expect(getUser()).resolves.toBeNull();
    await expect(getEncryptionKey()).resolves.toBeUndefined();
    expect(chrome.storage.local.value()).toEqual({});
  });

  it("clears credentials whenever the configured server is replaced", async () => {
    await setServer("https://first.example");
    const firstUser = { id: 1, jwt: "first-server-jwt" };
    await setUser(firstUser);
    await setEncryptionKey("first-server-encryption-key");

    await setServer("https://first.example/");
    await expect(getUser()).resolves.toEqual(firstUser);
    await expect(getEncryptionKey()).resolves.toBe(
      "first-server-encryption-key"
    );

    await setServer("https://second.example/");

    await expect(getUser()).resolves.toBeNull();
    await expect(getEncryptionKey()).resolves.toBeUndefined();
    await expect(getServer()).resolves.toBe("https://second.example");
    expect(chrome.storage.local.value()).not.toHaveProperty(
      NotelixEncryptionKeyStorageKey
    );

    await setUser({ id: 2, jwt: "second-server-jwt" });
    await setEncryptionKey("second-server-encryption-key");
    await clearServer();
    await expect(getUser()).resolves.toBeNull();
    await expect(getEncryptionKey()).resolves.toBeUndefined();
    await expect(getServer()).resolves.toBeNull();
  });
});
