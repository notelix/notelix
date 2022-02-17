import { getEndpoint, wrapRequestApiRequireLoggedIn } from "./common";
import { decryptFields, encryptFields, getKey } from "../encryption";
import CryptoJS from "crypto-js";
import client from "./client";

// TODO: add typescript support and use typescript annotations to mark which field should be encrypted

const AnnotationEncryptedFields = [
  "notes",
  "text",
  "textAfter",
  "textBefore",
  "url",
];

const saveAnnotation = (data) => {
  return wrapRequestApiRequireLoggedIn(({ headers }) =>
    getEndpoint("annotations/save").then((endpoint) =>
      encryptFields(data, AnnotationEncryptedFields).then((data) =>
        client.post(endpoint, data, { headers: headers })
      )
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
      return encryptFields({ url }, AnnotationEncryptedFields).then(({ url }) =>
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
                resolve(
                  Promise.all(
                    item.data.list.map((x) =>
                      decryptFields({
                        decryptionKey: key ? CryptoJS.enc.Hex.parse(key) : null,
                        object: { ...x, ...x.data },
                        fields: AnnotationEncryptedFields,
                      })
                    )
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
