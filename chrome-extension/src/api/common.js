import iziToast from "izitoast/dist/js/iziToast.min";
import "izitoast/dist/css/iziToast.min.css";
import { NotelixDefaultServer } from "../popup/consts";
import get from "lodash/get";
import { sendChromeCommandToEveryTab } from "../utils/chromeCommand";
import { COMMAND_REFRESH_ANNOTATIONS } from "../consts";
import {
  clearEncryptionKey,
  clearLegacyPassword,
  clientSideEncryptionEnabled,
} from "../encryption";
import {
  clearUser,
  getServer as getStoredServer,
  getUser,
} from "../storage";

export async function getEndpoint(
  path,
  { involvesClientSideEncryption = false } = {
    involvesClientSideEncryption: false,
  }
) {
  if (involvesClientSideEncryption) {
    const enabled = await clientSideEncryptionEnabled();
    if (enabled) {
      return new Promise((resolve) => {
        resolve(`http://127.0.0.1:18565/${path}`);
      });
    }
  }

  return new Promise((resolve) => {
    getServer().then((server) => {
      resolve(`${server.replace(/\/$/, "")}/${path}`);
    });
  });
}

export const getHeaders = async (requireLoggedIn = false) => {
  if (window.NotelixEmbeddedConfig) {
    return Promise.resolve({
      Authorization: `static-token ${window.NotelixEmbeddedConfig.staticToken}`,
    });
  }

  const headers = {};
  const user = await getUser();
  if (user) {
    headers.Authorization = `jwt ${user.jwt}`;
  } else if (requireLoggedIn) {
    iziToast.warning({
      message: `notelix: Please login first, by clicking on the Notelix extension in the top-right corner of the Chrome window`,
      position: "topRight",
    });
    throw new Error("not logged in");
  }
  return headers;
};

export async function getServer() {
  if (window.NotelixEmbeddedConfig) {
    return window.NotelixEmbeddedConfig.server;
  }
  return (await getStoredServer()) || NotelixDefaultServer;
}

export function onRequestError(err) {
  setTimeout(async () => {
    if (err.toString() === "Error: Extension context invalidated.") {
      iziToast.warning({
        message: `notelix: Please refresh the page before using this plugin`,
        position: "topRight",
      });
    } else {
      if (get(err, "response.data.clearClientCredentials")) {
        iziToast.error({
          message: `notelix: login expired, please login again`,
          position: "topRight",
        });

        await clearEncryptionKey();
        await clearLegacyPassword();
        await clearUser();
        sendChromeCommandToEveryTab(COMMAND_REFRESH_ANNOTATIONS);
      } else {
        iziToast.error({
          message: `notelix: ${err.toString()}`,
          position: "topRight",
        });
      }
    }
  });
  throw err;
}

export function wrapRequestApi(callback, requireLoggedIn = false) {
  return getHeaders(requireLoggedIn)
    .then((headers) => callback({ headers }))
    .catch(onRequestError);
}

export function wrapRequestApiRequireLoggedIn(callback) {
  return wrapRequestApi(callback, true);
}
