import { getEndpoint, wrapRequestApiRequireLoggedIn } from "./common";
import { decryptFields, encryptFields, getKey } from "../encryption";
import CryptoJS from "crypto-js";
import client from "./client";

const saveAnnotation = (annotation) => {
  return wrapRequestApiRequireLoggedIn(({ headers }) =>
    getEndpoint("annotations/save").then(async (endpoint) => {
      const key = await getKey();
      const parsedKey = key ? CryptoJS.enc.Hex.parse(key) : null;

      annotation = await encryptFields({
        key: parsedKey,
        object: annotation,
        fields: ["url", "title"],
      });
      annotation.data = await encryptFields({
        key: parsedKey,
        object: annotation.data,
        fields: ["text", "textAfter", "textBefore", "notes"],
        iv: annotation.uid,
      });

      return client.post(endpoint, annotation, { headers: headers });
    })
  );
};

const deleteAnnotation = ({ url, uid }) => {
  return wrapRequestApiRequireLoggedIn(({ headers }) =>
    getEndpoint("annotations/delete").then((endpoint) =>
      client.post(
        endpoint,
        {
          url,
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

export { queryAnnotationsByUrl, saveAnnotation, deleteAnnotation, search };
