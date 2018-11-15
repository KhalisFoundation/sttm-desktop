const path = require('path');

const BUILD_DIR = path.resolve(__dirname, 'www/assets/js');
const APP_DIR = path.resolve(__dirname, 'src/js');

const config = {
  mode: 'development',
  entry: `${APP_DIR}/desktop_index.jsx`,
  output: {
    path: BUILD_DIR,
    filename: 'index.js',
  },
  module: {
    rules: [
      {
        test: /\.jsx?/,
        include: APP_DIR,
        exclude: /node_modules/,
        use: 'babel-loader',
      },
    ],
  },
  resolve: {
    extensions: ['.js', '.jsx'],
  },
};

module.exports = config;
