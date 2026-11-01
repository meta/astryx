// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The `astryx` commands on the computer's search path (spec AST-081
 * FR10, FR11): which program each one starts, in the order a shell tries
 * them, so `doctor`, `init --user`, and the update notices can tell the Astryx CLI
 * apart from another program and a release that predates the hand-off from
 * one that hands a project's run to the project's release.
 *
 * A command belongs to the Astryx CLI when its real file sits in the CLI
 * package (npm and Bun link it), or when it is a package manager's small shim
 * script that starts the CLI package's bin (npm on Windows, pnpm, Yarn); the
 * package folder is read from the shim's text.
 *
 * @input  the search path and, on Windows, its executable names
 * @output one row per `astryx` command found
 * @position packages/cli/foundation/env — read by doctor, init --user, and
 *   the update notices.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/** The CLI package whose bin the `astryx` command starts. */
const CLI_PACKAGE = '@astryxdesign/cli';

/** The bare command name. */
const COMMAND = 'astryx';

/** Shims are small; anything larger is a program, not a shim. */
const MAX_SHIM_BYTES = 64 * 1024;

/**
 * A CLI package folder named in a shim's text, with the shim's own folder
 * written as `$basedir` (sh), `%~dp0` or `%dp0%` (cmd), or `$PSScriptRoot`
 * (PowerShell).
 */
const SHIM_PACKAGE =
  /((?:\$basedir(?:_abs|_win)?|%~dp0|%dp0%|\$PSScriptRoot)?[^"'\s:;$%]*node_modules[\\/]@astryxdesign[\\/]cli)(?=[\\/"'])/gu;

/** The shim folder written in a shim's text, in each shell's spelling. */
const SHIM_BASE =
  /^(?:\$basedir(?:_abs|_win)?|%~dp0|%dp0%|\$PSScriptRoot)[\\/]?/u;

/**
 * The absolute target some package managers record in a shim's comment
 * (`# cmd-shim-target=<file>`).
 */
const SHIM_TARGET_LINE = /^\s*(?:#|@?rem|::)\s*cmd-shim-target=(.+?)\s*$/imu;

/**
 * @typedef {object} SearchPathCommand
 * @property {string} file the command as the shell finds it
 * @property {boolean} astryx whether it starts the Astryx CLI
 * @property {string | null} cliRoot the CLI package it starts, when known
 * @property {string | null} version that package's version, when known
 * @property {boolean | null} handsOff whether that release hands a project's
 *   run to the project's release (spec AST-081 FR9); `null` when unknown
 */

/**
 * The CLI package's version, when `dir` is the Astryx CLI package.
 * @param {string} dir
 * @returns {string | null}
 */
function cliVersionAt(dir) {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(dir, 'package.json'), 'utf8'),
    );
    return pkg?.name === CLI_PACKAGE ? String(pkg.version ?? '') : null;
  } catch {
    return null;
  }
}

/**
 * Releases that hand off carry the release-choice module.
 * @param {string} dir
 * @returns {boolean}
 */
function handsOffAt(dir) {
  return fs.existsSync(path.join(dir, 'foundation', 'release', 'choose.mjs'));
}

/**
 * The Astryx CLI package an executable starts, or null.
 * @param {string} file
 * @returns {string | null}
 */
export function astryxCliRootOf(file) {
  let real;
  try {
    real = fs.realpathSync(file);
  } catch {
    return null;
  }
  for (let dir = path.dirname(real); ;) {
    if (cliVersionAt(dir) !== null) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  let text;
  try {
    if (fs.statSync(real).size > MAX_SHIM_BYTES) return null;
    text = fs.readFileSync(real, 'utf8');
  } catch {
    return null;
  }
  const base = path.dirname(file);
  const target = SHIM_TARGET_LINE.exec(text)?.[1];
  if (target && path.isAbsolute(target)) {
    for (let dir = path.dirname(target); ;) {
      if (cliVersionAt(dir) !== null) return dir;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  for (const match of text.matchAll(SHIM_PACKAGE)) {
    const named = match[1]
      .replace(SHIM_BASE, `${base}${path.sep}`)
      .replace(/[\\/]/gu, path.sep);
    const dir = path.resolve(base, named);
    if (cliVersionAt(dir) !== null) return dir;
  }
  return null;
}

/**
 * Whether a small script names the CLI package's files, even when that
 * package cannot be read from here.
 * @param {string} file
 * @returns {boolean}
 */
function namesCliPackage(file) {
  try {
    const real = fs.realpathSync(file);
    if (fs.statSync(real).size > MAX_SHIM_BYTES) return false;
    return /node_modules[\\/]@astryxdesign[\\/]cli[\\/]/u.test(
      fs.readFileSync(real, 'utf8'),
    );
  } catch {
    return false;
  }
}

/**
 * Every `astryx` command on the search path, in the order a shell tries
 * them. The first row is the one that runs.
 * @param {{searchPath?: string, platform?: NodeJS.Platform}} [options]
 * @returns {SearchPathCommand[]}
 */
export function astryxCommandsOnSearchPath({
  searchPath = process.env.PATH ?? process.env.Path ?? '',
  platform = process.platform,
} = {}) {
  const windows = platform === 'win32';
  const names = windows
    ? ['astryx.cmd', 'astryx.exe', 'astryx.ps1', 'astryx']
    : [COMMAND];
  /** @type {SearchPathCommand[]} */
  const rows = [];
  const seen = new Set();
  for (const dir of searchPath.split(windows ? ';' : path.delimiter)) {
    if (!dir) continue;
    for (const name of names) {
      const file = path.join(dir, name);
      let stat;
      try {
        stat = fs.statSync(file);
      } catch {
        continue;
      }
      if (!stat.isFile()) continue;
      if (!windows) {
        try {
          fs.accessSync(file, fs.constants.X_OK);
        } catch {
          continue;
        }
      }
      let key = file;
      try {
        key = fs.realpathSync(file);
      } catch {
        // Keep the path as found.
      }
      if (seen.has(key)) break;
      seen.add(key);
      const cliRoot = astryxCliRootOf(file);
      rows.push({
        file,
        astryx: cliRoot !== null || namesCliPackage(file),
        cliRoot,
        version: cliRoot ? cliVersionAt(cliRoot) : null,
        handsOff: cliRoot ? handsOffAt(cliRoot) : null,
      });
      // One command per folder: the shell runs the first name it finds.
      break;
    }
  }
  return rows;
}
