function handleApiCall(request, sendResponse) {
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
  switch (request.cmd) {
    case "apiCall":
      handleApiCall(request, sendResponse);
      break;
  }
  return true;
});
