// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file scripts/core-docs.mjs
 * @input A core component name
 * @output That component's documentation, read from the installed core package
 * @position Build-time loader shared by the generator and the tests. Reads
 *   core's published documentation files as data (AST-082 FR16)
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const PACKAGE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
export const CORE_ROOT = path.join(
  PACKAGE_ROOT,
  'node_modules',
  '@astryxdesign',
  'core',
);

/**
 * @param {string} name A component name for `<Name>/<Name>.doc.mjs`, or a
 *   path such as `Text/Heading` relative to core's `src`.
 */
export async function loadCoreDoc(name) {
  const relative = name.includes('/') ? name : `${name}/${name}`;
  const file = path.join(CORE_ROOT, 'src', `${relative}.doc.mjs`);
  if (!fs.existsSync(file)) {
    throw new Error(
      `No core documentation for "${name}" at ${file}; run pnpm install`,
    );
  }
  const mod = await import(pathToFileURL(file).href);
  return mod.docs;
}

/** Core's built-in icon names, read from its icon registry source. */
export function readCoreIconNames() {
  const source = fs.readFileSync(
    path.join(CORE_ROOT, 'src', 'Icon', 'globalIconRegistry.tsx'),
    'utf8',
  );
  const union = /export type IconName =([\s\S]*?);/.exec(source);
  if (!union) throw new Error('Could not find the IconName union in core');
  return [...union[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
}
