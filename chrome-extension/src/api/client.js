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
            reject(new RequestError(response.err));
          } else {
            if (response.status >= 400) {
              reject(
                new HttpError(response.status, {
                  data: response.body,
                })
              );
            } else {
              resolve({ data: response.body, statusCode: response.status });
            }
          }
        }
      );
    });
  }
}

class HttpError {
  statusCode;
  response;

  constructor(statusCode, response) {
    this.statusCode = statusCode;
    this.response = response;
  }

  getErrResponseMessage() {
    try {
      return " " + this.response.data.message;
    } catch (e) {
      return "";
    }
  }

  toString() {
    return `${this.statusCode}${this.getErrResponseMessage()}`;
  }
}

class RequestError {
  message;

  constructor(message) {
    this.message = message;
  }

  toString() {
    return `RequestError ${this.message}`;
  }
}

const client = new ApiClient();
export default client;
