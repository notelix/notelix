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
  chrome.storage.sync.get(NotelixChromeStorageKey, async (value) => {
    if (!value[NotelixChromeStorageKey].notelixUser) {
      client.post("http://127.0.0.1:18565/agentsync/resetData", {});
      return;
    }
    const server = value[NotelixChromeStorageKey].notelixServer;
    const serverUrl = server.replace(/\/$/, "");
    const clientSideEncryptionKey = await getKey();
    client
      .post(
        "http://127.0.0.1:18565/agentsync/set",
        {
          config: {
            enabled: true,
            url: serverUrl,
            token: value[NotelixChromeStorageKey].notelixUser.jwt,
            clientSideEncryptionKey: clientSideEncryptionKey,
          },
        },
        {}
      )
      .catch((ex) => {
        console.log(
          "(okay if not using notelix-agent) trySetAgentSyncParams failed ",
          ex
        );
      });
  });
}
