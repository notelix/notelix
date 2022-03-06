// const BundleAnalyzerPlugin =
//   require("webpack-bundle-analyzer").BundleAnalyzerPlugin;

let conf = {
  ...require("./webpack.config"),
  entry: "./src/content-script.index.js",
  output: {
    filename: "content-script.dist.js",
  },
};

// conf.plugins.push(new BundleAnalyzerPlugin());
module.exports = conf;
