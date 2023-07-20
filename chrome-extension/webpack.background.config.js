module.exports = {
    ...require("./webpack.config"),
    entry: "./src/background.index.js",
    output: {
        filename: "background.dist.js",
    },
};
