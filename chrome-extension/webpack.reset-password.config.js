module.exports = {
  ...require("./webpack.config"),
  entry: "./src/reset-password.index.js",
  output: {
    filename: "reset-password.dist.js",
  },
};
