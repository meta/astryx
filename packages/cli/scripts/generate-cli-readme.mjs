// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Generate the drift-prone reference tables in packages/cli/README.md from
 * the sources of truth, so they can't fall out of sync again:
 *   - the Commands table    <- `astryx manifest --json` (the live command set)
 *   - the Error codes table <- the error-codes EnumDoc (== ERROR_CODES, enforced
 *                              by the docs drift harness)
 *
 * Content is written between `<!-- BEGIN GENERATED: <name> -->` and
 * `<!-- END GENERATED: <name> -->` markers. `--check` verifies the committed
 * README matches (CI gate); without it, the README is rewritten in place.
 *
 * @input astryx manifest + foundation/response/error-codes.doc.mjs
 * @output packages/cli/README.md (between generated markers)
 * @position packages/cli/scripts — README table generator
 *
 * Usage:
 *   node packages/cli/scripts/generate-cli-readme.mjs          # write
 *   node packages/cli/scripts/generate-cli-readme.mjs --check   # CI gate
 */

import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import prettier from 'prettier';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI_ROOT = path.resolve(HERE, '..');
const BIN = path.join(CLI_ROOT, 'clients/cli/bin/astryx.mjs');
const README = path.join(CLI_ROOT, 'README.md');

function getManifest() {
  const res = spawnSync('node', [BIN, 'manifest', '--json'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  // Report a CLI that failed to boot as itself. Without this, the parse below
  // turns it into "Unexpected end of JSON input", which says nothing useful
  // when this runs as a CI gate.
  if (res.error) throw res.error;
  if (res.status !== 0 || !res.stdout.trim()) {
    throw new Error(
      `\`astryx manifest --json\` failed (exit ${res.status}).\n${res.stderr}`,
    );
  }
  return JSON.parse(res.stdout).data;
}

/** @param {string} rel @returns {Promise<any>} */
async function loadDoc(rel) {
  const mod = await import(pathToFileURL(path.join(CLI_ROOT, rel)).href);
  return mod.doc ?? mod.docs;
}

/** @param {string[]} headers @param {string[][]} rows */
function table(headers, rows) {
  const esc = (/** @type {unknown} */ s) => String(s).replace(/\|/g, '\\|');
  const head = `| ${headers.join(' | ')} |`;
  const sep = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map(r => `| ${r.map(esc).join(' | ')} |`).join('\n');
  return [head, sep, body].join('\n');
}

/** @param {string} content @param {string} name @param {string} block */
function replaceBlock(content, name, block) {
  const begin = `<!-- BEGIN GENERATED: ${name} -->`;
  const end = `<!-- END GENERATED: ${name} -->`;
  const re = new RegExp(
    `${begin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
  );
  if (!re.test(content)) throw new Error(`README markers for "${name}" not found`);
  return content.replace(re, `${begin}\n\n${block}\n\n${end}`);
}

/**
 * A command's `outsideProject` value for the commands table. A group that
 * only holds subcommands declares none, so it shows its subcommands' value when
 * they agree, and `by subcommand` when they differ.
 * @param {any} command a manifest command
 * @returns {string}
 */
function outsideProject(command) {
  if (command.outsideProject) return `\`${command.outsideProject}\``;
  /** @type {Set<string>} */
  const values = new Set();
  const walk = (/** @type {any[]} */ subs) => {
    for (const sub of subs) {
      if (sub.outsideProject) values.add(sub.outsideProject);
      walk(sub.subcommands ?? []);
    }
  };
  walk(command.subcommands ?? []);
  return values.size === 1 ? `\`${[...values][0]}\`` : 'by subcommand';
}

async function build() {
  const manifest = getManifest();
  const commandRows = manifest.commands
    .filter((/** @type {any} */ c) => c.name !== 'manifest')
    .map((/** @type {any} */ c) => [`\`${c.name}\``, c.description, outsideProject(c)]);

  const errorCodes = await loadDoc('foundation/response/error-codes.doc.mjs');
  // Experimental codes are documented under `astryx docs cli/experimental`,
  // not in the stable table (spec:AST-017 FR27).
  const errorRows = errorCodes.members
    .filter((/** @type {any} */ m) => m.stability !== 'experimental')
    .map((/** @type {any} */ m) => [`\`${m.value}\``, m.description]);

  const responseTypes = await loadDoc(
    'foundation/response/response-types.doc.mjs',
  );
  // Experimental response types are documented under `astryx docs
  // cli/experimental`, not in the stable table (spec:AST-017 FR27).
  const rtRows = responseTypes.members
    .filter((/** @type {any} */ m) => m.stability !== 'experimental')
    .map((/** @type {any} */ m) => [`\`${m.value}\``, m.description]);

  let content = fs.readFileSync(README, 'utf8');
  content = replaceBlock(
    content,
    'commands',
    table(['Command', 'Description', 'Outside a project'], commandRows),
  );
  content = replaceBlock(content, 'error-codes', table(['Code', 'Meaning'], errorRows));
  content = replaceBlock(content, 'response-types', table(['Type', 'What `data` carries'], rtRows));

  // Format through the repo's prettier config so the generated tables match what
  // the commit hook (lint-staged prettier over *.md) would produce; otherwise
  // `--check` would flag the file as drifted right after a commit reformats it.
  const config = (await prettier.resolveConfig(README)) ?? {};
  return prettier.format(content, {...config, parser: 'markdown', filepath: README});
}

async function main() {
  const check = process.argv.includes('--check');
  const next = await build();
  const current = fs.readFileSync(README, 'utf8');
  if (check) {
    if (current !== next) {
      console.error(
        'README generated tables are out of date. Run: pnpm -F @astryxdesign/cli readme',
      );
      process.exit(1);
    }
    console.log('README generated tables are in sync.');
  } else {
    fs.writeFileSync(README, next);
    console.log('README generated tables written.');
  }
}

main();
