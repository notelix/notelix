function handleApiCall(request, sender, sendResponse) {
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
            const response = {status: res.status, body: await res.json()};
            sendResponse(response);
        })
        .catch((err) => {
            console.log("failed to do fetch", err);
            sendResponse({err: err.toString()});
        });
}

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    switch (request.cmd) {
        case "apiCall":
            handleApiCall(request, sender, sendResponse);
            break;
    }

    return true;
});
