// Copyright (c) Meta Platforms, Inc. and affiliates.

module.exports = {
  plugins: {
    // Astryx, compiled from the source the app reaches (`@astryx;`).
    '@astryxdesign/build/next/postcss': {},
    // The app's own StyleX (`@stylex;`).
    '@stylexjs/postcss-plugin': {
      include: ['src/**/*.tsx'],
      babelConfig: {
        babelrc: false,
        parserOpts: {plugins: ['typescript', 'jsx']},
        plugins: [['@stylexjs/babel-plugin', require('./app-stylex.cjs')]],
      },
    },
  },
};
