// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file @astryxdesign/core postinstall — nudge to run `astryx init`, prefixed
 * the way the project's installed CLI prints commands.
 *
 * Enforcement layer 1 of making `astryx init` foolproof: when the design system
 * is installed and the project hasn't run init yet, print a one-line next-step
 * so agents/humans discover it (this is the most common fresh-install entry).
 *
 * ONE authoritative source. Core is a separate package and cannot import the CLI
 * (the CLI peer-depends on core, so importing it would be a cycle), so it ships
 * ./agent-doc-state.mjs — a GENERATED, byte-for-byte copy of the CLI's
 * dependency-free leaf packages/cli/foundation/agent-docs/agent-doc-state.mjs.
 * `pnpm check:setup-contract` (inside `pnpm check:repo`) fails the build if the
 * two differ, and also fails if core stops publishing the copy. The paths,
 * markers, predicate and nudge decision therefore cannot drift between layers.
 *
 * Non-interactive, never fails the install, and quiet in the monorepo build,
 * during npx's fetch, and once set up.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const HERE = fileURLToPath(import.meta.url);

/**
 * Load the generated contract copy. Dynamic, not static, so a packaging mistake
 * degrades to "no nudge" instead of throwing out of module evaluation and
 * failing a consumer's install — the one thing this script must never do.
 * @returns {Promise<object|null>}
 */
async function loadContract() {
  try {
    return await import('./agent-doc-state.mjs');
  } catch {
    return null;
  }
}

/**
 * The stem the project's installed CLI would print, from its picker
 * (`getCliInvocation`). Core cannot depend on the CLI, so this looks for an
 * installed copy from the project upward and imports the picker by path; with
 * no CLI there, or one too old to have the picker, it returns undefined and
 * the contract's scoped fallback is printed. At install time no integration is
 * loaded, so this is the package-manager guess.
 * @param {string} root
 * @returns {Promise<string | undefined>}
 */
export async function cliInvocation(root) {
  try {
    let dir = path.resolve(root);
    for (;;) {
      const picker = path.join(
        dir,
        'node_modules/@astryxdesign/cli/foundation/env/package-manager.mjs',
      );
      if (fs.existsSync(picker)) {
        const {getCliInvocation} = await import(pathToFileURL(picker).href);
        return typeof getCliInvocation === 'function'
          ? getCliInvocation(root)
          : undefined;
      }
      const parent = path.dirname(dir);
      if (parent === dir) return undefined;
      dir = parent;
    }
  } catch {
    return undefined;
  }
}

async function main() {
  const contract = await loadContract();
  if (!contract) return;
  const root = process.env.INIT_CWD || process.cwd();
  if (
    contract.shouldNudge({
      scriptPath: HERE,
      npmCommand: process.env.npm_command,
      isSetUp: contract.isAstryxPromptInReach(root),
    })
  ) {
    const invocation = await cliInvocation(root);
    process.stdout.write(
      typeof contract.setupNudge === 'function'
        ? contract.setupNudge(invocation)
        : contract.SETUP_NUDGE,
    );
  }
}

// Run only when executed directly (`node scripts/postinstall.mjs`), never when
// imported by tests.
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main()
    .catch(() => {}) // never break an install
    .finally(() => process.exit(0));
}
