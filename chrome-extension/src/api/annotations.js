import { getEndpoint, wrapRequestApiRequireLoggedIn } from "./common";
import { decryptFields, encryptFields, getKey } from "../encryption";
import CryptoJS from "crypto-js";
import client from "./client";

const saveAnnotation = (annotation) => {
  return wrapRequestApiRequireLoggedIn(({ headers }) =>
    getEndpoint("annotations/save").then(async (endpoint) => {
      annotation = await encryptFields(annotation, ["url"]);
      annotation.data = await encryptFields(annotation.data, [
        "text",
        "textAfter",
        "textBefore",
        "notes",
      ]);
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
      return encryptFields({ url }, ["url"]).then(({ url }) =>
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
              return getKey().then((key) => {
                const decryptionKey = key ? CryptoJS.enc.Hex.parse(key) : null;

                resolve(
                  Promise.all(
                    item.data.list.map(async (item) => {
                      item.data = await decryptFields({
                        decryptionKey: decryptionKey,
                        object: item.data,
                        fields: ["notes", "text", "textAfter", "textBefore"],
                      });

                      return decryptFields({
                        decryptionKey: decryptionKey,
                        object: item,
                        fields: ["url"],
                      });
                    })
                  )
                );
              });
            });
          })
      );
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
