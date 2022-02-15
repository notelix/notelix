import axios from "axios";

const getMetaVersion = (server) => {
  return axios.get(`${server}/meta/version`);
};

export { getMetaVersion };
