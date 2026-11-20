// Copyright (c) Meta Platforms, Inc. and affiliates.

module.exports = {
  presets: ['next/babel'],
  plugins: [['@stylexjs/babel-plugin', require('./app-stylex.cjs')]],
};
