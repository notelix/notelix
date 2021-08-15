import AES from "crypto-js/aes";
import makeRandomHex from "../utils/makeRandomHex";

export function makeClientSideEncryptionParams(password, { key } = {}) {
  return AES.encrypt(
    JSON.stringify({ key: key || makeRandomHex(64) }),
    password
  ).toString();
}
