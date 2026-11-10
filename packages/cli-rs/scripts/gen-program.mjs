// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Dump the JS CLI's assembled Commander program as JSON, for the Rust
 * shell to embed: every command, argument and option, the help text that
 * follows each command's option list, and the manifest facts each CommandDoc
 * carries.
 *
 * The run prefix (`pnpm exec astryx`, ...) is written as U+0001, so the shell
 * fills in the run's own prefix; U+0002 where the JS CLI computes it while
 * assembling the program, before the project's integrations load. Text that depends on the package manager
 * (doc command tokens) is recorded once per doc package manager.
 *
 * Usage: [ASTRYX_JS_CLI=<packages/cli>] node scripts/gen-program.mjs [--check]
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const crateDir = path.join(here, '..');
// The JS CLI to read; it needs its dependencies installed. ASTRYX_JS_CLI
// points at an installed checkout's packages/cli when this one has none.
const cliDir = process.env.ASTRYX_JS_CLI ?? path.join(crateDir, '..', 'cli');
const outFile = path.join(crateDir, 'src', 'cli', 'program.json');
const STEM = '\u0001';
const EARLY_STEM = '\u0002';
const PMS = ['npm', 'pnpm', 'yarn', 'yarn-classic', 'bun'];

const imp = rel => import(pathToFileURL(path.join(cliDir, rel)).href);

// A neutral folder: the generator's own surroundings must not leak in.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-gen-'));
fs.writeFileSync(path.join(tmp, 'package.json'), '{"name":"gen"}\n');
process.chdir(tmp);

const {recordDeclaredCliCommands} = await imp('foundation/env/cli-command.mjs');
// Text built while the program is assembled runs before any project loads,
// so it never sees a declared cliCommand: mark it apart (U+0002).
recordDeclaredCliCommands(tmp, [{name: 'gen', cliCommand: EARLY_STEM}]);
const {runWithDocPackageManager} = await imp('foundation/env/package-manager.mjs');
const {createProgram, JSON_SUPPORTED, COMMAND_NAMES} = await imp('clients/cli/index.mjs');
const {commandDocsOf} = await imp('clients/cli/lib/define-command.mjs');
const {doc: manifestDoc} = await imp('clients/cli/commands/manifest.doc.mjs');

const programs = {};
for (const pm of PMS) {
  programs[pm] = await runWithDocPackageManager(pm, () => createProgram());
}

recordDeclaredCliCommands(tmp, [{name: 'gen', cliCommand: STEM}]);

/** Help text Commander writes after the options for `cmd`. */
function afterHelp(cmd, position) {
  let out = '';
  const context = {error: false, command: cmd, write: s => (out += s)};
  for (const listener of cmd.listeners(`${position}Help`)) listener(context);
  return out;
}

/** One value, or a map by package manager when it differs. */
function perPm(get) {
  const values = Object.fromEntries(PMS.map(pm => [pm, get(pm)]));
  const first = values[PMS[0]];
  return PMS.every(pm => JSON.stringify(values[pm]) === JSON.stringify(first))
    ? first
    : {byPm: values};
}

function walk(paths, fullName) {
  const cmd = paths.npm;
  const name = cmd.name();
  const docs = commandDocsOf(cmd) ?? (fullName === 'manifest' ? {doc: manifestDoc} : undefined);
  const node = {
    name,
    fullName,
    aliases: cmd.aliases(),
    description: perPm(pm => paths[pm].description() || ''),
    summary: cmd.summary() || '',
    hidden: Boolean(cmd._hidden),
    usage: cmd._usage ?? null,
    hasAction: cmd._actionHandler != null,
    allowUnknownOption: Boolean(cmd._allowUnknownOption),
    allowExcessArguments: cmd._allowExcessArguments !== false,
    args: cmd.registeredArguments.map((a, i) => ({
      name: a.name(),
      required: a.required === true,
      variadic: a.variadic === true,
      description: perPm(pm => paths[pm].registeredArguments[i].description || ''),
      defaultValue: a.defaultValue,
      choices: a.argChoices ?? null,
    })),
    options: cmd.options.map((o, i) => ({
      flags: o.flags,
      long: o.long ?? null,
      short: o.short ?? null,
      attributeName: o.attributeName(),
      description: perPm(pm => paths[pm].options[i].description || ''),
      required: Boolean(o.required),
      optional: Boolean(o.optional),
      variadic: Boolean(o.variadic),
      negate: Boolean(o.negate),
      mandatory: Boolean(o.mandatory),
      hidden: Boolean(o.hidden),
      defaultValue: o.defaultValue,
      defaultValueDescription: o.defaultValueDescription ?? null,
      choices: o.argChoices ?? null,
      collect: o.parseArg != null && !o.argChoices,
    })),
    beforeHelp: perPm(pm => afterHelp(paths[pm], 'before')),
    afterHelp: perPm(pm => afterHelp(paths[pm], 'after')),
    json: JSON_SUPPORTED.has(fullName),
    responseTypes: (docs?.fn?.returns ?? []).map(r => r.type),
    examples: (docs?.doc.examples ?? []).map(e => e.cli),
    exitCodes: (docs?.doc.exitCodes ?? []).map(({code, when}) => ({code, when})),
    outsideProject: docs?.doc.outsideProject ?? null,
    commands: cmd.commands.map((sub, i) =>
      walk(
        Object.fromEntries(PMS.map(pm => [pm, paths[pm].commands[i]])),
        fullName ? `${fullName} ${sub.name()}` : sub.name(),
      ),
    ),
  };
  if (!fullName) {
    const help = cmd._getHelpCommand();
    node.helpCommand = help ? {name: help.name(), description: help.description() || null} : null;
    node.helpOption = {flags: cmd._helpFlags ?? null, description: cmd._helpDescription ?? null};
    node.version = cmd._version ?? null;
    node.versionOption = cmd._versionOptionName ?? null;
  }
  return node;
}

const tree = walk(programs, '');
const pkg = JSON.parse(fs.readFileSync(path.join(cliDir, 'package.json'), 'utf-8'));
const out = {
  generatedFrom: 'packages/cli (scripts/gen-program.mjs)',
  version: pkg.version,
  jsonSupported: [...JSON_SUPPORTED],
  commandNames: COMMAND_NAMES,
  program: tree,
};
const text = `${JSON.stringify(out, null, 1)}\n`;
fs.rmSync(tmp, {recursive: true, force: true});
if (process.argv.includes('--check')) {
  const current = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf-8') : '';
  if (current !== text) {
    console.error('program.json is stale: run node scripts/gen-program.mjs');
    process.exit(1);
  }
} else {
  fs.writeFileSync(outFile, text);
}
