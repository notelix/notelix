import { getServer, getUser, setUser } from "./storage";
import {
  NotelixAuthStorageKey,
  NotelixChromeStorageKey,
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

    await setUser(user);

    expect(chrome.storage.local.value()).toEqual({
      [NotelixAuthStorageKey]: user,
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
      [NotelixAuthStorageKey]: user,
    });
    expect(chrome.storage.sync.value()).toEqual({
      [NotelixChromeStorageKey]: {
        notelixServer: "https://example.test",
      },
    });
  });
});
