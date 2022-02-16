class ApiClient {
  get(url) {
    return this.request({ method: "GET", url });
  }

  post(url, data = null, { headers } = {}) {
    return this.request({ method: "POST", url, data, headers });
  }

  request({ method, url, data = null, headers }) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { cmd: "apiCall", params: { method: method, url, data, headers } },
        function (response) {
          if (response.err) {
            reject(response.err);
          } else {
            resolve({ data: response.body });
          }
        }
      );
    });
  }
}

const client = new ApiClient();
export default client;
