#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Typechecks a package's TypeScript project in several smaller programs.
 * @input The package's tsconfig (`--project`, default `tsconfig.json`), run
 *   from the package folder, the number of test programs (`--shards`), and
 *   any tsc arguments after `--`.
 * @output One program for the source files, then one program per group of
 *   test files; exit 1 when any program reports an error.
 * @position A test program loads only the source its tests import, so each
 *   program holds part of the type graph that one program over every file
 *   holds at once. Every file the project includes is in at least one program.
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {splitByDuration} from './lib/duration-split.mjs';

/** Tests, browser specs and their fixtures: everything a test program holds. */
export function isTestFile(file) {
  return (
    /(?:^|\/)__tests__\//.test(file) || /\.(?:test|spec)\.tsx?$/.test(file)
  );
}

/**
 * The programs to run: the source files in one, then the test files split by
 * their top folder into `shards` groups of about the same size. A folder's
 * tests stay together, so a fixture that declares globals for its folder's
 * specs is in the same program as those specs. Every program also holds the
 * project's ambient declaration files (`*.d.ts`), which no file imports.
 * @param {string[]} files the project's files, relative to the package
 * @param {number} shards
 * @returns {string[][]}
 */
export function planPrograms(files, shards) {
  const sorted = [...files].sort();
  const ambient = sorted.filter(file => file.endsWith('.d.ts'));
  const source = sorted.filter(file => !isTestFile(file));
  /** @type {Map<string, string[]>} */
  const byFolder = new Map();
  for (const file of sorted.filter(isTestFile)) {
    const parts = file.split('/');
    const folder = parts.length > 2 ? parts.slice(0, 2).join('/') : parts[0];
    byFolder.set(folder, [...(byFolder.get(folder) ?? []), file]);
  }
  const legs = splitByDuration(
    [...byFolder.keys()],
    Math.max(1, shards),
    folder => byFolder.get(folder)?.length ?? 0,
  );
  return [
    source,
    ...legs
      .filter(folders => folders.length > 0)
      .map(folders => [
        ...new Set([
          ...ambient,
          ...folders.flatMap(folder => byFolder.get(folder) ?? []).sort(),
        ]),
      ]),
  ];
}

/**
 * The files a tsconfig includes, as TypeScript resolves them.
 * @param {typeof import('typescript')} ts
 * @param {string} project absolute path
 */
export function projectFiles(ts, project) {
  const config = ts.readConfigFile(project, ts.sys.readFile);
  if (config.error) {
    throw new Error(
      ts.flattenDiagnosticMessageText(config.error.messageText, '\n'),
    );
  }
  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    path.dirname(project),
  );
  return parsed.fileNames.map(file =>
    path.relative(path.dirname(project), file).split(path.sep).join('/'),
  );
}

function main() {
  const all = process.argv.slice(2);
  const split = all.indexOf('--');
  const argv = split === -1 ? all : all.slice(0, split);
  // Arguments after `--` go to every tsc run, such as --extendedDiagnostics.
  const extra = split === -1 ? [] : all.slice(split + 1);
  const value = (name, fallback) => {
    const at = argv.indexOf(name);
    return at === -1 ? fallback : argv[at + 1];
  };
  const cwd = process.cwd();
  const project = path.resolve(cwd, value('--project', 'tsconfig.json'));
  const shards = Number(value('--shards', '3'));
  if (!Number.isInteger(shards) || shards < 1) {
    console.error(
      `--shards must be a positive integer, got "${value('--shards')}"`,
    );
    process.exit(2);
  }
  const require = createRequire(path.join(cwd, 'package.json'));
  const ts = require('typescript');
  const tsc = require.resolve('typescript/bin/tsc');
  const programs = planPrograms(projectFiles(ts, project), shards);
  // Inside the package's node_modules: TypeScript finds the `types` the
  // project names by walking up from the config's folder.
  const cache = path.join(cwd, 'node_modules', '.cache');
  fs.mkdirSync(cache, {recursive: true});
  const dir = fs.mkdtempSync(path.join(cache, 'typecheck-sharded-'));
  let failed = false;
  try {
    programs.forEach((files, index) => {
      const label =
        index === 0 ? 'source' : `tests ${index}/${programs.length - 1}`;
      const config = path.join(dir, `tsconfig.${index}.json`);
      fs.writeFileSync(
        config,
        JSON.stringify({
          extends: project,
          compilerOptions: {noEmit: true},
          include: [],
          files: files.map(file => path.join(path.dirname(project), file)),
        }),
      );
      console.log(`typecheck ${label}: ${files.length} files`);
      const result = spawnSync(
        process.execPath,
        [tsc, '--project', config, ...extra],
        {
          stdio: 'inherit',
        },
      );
      if (result.status !== 0) failed = true;
    });
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
  process.exit(failed ? 1 : 0);
}

if (
  process.argv[1] &&
  fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main();
