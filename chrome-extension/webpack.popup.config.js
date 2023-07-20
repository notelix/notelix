module.exports = {
    ...require("./webpack.config"),
    entry: "./src/popup.index.js",
    output: {
        filename: "popup.dist.js",
    },
};
