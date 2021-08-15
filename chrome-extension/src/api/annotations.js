import axios from "axios";
import { getEndpoint, wrapRequestApiRequireLoggedIn } from "./common";
import {
  decryptFields,
  decryptKey,
  encryptFields,
  getKey,
} from "../encryption";
import { NotelixChromeStorageKey } from "../popup/consts";
import CryptoJS from "crypto-js";

// TODO: add typescript support and use typescript annotations to mark which field should be encrypted

const AnnotationEncryptedFields = [
  "notes",
  "originalText",
  "text",
  "textAfter",
  "textBefore",
  "url",
];

const saveAnnotation = (data) => {
  return wrapRequestApiRequireLoggedIn(({ headers }) =>
    getEndpoint("annotations/save").then((endpoint) =>
      encryptFields(data, AnnotationEncryptedFields).then((data) =>
        axios.post(endpoint, data, { headers: headers })
      )
    )
  );
};

const deleteAnnotation = ({ url, uid }) => {
  return wrapRequestApiRequireLoggedIn(({ headers }) =>
    getEndpoint("annotations/delete").then((endpoint) =>
      axios.post(
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
        axios
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

export { queryAnnotationsByUrl, saveAnnotation, deleteAnnotation };