// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file proof-imports.mjs
 * @description The files each interaction proof loads through its value
 *   imports, followed file by file (spec:AST-030 FR31).
 * @input The repository root, its listed files, and which of them are proofs.
 * @output A map from each loaded file to the proofs that load it. It throws
 *   when a proof or a file it loads cannot be read, so a caller runs every
 *   proof instead.
 * @position Unit tests, docs, records and accessibility specs in a component
 *   folder put nothing on a proof's page, so they select no proof, unless a
 *   proof imports one: the interaction scopes' contract and the Chromium
 *   selection read this map for that case.
 */

import fs from 'node:fs';
import path from 'node:path';

import {valueImports} from './a11y-pr-contracts.mjs';

const SUFFIXES = [
  '',
  '.ts',
  '.tsx',
  '.mts',
  '.js',
  '.jsx',
  '.mjs',
  '/index.ts',
  '/index.tsx',
  '/index.js',
];

/**
 * @param {{root: string, listed: string[], isProof: (file: string) => boolean}} options
 * @returns {Map<string, Set<string>>}
 */
export function proofImporters({root, listed, isProof}) {
  const known = new Set(listed);
  const resolve = target => {
    for (const suffix of SUFFIXES)
      if (known.has(`${target}${suffix}`)) return `${target}${suffix}`;
    return null;
  };
  const targetOf = (file, specifier) => {
    if (specifier.startsWith('.'))
      return resolve(
        path.posix.normalize(`${path.posix.dirname(file)}/${specifier}`),
      );
    const match = /^@astryxdesign\/([^/]+)\/(.+)$/.exec(specifier);
    return match ? resolve(`packages/${match[1]}/src/${match[2]}`) : null;
  };
  const importers = new Map();
  for (const proof of listed.filter(isProof)) {
    const seen = new Set([proof]);
    const queue = [proof];
    while (queue.length > 0) {
      const file = queue.pop();
      const text = fs.readFileSync(path.join(root, file), 'utf8');
      for (const {specifier} of valueImports(text)) {
        const target = targetOf(file, specifier);
        if (target == null || seen.has(target)) continue;
        seen.add(target);
        queue.push(target);
        if (!importers.has(target)) importers.set(target, new Set());
        importers.get(target).add(proof);
      }
    }
  }
  return importers;
}
