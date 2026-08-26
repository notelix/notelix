import { getKey } from "../encryption";
import { NotelixChromeStorageKey } from "../popup/consts";
import client from "./client";
import sleep from "../utils/sleep";

export function doTrySetAgentSyncParamsLoop() {
  if (window.NotelixEmbeddedConfig) {
    return;
  }
  setTimeout(async () => {
    while (true) {
      await trySetAgentSyncParams();
      await sleep(30000);
    }
  });
}

export async function trySetAgentSyncParams() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(NotelixChromeStorageKey, async (value) => {
      const storage = value[NotelixChromeStorageKey] || {};

      try {
        if (!storage.notelixUser) {
          await client.post(
            "http://127.0.0.1:18565/agentsync/resetData",
            {}
          );
          return;
        }

        const serverUrl = storage.notelixServer.replace(/\/$/, "");
        const clientSideEncryptionKey = await getKey();
        await client.post(
          "http://127.0.0.1:18565/agentsync/set",
          {
            config: {
              enabled: true,
              url: serverUrl,
              token: storage.notelixUser.jwt,
              clientSideEncryptionKey,
            },
          },
          {}
        );
      } catch (ex) {
        console.log(
          "(okay if not using notelix-agent) trySetAgentSyncParams failed ",
          ex
        );
      } finally {
        resolve();
      }
    });
  });
}
