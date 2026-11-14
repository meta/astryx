#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

// ---------------------------------------------------------------------------
// Node.js version preflight gate.
//
// The CLI and its dependencies use `styleText` from `node:util`, added in Node
// 22.13.0. On older runtimes the lazy-loaded subcommands die with a cryptic
// ESM error ("...does not provide an export named 'styleText'"). To give users
// a clear message instead, we check the running version FIRST, using only
// built-ins, and exit early before importing anything that touches styleText.
//
// `node-version.mjs` is intentionally dependency-free so it loads on the
// unsupported runtimes this guard protects against.
//
// Sibling package modules (e.g. `cli/`, `lib/`) are resolved by this bin's REAL
// path. When the CLI is installed as a package, the package manager runs this file
// through the `node_modules/.bin/astryx` symlink, and some Node versions resolve
// relative specifiers from the symlink's directory rather than the real package
// — breaking bare `../…` imports with a cryptic ERR_MODULE_NOT_FOUND.
// realpath-ing `import.meta.url` makes these imports resolve correctly however
// the bin is invoked (symlink, copy, or Windows shim). Uses only built-ins, so
// the version gate below still runs first.
import {fileURLToPath, pathToFileURL} from 'node:url';
import {dirname, join} from 'node:path';
import * as nodeModule from 'node:module';
import {existsSync, mkdirSync, realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {
  currentUid,
  isPrivateDir,
} from '../../../foundation/env/private-dir.mjs';

// Node's compile cache keeps the compiled form of the CLI's modules between
// runs, so a run skips most of their compiling. It lives in a folder of the
// user's own in the system temp folder (node-compile-cache-<uid>). A machine's
// first run makes that folder and writes the cache at once, so the next run
// (most often the same session's next command) reads it. It is used only
// while it is a real folder the user owns that no one else can reach, since a shared folder
// could hold planted cache files (foundation/env/private-dir.mjs, the check
// the kept search catalogs use too). Where the system has no user ids
// (Windows), ownership cannot be checked, so the cache stays off.
// NODE_DISABLE_COMPILE_CACHE turns it off. It is best effort: a cache Node
// cannot read or write is skipped, and nothing about it is printed.
try {
  const uid = currentUid();
  if (!process.env.NODE_DISABLE_COMPILE_CACHE && uid != null) {
    const cacheDir = join(tmpdir(), `node-compile-cache-${uid}`);
    if (!existsSync(cacheDir)) mkdirSync(cacheDir, {mode: 0o700});
    if (isPrivateDir(cacheDir)) nodeModule.enableCompileCache?.(cacheDir);
  }
} catch {
  // A run without the cache is the same run, only slower.
}

const binDir = dirname(realpathSync(fileURLToPath(import.meta.url)));
/** @param {string} rel */
const importSrc = rel => import(pathToFileURL(join(binDir, '..', rel)).href);

const {isNodeVersionSupported, unsupportedNodeMessage} = await importSrc(
  '../../foundation/env/node-version.mjs',
);

if (!isNodeVersionSupported(process.versions.node)) {
  const msg = unsupportedNodeMessage(process.versions.node);
  // Honor the --json contract even at this pre-import gate. We can't import
  // json.mjs here (it transitively loads styleText, the very thing this gate
  // protects against), so emit a minimal hand-rolled envelope. The shape and
  // the stable `code` (ERR_NODE_VERSION) match error-codes.mjs.
  if (process.argv.slice(2).includes('--json')) {
    console.log(
      JSON.stringify(
        {apiVersion: 1, error: msg, code: 'ERR_NODE_VERSION'},
        null,
        2,
      ),
    );
  } else {
    console.error(msg);
  }
  process.exit(1);
}

// Global mode: the run chooses the release that answers this folder and, when
// it is not this copy, hands the run to it before anything the project
// provides (its astryx.config, integrations, or Core) is loaded; only then
// does it load and dispatch the command. See clients/cli/run.mjs,
// foundation/release/handoff.mjs, and spec AST-081 FR2 and FR9.
const {runCli} = await importSrc('run.mjs');
const {recordRunFor} = await importSrc('../../foundation/fs/gather-cache.mjs');
// A search or build records what it reads, so a later run with the same
// inputs can reuse its gathered catalog (foundation/fs/gather-cache.mjs).
await recordRunFor(process.argv.slice(2), () =>
  runCli({
    cliRoot: join(binDir, '..', '..', '..'),
    argv: process.argv.slice(2),
  }),
);
