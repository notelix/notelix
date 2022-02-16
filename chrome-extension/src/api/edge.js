import { getKey } from "../encryption";
import { NotelixChromeStorageKey } from "../popup/consts";
import client from "./client";

export async function trySetEdgeSyncParams() {
  chrome.storage.sync.get(NotelixChromeStorageKey, async (value) => {
    const server = value[NotelixChromeStorageKey].notelixServer;

    const serverUrl = server.replace(/\/$/, "");
    const clientSideEncryptionKey = await getKey();
    client.post(
      "http://127.0.0.1:18565/edgesync/set",
      {
        config: {
          enabled: true,
          url: serverUrl,
          token: value[NotelixChromeStorageKey].notelixUser.jwt,
          clientSideEncryptionKey: clientSideEncryptionKey,
        },
      },
      {}
    );
  });
}
