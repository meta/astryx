// Copyright (c) Meta Platforms, Inc. and affiliates.

// An app with its own StyleX setup three ways. It has a Babel config, a
// `*.tsx` rule list that also matches Astryx source, and StyleX's PostCSS
// plugin.
import {createRequire} from 'node:module';
import {withAstryx} from '@astryxdesign/build/next';

const require = createRequire(import.meta.url);
const loader = require.resolve('./app-loader.cjs');
const stylex = {name: 'stylex', ...require('./app-stylex.cjs')};

// Bare loaders mixed with a rule object, each logging where it runs.
const rules = {
  '*.tsx': [
    {loader, options: {name: 'a'}},
    {loaders: [{loader, options: stylex}], as: '*'},
    {loader, options: {name: 'b'}},
  ],
};

export default withAstryx({
  typescript: {ignoreBuildErrors: true},
  turbopack: {rules},
});
