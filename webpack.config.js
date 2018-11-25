const path = require('path');
const marked = require('marked');

const renderer = new marked.Renderer();

const BUILD_DIR = path.resolve(__dirname, 'www/assets/js');
const APP_DIR = path.resolve(__dirname, 'src/js/renderer');

const config = {
  mode: 'development',
  entry: {
    index: `${APP_DIR}/desktop_index.js`,
    markdown: `${APP_DIR}/markdown.js`,
    overlay: `${APP_DIR}/overlay.js`,
    viewer: `${APP_DIR}/viewer.js`,
  },
  output: {
    path: BUILD_DIR,
    filename: '[name].js',
  },
  module: {
    rules: [
      {
        test: /\.jsx?$/,
        include: APP_DIR,
        exclude: /node_modules/,
        use: 'babel-loader',
      },
      {
        test: /\.md$/,
        use: [
          {
            loader: 'html-loader',
          },
          {
            loader: 'markdown-loader',
            options: {
              renderer,
            },
          },
        ],
      },
    ],
  },
  resolve: {
    extensions: ['.js', '.jsx'],
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
  stats: 'minimal',
};

module.exports = config;
