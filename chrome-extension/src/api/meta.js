import client from "./client";

const getMetaVersion = (server) => {
  return client.get(`${server}/meta/version`);
};

export { getMetaVersion };
