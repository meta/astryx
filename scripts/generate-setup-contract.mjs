#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Generate (and verify) core's package-local copy of the agent-doc setup
 * contract.
 *
 * ONE authoritative source, two published packages. `@astryxdesign/core` cannot
 * import `@astryxdesign/cli` — the CLI peer-depends on core, so the import would
 * be a cycle — yet core's postinstall (enforcement layer 1) must answer
 * "is Astryx set up?" exactly as the CLI does (layers 2 and 3). Hand-mirroring
 * the paths, markers and predicate is what let the two drift.
 *
 * So the CLI's dependency-free leaf is copied here VERBATIM, with a generated
 * banner, into a file core ships in its own tarball:
 *
 *   source -> packages/cli/foundation/agent-docs/agent-doc-state.mjs
 *   target -> packages/core/scripts/agent-doc-state.mjs
 *
 * Because the copy is byte-for-byte, drift is not "checked" heuristically, it is
 * impossible: `--check` compares bytes and fails the build.
 *
 * Usage:
 *   node scripts/generate-setup-contract.mjs            # write the copy
 *   node scripts/generate-setup-contract.mjs --check    # verify, exit 1 on drift
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const CLI_SOURCE_REL =
  'packages/cli/foundation/agent-docs/agent-doc-state.mjs';
export const CORE_TARGET_REL = 'packages/core/scripts/agent-doc-state.mjs';

export const CLI_SOURCE = path.join(ROOT, CLI_SOURCE_REL);
export const CORE_TARGET = path.join(ROOT, CORE_TARGET_REL);

const COPYRIGHT = '// Copyright (c) Meta Platforms, Inc. and affiliates.\n';

const BANNER = `
// GENERATED FILE — DO NOT EDIT.
// Source:     ${CLI_SOURCE_REL}
// Regenerate: pnpm generate:setup-contract
//
// @astryxdesign/core cannot import @astryxdesign/cli (the CLI peer-depends on
// core, so the import would be a cycle), but core's postinstall must answer
// "is Astryx set up?" exactly as the CLI does. The CLI's dependency-free leaf is
// therefore copied here verbatim and pinned by \`pnpm check:setup-contract\`,
// which runs inside \`pnpm check:repo\`.
`;

/**
 * The exact bytes core's copy must contain.
 * @returns {string}
 */
export function renderCoreCopy() {
  const source = fs.readFileSync(CLI_SOURCE, 'utf-8');
  if (!source.startsWith(COPYRIGHT)) {
    throw new Error(
      `${CLI_SOURCE_REL} must start with the copyright header so the generated copy keeps it first.`,
    );
  }
  return COPYRIGHT + BANNER + source.slice(COPYRIGHT.length);
}

/**
 * core must PUBLISH the generated copy, or its postinstall silently loses the
 * setup check in every consumer install. Cheap to assert, expensive to miss.
 * @returns {string|null} An error message, or null when the packaging is right.
 */
export function checkCorePackaging() {
  const pkgPath = path.join(ROOT, 'packages/core/package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  const needed = CORE_TARGET_REL.replace('packages/core/', '');
  const files = pkg.files || [];
  return files.includes(needed)
    ? null
    : `packages/core/package.json "files" must list "${needed}" so the generated copy ships in the tarball.`;
}

function main() {
  const check = process.argv.includes('--check');
  const expected = renderCoreCopy();

  if (!check) {
    fs.mkdirSync(path.dirname(CORE_TARGET), {recursive: true});
    fs.writeFileSync(CORE_TARGET, expected);
    process.stdout.write(`Wrote ${CORE_TARGET_REL}\n`);
    return 0;
  }

  const actual = fs.existsSync(CORE_TARGET)
    ? fs.readFileSync(CORE_TARGET, 'utf-8')
    : null;

  if (actual !== expected) {
    process.stderr.write(
      `\nSetup contract out of sync.\n` +
        `  source: ${CLI_SOURCE_REL}\n` +
        `  target: ${CORE_TARGET_REL}\n` +
        (actual === null ? '  target is missing.\n' : '  target differs.\n') +
        `Edit ONLY the source, then run: pnpm generate:setup-contract\n\n`,
    );
    return 1;
  }

  const packagingError = checkCorePackaging();
  if (packagingError) {
    process.stderr.write(`\n${packagingError}\n\n`);
    return 1;
  }

  process.stdout.write('Setup contract in sync.\n');
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  process.exit(main());
}
