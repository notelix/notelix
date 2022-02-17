module.exports = {
  ...require("./webpack.config"),
  entry: "./src/app.index.js",
  output: {
    filename: "app.dist.js",
  },
};
