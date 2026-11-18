#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Writes clients/cli/commands.generated.json at `prepack`: each command
 * the root help lists, with the term and description it prints for it, read
 * from the fully loaded program. The published package then prints its root
 * help without loading every command. The file is not committed; a checkout
 * without it loads every command, with the same help.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {COMMAND_LIST_FILE, createProgram} from '../clients/cli/index.mjs';

/**
 * The file's text: the root help's rows, in the order it prints them.
 * @returns {Promise<string>}
 */
export async function commandListText() {
  const program = await createProgram();
  const help = program.createHelp();
  const rows = help.visibleCommands(program).map(cmd => ({
    name: cmd.name(),
    term: help.subcommandTerm(cmd),
    description: help.subcommandDescription(cmd),
  }));
  return JSON.stringify(rows) + '\n';
}

const isMain =
  Boolean(process.argv[1]) &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain && process.argv.includes('--clean')) {
  // `postpack`: the checkout goes back to loading every command for help, so
  // a command added or changed later shows there.
  fs.rmSync(COMMAND_LIST_FILE, {force: true});
} else if (isMain) {
  fs.writeFileSync(COMMAND_LIST_FILE, await commandListText());
  console.log(`Wrote ${path.relative(process.cwd(), COMMAND_LIST_FILE)}.`);
}
