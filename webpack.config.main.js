const path = require('path');

const BUILD_DIR = path.resolve(__dirname, 'www/main');
const APP_DIR = path.resolve(__dirname, 'src/js/main');

const config = {
  mode: 'development',
  target: 'electron-main',
  entry: {
    app: `${APP_DIR}/app.js`,
  },
  output: {
    path: BUILD_DIR,
    filename: '[name].js',
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        include: APP_DIR,
        exclude: /node_modules/,
        use: 'babel-loader',
      },
      { test: /\.html$/i, loader: 'url-loader' },
    ],
  },
  node: {
    __dirname: false,
  },
  resolve: {
    extensions: ['.js'],
  },
  externals: {
    electron: "require('electron')",
    'electron-chromecast': "require('electron-chromecast')",
    extract: "require('extract-zip')",
    fs: "require('fs')",
    realm: "require('realm')",
    request: "require('request')",
    sqlite3: "require('sqlite3')",
  },
};

module.exports = config;
