module.exports = {
    mode: "production",
    devServer: {
        inline: true,
        port: 7777,
    },
    resolve: {
        extensions: [".js", ".jsx", ".ts", ".tsx"],
    },
    plugins: [],
    module: {
        rules: [
            {
                test: /\.svg$/,
                use: [{loader: "svg-inline-loader"}],
            },
            {
                test: /\.less$/,
                use: [
                    {
                        loader: "style-loader",
                    },
                    {
                        loader: "css-loader",
                    },
                    {
                        loader: "less-loader",
                        options: {
                            lessOptions: {
                                strictMath: true,
                            },
                        },
                    },
                ],
            },
            {
                test: /\.js[x]?$/,
                exclude: /node_modules/,
                use: {
                    loader: "babel-loader",
                    options: {
                        presets: ["@babel/preset-env", "@babel/preset-react"],
                        plugins: [["@babel/plugin-transform-runtime"]],
                    },
                },
            },
            {
                test: /\.ts[x]?$/,
                exclude: /node_modules/,
                use: {
                    loader: "ts-loader",
                },
            },
            {
                test: /\.css$/,
                loader: [
                    {
                        loader: "style-loader",
                    },
                    {
                        loader: "css-loader",
                    },
                ],
            },
            {test: /\.(png|jpg|gif)$/, loader: "url?limit=12288"},
        ],
    },
    node: {},
};
