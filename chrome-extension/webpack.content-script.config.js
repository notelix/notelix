module.exports = {
  ...require("./webpack.config"),
  entry: "./src/content-script.index.js",
  output: {
    filename: "content-script.dist.js",
  },
};
