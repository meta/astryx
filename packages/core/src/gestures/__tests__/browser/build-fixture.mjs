#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file build-fixture.mjs
 * @input fixture.ts beside this file
 * @output A standalone HTML page (the fixture bundled inline) for running the
 *   gesture proofs in any browser, including Mobile Safari on the iOS
 *   simulator
 * @position Test-only helper of packages/core/src/gestures
 *
 *   node packages/core/src/gestures/__tests__/browser/build-fixture.mjs out.html
 *
 * The page records every recognizer transition and every click on
 * `window.__gestures`; read it with the Web Inspector or by evaluating
 * `JSON.stringify(window.__gestures)`.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv[2];
if (out == null) {
  console.error('usage: build-fixture.mjs <out.html>');
  process.exit(1);
}
const result = await build({
  entryPoints: [path.join(here, 'fixture.ts')],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
});
const html = `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Gesture fixture</title>
<body></body>
<script>${result.outputFiles[0].text.replaceAll('</script', '<\\/script')}</script>
`;
fs.writeFileSync(out, html);
console.log(`wrote ${out} (${html.length} bytes)`);
