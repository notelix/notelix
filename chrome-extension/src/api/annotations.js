import { getEndpoint, wrapRequestApiRequireLoggedIn } from "./common";
import { decryptFields, encryptFields, getKey } from "../encryption";
import CryptoJS from "crypto-js";
import client from "./client";

const saveAnnotation = (data) => {
  return wrapRequestApiRequireLoggedIn(({ headers }) =>
    getEndpoint("annotations/save").then((endpoint) =>
      encryptFields(data, [
        "notes",
        "text",
        "textAfter",
        "textBefore",
        "url",
      ]).then((data) => client.post(endpoint, data, { headers: headers }))
    )
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
