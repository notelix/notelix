import { getKey } from "../encryption";
import client from "./client";
import sleep from "../utils/sleep";
import { getServer, getUser } from "../storage";
import { NotelixDefaultServer } from "../popup/consts";
import { resetAgentData } from "./agentControl";

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
  try {
    const user = await getUser();
    if (!user) {
      await resetAgentData();
      return;
    }

    const serverUrl = ((await getServer()) || NotelixDefaultServer).replace(
      /\/$/,
      ""
    );
    const clientSideEncryptionKey = await getKey();
    await client.post(
      "http://127.0.0.1:18565/agentsync/set",
      {
        config: {
          enabled: true,
          url: serverUrl,
          token: user.jwt,
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
  }
}
