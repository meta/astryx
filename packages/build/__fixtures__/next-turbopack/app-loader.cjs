// Copyright (c) Meta Platforms, Inc. and affiliates.

// Stands in for the app's own loaders: it logs each file it runs on, refuses
// Astryx source, and compiles StyleX when given the app's StyleX options.

const fs = require('fs');
const babel = require('@babel/core');
const ASTRYX = /[\\/](node_modules[\\/]@astryxdesign|core)[\\/]/;

module.exports = function appLoader(source) {
  const {name, ...stylex} = this.getOptions();
  if (ASTRYX.test(this.resourcePath)) {
    throw new Error(`An app rule reached Astryx source: ${this.resourcePath}`);
  }
  fs.appendFileSync('rules.log', `${name} ${this.resourcePath}\n`);
  if (name !== 'stylex') return source;
  const callback = this.async();
  babel
    .transformAsync(source, {
      filename: this.resourcePath,
      babelrc: false,
      configFile: false,
      parserOpts: {plugins: ['typescript', 'jsx']},
      plugins: [['@stylexjs/babel-plugin', stylex]],
    })
    .then(result => callback(null, result.code), callback);
};
