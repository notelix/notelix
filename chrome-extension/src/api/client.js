const localDemoAnnotations = new Map();

function localDemoResponse(url, data) {
  const path = new URL(url).pathname.replace(/\/+$/, "");
  if (path.endsWith("/annotations/queryByUrl")) {
    return {
      data: {
        list: [...localDemoAnnotations.values()].filter(
          (annotation) => annotation.url === data?.url,
        ),
      },
      statusCode: 200,
    };
  }
  if (path.endsWith("/annotations/save")) {
    localDemoAnnotations.set(data.uid, { ...data, id: data.id || data.uid });
    return { data: {}, statusCode: 200 };
  }
  if (path.endsWith("/annotations/delete")) {
    localDemoAnnotations.delete(data.uid);
    return { data: {}, statusCode: 200 };
  }
  throw new RequestError("unsupported local playground request");
}

class ApiClient {
  get(url) {
    return this.request({ method: "GET", url });
  }

  post(url, data = null, { headers } = {}) {
    return this.request({ method: "POST", url, data, headers });
  }

  request({ method, url, data = null, headers }) {
    if (window.NotelixEmbeddedConfig) {
      if (window.NotelixEmbeddedConfig.demoLocalOnly) {
        try {
          return Promise.resolve(localDemoResponse(url, data));
        } catch (error) {
          return Promise.reject(error);
        }
      }
      return new Promise((resolve, reject) => {
        fetch(url, {
          method: method,
          body: method === "GET" ? undefined : JSON.stringify(data),
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
        })
          .then(async (res) => {
            if (res.status >= 400) {
              reject(
                new HttpError(res.status, {
                  data: await res.json(),
                }),
              );
            } else {
              resolve({ data: await res.json(), statusCode: res.status });
            }
          })
          .catch((err) => {
            reject(new RequestError(err.toString()));
          });
      });
    }

    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { cmd: "apiCall", params: { method: method, url, data, headers } },
        function (response) {
          if (chrome.runtime.lastError) {
            reject(new RequestError(chrome.runtime.lastError.message));
            return;
          }
          if (!response) {
            reject(new RequestError("background request returned no response"));
            return;
          }
          if (response.err) {
            reject(new RequestError(response.err));
          } else {
            if (response.status >= 400) {
              reject(
                new HttpError(response.status, {
                  data: response.body,
                }),
              );
            } else {
              resolve({ data: response.body, statusCode: response.status });
            }
          }
        },
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
export { localDemoResponse };
