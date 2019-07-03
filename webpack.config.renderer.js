const path = require('path');
const marked = require('marked');

const renderer = new marked.Renderer();

const BUILD_DIR = path.resolve(__dirname, 'www/assets/js');
const APP_DIR = path.resolve(__dirname, 'src/js/renderer');

const config = {
  mode: 'development',
  devtool: 'source-map',
  target: 'electron-renderer',
  entry: {
    index: `${APP_DIR}/index.js`,
    /* markdown: `${APP_DIR}/markdown.js`,
    overlay: `${APP_DIR}/overlay.js`,
    viewer: `${APP_DIR}/viewer.js`, */
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
      { test: /\.(png|gif|jpg)$/i, loader: 'url-loader' },
    ],
  },
  resolve: {
    extensions: ['.js'],
  },
};

module.exports = config;
