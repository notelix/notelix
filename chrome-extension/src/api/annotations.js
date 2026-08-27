import { getEndpoint, wrapRequestApiRequireLoggedIn } from "./common";
import { decryptFields, encryptFields, getKey } from "../encryption";
import CryptoJS from "crypto-js";
import client from "./client";

const saveAnnotation = (annotation) => {
  return wrapRequestApiRequireLoggedIn(({ headers }) =>
    getEndpoint("annotations/save").then(async (endpoint) => {
      const key = await getKey();
      const parsedKey = key ? CryptoJS.enc.Hex.parse(key) : null;
      const payload = {
        uid: annotation.uid,
        ...(annotation.url === undefined ? {} : { url: annotation.url }),
        ...(annotation.host === undefined ? {} : { host: annotation.host }),
        ...(annotation.title === undefined ? {} : { title: annotation.title }),
        ...(annotation.data === undefined ? {} : { data: annotation.data }),
      };

      const encryptedAnnotation = await encryptFields({
        key: parsedKey,
        object: payload,
        fields: ["url", "host", "title"],
      });
      encryptedAnnotation.data = await encryptFields({
        key: parsedKey,
        object: encryptedAnnotation.data,
        fields: ["text", "textAfter", "textBefore", "notes"],
        iv: encryptedAnnotation.uid,
      });

      return client.post(endpoint, encryptedAnnotation, { headers: headers });
    })
  );
};

const deleteAnnotation = ({ uid }) => {
  return wrapRequestApiRequireLoggedIn(({ headers }) =>
    getEndpoint("annotations/delete").then((endpoint) =>
      client.post(
        endpoint,
        {
          uid,
        },
        { headers: headers }
      )
    )
  );
};

const queryAnnotationsByUrl = (url, { onDataReceivedCallback }) => {
  return wrapRequestApiRequireLoggedIn(({ headers }) =>
    getEndpoint("annotations/queryByUrl").then((endpoint) => {
      onDataReceivedCallback();
      return getKey().then((key) => {
        const parsedKey = key ? CryptoJS.enc.Hex.parse(key) : null;

        return encryptFields({
          key: parsedKey,
          object: { url },
          fields: ["url"],
        }).then(({ url }) =>
          client
            .post(
              endpoint,
              {
                url,
              },
              { headers: headers }
            )
            .then((item) => {
              return new Promise((resolve) => {
                resolve(
                  Promise.all(
                    item.data.list.map(async (item) => {
                      item.data = await decryptFields({
                        key: parsedKey,
                        object: item.data,
                        fields: ["notes", "text", "textAfter", "textBefore"],
                        iv: item.uid,
                      });

                      return decryptFields({
                        key: parsedKey,
                        object: item,
                        fields: ["url"],
                      });
                    })
                  )
                );
              });
            })
        );
      });
    })
  );
};

const search = (q) => {
  return wrapRequestApiRequireLoggedIn(({ headers }) =>
    getEndpoint("annotations/search", {
      involvesClientSideEncryption: true,
    }).then((endpoint) =>
      client.post(
        endpoint,
        {
          q,
        },
        { headers: headers }
      )
    )
  );
};

const findAnnotations = (params = { selectors: {}, groupBy: "" }) => {
  const { selectors, groupBy } = params;

  return wrapRequestApiRequireLoggedIn(({ headers }) =>
    getEndpoint("annotations/find", {
      involvesClientSideEncryption: true,
    }).then((endpoint) =>
      client.post(
        endpoint,
        {
          selectors,
          groupBy,
        },
        { headers: headers }
      )
    )
  );
};

export {
  queryAnnotationsByUrl,
  saveAnnotation,
  deleteAnnotation,
  search,
  findAnnotations,
};
