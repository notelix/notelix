import { getServer } from "./storage";
import { NotelixDefaultServer } from "./popup/consts";
import { isApiRequestAllowed } from "./apiRequestPolicy";

const rejectedRequestMessage = "background API request is not allowed";

async function handleApiCall(request, sender, sendResponse) {
  try {
    const configuredServer = (await getServer()) || NotelixDefaultServer;
    const allowServerProbe = sender.url?.startsWith(chrome.runtime.getURL(""));
    if (
      sender.id !== chrome.runtime.id ||
      !isApiRequestAllowed(request.params, configuredServer, {
        allowServerProbe,
      })
    ) {
      sendResponse({ err: rejectedRequestMessage });
      return;
    }
  } catch (_error) {
    sendResponse({ err: rejectedRequestMessage });
    return;
  }

  fetch(request.params.url, {
    method: request.params.method,
    body:
      request.params.method === "GET"
        ? undefined
        : JSON.stringify(request.params.data),
    headers: {
      ...request.params.headers,
      "Content-Type": "application/json",
    },
  })
    .then(async (res) => {
      const text = await res.text();
      let body = null;
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          body = text;
        }
      }
      const response = { status: res.status, body };
      sendResponse(response);
    })
    .catch((err) => {
      console.log("failed to do fetch", err);
      sendResponse({ err: err.toString() });
    });
}

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  switch (request?.cmd) {
    case "apiCall":
      handleApiCall(request, sender, sendResponse);
      return true;
    default:
      return false;
  }
});
