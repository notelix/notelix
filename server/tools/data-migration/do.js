import fs from 'fs';
import CryptoJS from 'crypto-js';

const emptyIV = { words: [0, 0, 0, 0], sigBytes: 16 };

const config = JSON.parse(
  fs.readFileSync('./config.json', { encoding: 'utf8' }),
);
const userBefore = JSON.parse(
  fs.readFileSync('./user_before.json', { encoding: 'utf8' }),
);
const userAfter = JSON.parse(
  fs.readFileSync('./user_after.json', { encoding: 'utf8' }),
);
const annotations = JSON.parse(
  fs.readFileSync('./annotations.json', { encoding: 'utf8' }),
);
const decryptKey = (client_side_encryption) => {
  const key = JSON.parse(
    CryptoJS.AES.decrypt(client_side_encryption, config.password).toString(
      CryptoJS.enc.Utf8,
    ),
  ).key;

  if (!key) {
    throw 'failed to decrypt key';
  }

  return CryptoJS.enc.Hex.parse(key);
};

const keyBefore = decryptKey(userBefore.client_side_encryption);
const keyAfter = decryptKey(userAfter.client_side_encryption);

annotations.forEach((a) => {
  for (let field of ['url']) {
    a[field] = CryptoJS.AES.encrypt(
      CryptoJS.AES.decrypt(a[field], keyBefore, {
        iv: emptyIV,
      }).toString(CryptoJS.enc.Utf8),
      keyAfter,
      {
        iv: emptyIV,
      },
    ).toString();
  }
  a.data = (() => {
    const data = JSON.parse(a.data);
    for (let field of ['text', 'textBefore', 'textAfter', 'notes']) {
      data[field] = CryptoJS.AES.decrypt(data[field], keyBefore, {
        iv: emptyIV,
      }).toString(CryptoJS.enc.Utf8);
    }
    if (data.notes) {
      data.notes = JSON.parse(data.notes)[0].text;
    }
    for (let field of ['text', 'textBefore', 'textAfter', 'notes']) {
      if (!data[field]) {
        continue;
      }
      data[field] = CryptoJS.AES.encrypt(data[field], keyAfter, {
        iv: CryptoJS.enc.Utf8.parse(a.uid),
      }).toString();
    }
    if (data.notes) {
      console.log(a.url);
    }
    return JSON.stringify(data);
  })();
});

const sqlKeys = ['uid', 'url', 'data'];
// console.log(`DELETE from annotation where "userId"=${userAfter.id};`);
// console.log(
//   `DELETE from annotation_change_history where "userId"=${userAfter.id};`,
// );

// console.log(
//   annotations
//     .map(
//       // language=SQL format=false
//       (a) =>
//         `INSERT into annotation (${sqlKeys.join(
//           ',',
//         )}, "userId") values (${sqlKeys
//           .map((key) => "'" + a[key].replace(/'/g, `\\'`) + "'")
//           .join(', ')}, ${userAfter.id});`,
//     )
//     .join('\n'),
// );
