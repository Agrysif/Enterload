const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = (env = {}) => {
  const isDev = !!env.development;
  return {
    mode: isDev ? 'development' : 'production',
    // The renderer runs without Node.js access — everything goes through the preload bridge
    target: 'web',
    // eval-based source maps would require 'unsafe-eval' in the CSP
    devtool: isDev ? 'cheap-module-source-map' : false,
    entry: './src/renderer/index.jsx',
    output: {
      path: path.resolve(__dirname, 'dist'),
      // content hash keeps a stale cached bundle from being reused after an update
      filename: isDev ? 'renderer.bundle.js' : 'renderer.[contenthash:8].js',
      // relative paths so the bundle loads from file:// in the packaged app
      publicPath: isDev ? '/' : './',
      clean: !isDev,
    },
    resolve: {
      extensions: ['.js', '.jsx'],
    },
    module: {
      rules: [
        {
          test: /\.jsx?$/,
          exclude: /node_modules/,
          use: 'babel-loader',
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader'],
        },
        {
          test: /\.(png|jpe?g|gif|svg|ico)$/,
          type: 'asset/resource',
        },
        {
          test: /\.(woff2?|ttf)$/,
          type: 'asset/resource',
          generator: { filename: 'fonts/[name].[contenthash:8][ext]' },
        },
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: 'public/index.html',
        favicon: 'icon.svg',
      }),
    ],
    performance: { hints: false },
    devServer: {
      static: {
        directory: path.resolve(__dirname, 'public'),
        publicPath: '/',
        watch: true,
      },
      port: 3001,
      hot: true,
      historyApiFallback: true,
      open: false,
    },
  };
};
