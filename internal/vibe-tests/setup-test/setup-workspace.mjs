// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A disposable build root for measuring one sandbox.
 *
 * The measurer must not build in the sandbox it measures. That sandbox is the
 * attested artifact: its bytes are what the runner digested, what the integrity
 * checker reads, and what a later re-measurement or recovery has to be able to
 * read again. A build in place destroys that — the fixtures' `prebuild`
 * regenerates the app-owned theme over the executor's copy, `vite build` writes
 * `dist/`, the CLI appends to its invocation log, and the bundler drops caches
 * into `node_modules`. A failed build leaves the same debris.
 *
 * So the build gets its own copy, and *nothing reachable from that copy can
 * write into the original*. The second half is the hard part, because a pnpm
 * `node_modules` is mostly links:
 *
 *   node_modules/react            -> .pnpm/react@19.2.8/node_modules/react
 *   node_modules/@scope/pkg       -> ../.pnpm/@scope+pkg@1.0.0/node_modules/@scope/pkg
 *   node_modules/.pnpm/<id>/...   the real package trees (the virtual store)
 *   node_modules/.modules.yaml    the store's own state
 *
 * Symlinking `.pnpm` into the copy — which is what this did first — hands the
 * copy a door straight back into the original: an install or a rebuild that
 * rewrites the virtual store, or writes any cache under it, writes through the
 * link. So does symlinking `.bin`, or `.modules.yaml`, since writing through a
 * symlink writes to its target. Hardlinking is no better: a build that rewrites
 * a hardlinked file writes to the shared inode, and the original changes.
 *
 * The copy is therefore a real copy, made copy-on-write where the filesystem
 * supports it:
 *
 * - Files are copied with `cp -a --reflink=auto`, which shares extents on a
 *   filesystem that can (btrfs, xfs) and byte-copies where it cannot. Either
 *   way the copy gets its own inode, so a write in the copy cannot reach the
 *   original. `--reflink=auto` is never `--link`: extents are shared
 *   copy-on-write, not the file itself. Where there is no `cp`, or a `cp` that
 *   has never heard of `--reflink` (BSD, busybox), the pure-Node copier below
 *   makes the same copy by the same rules.
 * - Symlinks are reproduced with their target text intact, so a relative link
 *   keeps resolving relative to the copy — `react -> .pnpm/react@…` now points
 *   at the *copied* virtual store, and a package's own dependency links stay
 *   inside it.
 * - An absolute link that points into the original tree is the one case where
 *   verbatim text would escape, so it is retargeted at the equivalent path in
 *   the copy. An absolute link pointing somewhere else entirely — a workspace
 *   package in the repo — is left alone, because that is what it is for and it
 *   is not the sandbox.
 *
 * `verifyWorkspaceIsolation` re-derives that claim from the finished copy
 * rather than trusting the construction, and the measurer runs it before any
 * build starts.
 *
 * The workspace is removed when the measurement ends, including when the build
 * fails or the measurement throws.
 */

import * as crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * Whether `cp` refused the command line rather than failing to copy.
 *
 * `--reflink` is a GNU coreutils extension. BSD `cp` — macOS, the BSDs — and
 * some busybox builds reject it as an unknown option and exit nonzero before
 * copying anything, which is a platform fact and not a fault. A copy that
 * started and then went wrong reports something else entirely, and must not be
 * mistaken for this: falling back over a real failure would hide it.
 */
function rejectedTheCommandLine(result) {
  const said = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  return (
    /\b(unrecognized|unknown|illegal|invalid) option\b/i.test(said) ||
    /^\s*usage:/im.test(said)
  );
}

/**
 * Throw away a half-written destination, and prove it is gone.
 *
 * A `cp` that got part way through leaves part of the tree behind, and the
 * fallback copier writes into whatever it finds — so falling back over that
 * debris would produce a build root that is neither copy, with stale files the
 * sandbox does not have. The removal is therefore checked rather than assumed:
 * if the directory survives it, there is nothing safe to fall back to and the
 * measurement stops here.
 */
function discardPartialCopy(destination) {
  fs.rmSync(destination, {recursive: true, force: true});
  if (fs.existsSync(destination)) {
    throw new Error(
      `could not clear a partial build root before falling back: ${destination}`,
    );
  }
}

/**
 * Copy a tree with `cp -a --reflink=auto`.
 *
 * `-a` keeps symlinks as symlinks and preserves modes, ownership where
 * permitted, and timestamps. `--reflink=auto` asks for a copy-on-write clone
 * and silently byte-copies when the filesystem has no such thing. There is no
 * `--link` here and there must never be one: a hardlink shares the inode, so a
 * build that rewrites the file rewrites the original.
 *
 * Not every `cp` is GNU coreutils. There is no `cp` at all on some platforms,
 * and on others there is one that has never heard of `--reflink`; both mean
 * the same thing here — use the pure-Node copier instead — so both answer
 * false, having first cleared whatever the attempt left behind. A `cp` that
 * accepted the flag and then failed is a real failure and is raised.
 *
 * @returns true when `cp` did the work, false when it cannot do it.
 */
function copyWithReflink(source, destination) {
  fs.mkdirSync(destination, {recursive: true});
  const result = spawnSync(
    'cp',
    ['-a', '--reflink=auto', `${source}/.`, destination],
    {encoding: 'utf8'},
  );
  if (result.error?.code === 'ENOENT') {
    discardPartialCopy(destination);
    return false;
  }
  if (result.status !== 0) {
    if (!rejectedTheCommandLine(result)) {
      throw new Error(
        `could not copy the sandbox into a build root: ${
          result.stderr?.trim() || `cp exited ${result.status}`
        }`,
      );
    }
    discardPartialCopy(destination);
    return false;
  }
  return true;
}

/** The same copy in pure Node, for a platform without a usable `cp`. */
function copyWithNode(source, destination) {
  fs.mkdirSync(destination, {recursive: true});
  for (const entry of fs.readdirSync(source, {withFileTypes: true})) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isSymbolicLink()) {
      fs.symlinkSync(fs.readlinkSync(from), to);
      continue;
    }
    if (entry.isDirectory()) {
      copyWithNode(from, to);
      const stat = fs.lstatSync(from);
      fs.chmodSync(to, stat.mode & 0o777);
      continue;
    }
    if (entry.isFile()) {
      // Never `fs.linkSync`: a hardlink would let a build in the copy rewrite
      // the original's bytes.
      fs.copyFileSync(from, to);
      fs.chmodSync(to, fs.lstatSync(from).mode & 0o777);
    }
    // Sockets, fifos and devices have no place in a build root.
  }
}

/** Whether `candidate` is `root` itself or something inside it. */
function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  );
}

/**
 * Every symlink in `root`, as absolute paths.
 *
 * A directory that is itself a symlink is reported and not descended into, so
 * a link cycle cannot spin this.
 */
function symlinks(root) {
  const found = [];
  const walk = directory => {
    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        found.push(absolute);
        continue;
      }
      if (entry.isDirectory()) walk(absolute);
    }
  };
  walk(root);
  return found;
}

/**
 * Point any absolute link that reaches into `sourceRoot` at the same place in
 * `destinationRoot` instead.
 *
 * Relative links need nothing: their text already resolves inside the copy,
 * which is why the copy keeps that text verbatim. An absolute link elsewhere on
 * the machine — a workspace package in the repo — is left alone.
 *
 * @returns the links it rewrote, for the record.
 */
export function retargetEscapingLinks(destinationRoot, sourceRoot) {
  const source = path.resolve(sourceRoot);
  const destination = path.resolve(destinationRoot);
  const rewritten = [];
  for (const link of symlinks(destination)) {
    const target = fs.readlinkSync(link);
    if (!path.isAbsolute(target)) continue;
    const resolved = path.resolve(target);
    if (!isInside(source, resolved)) continue;
    const moved = path.join(destination, path.relative(source, resolved));
    fs.rmSync(link);
    fs.symlinkSync(moved, link);
    rewritten.push({link, from: target, to: moved});
  }
  return rewritten;
}

/**
 * Check a finished build root really is sealed off from the sandbox.
 *
 * Construction is one argument and this is the other: it walks the copy and
 * fails on anything that could reach the original — a symlink resolving into
 * it, or a file sharing its inode, which is what a hardlinked copy would look
 * like. `node_modules` is where both would hide, so it is not skipped.
 *
 * @returns {string[]} the problems found; empty means sealed.
 */
export function verifyWorkspaceIsolation(
  buildDir,
  appDir,
  {full = false} = {},
) {
  const source = path.resolve(appDir);
  const destination = path.resolve(buildDir);
  const problems = [];

  for (const link of symlinks(destination)) {
    const relative = path.relative(destination, link);
    const target = fs.readlinkSync(link);
    const resolved = path.resolve(path.dirname(link), target);
    if (isInside(source, resolved)) {
      problems.push(`symlink escapes to the sandbox: ${relative} -> ${target}`);
    }
  }

  // A file the copy shares with the original is a file a build can rewrite
  // under it. Compare inodes on the entries most likely to be written.
  const shared = (relative, mustExist) => {
    const inCopy = path.join(destination, relative);
    const inSource = path.join(source, relative);
    if (!fs.existsSync(inCopy) || !fs.existsSync(inSource)) {
      if (mustExist) problems.push(`missing from the build root: ${relative}`);
      return;
    }
    const copyStat = fs.lstatSync(inCopy);
    if (!copyStat.isFile()) return;
    if (copyStat.ino === fs.lstatSync(inSource).ino) {
      problems.push(`shares an inode with the sandbox: ${relative}`);
    }
  };
  shared('package.json', true);
  for (const candidate of [
    'node_modules/.modules.yaml',
    'node_modules/.package-map.json',
    'node_modules/.pnpm/lock.yaml',
    'pnpm-lock.yaml',
  ]) {
    shared(candidate, false);
  }

  // `full` compares every regular file's inode instead of a handful. The
  // default is the handful because the copier cannot produce a shared inode —
  // `cp` shares extents copy-on-write and the fallback uses `copyFileSync`,
  // neither of which is a hardlink — so the complete walk is a proof to run in
  // tests rather than a cost to pay on every measurement of a tree with sixty
  // thousand files in it.
  if (full) {
    const walk = (directory, relative) => {
      for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
        const absolute = path.join(directory, entry.name);
        const key = relative === '' ? entry.name : `${relative}/${entry.name}`;
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) {
          walk(absolute, key);
          continue;
        }
        if (!entry.isFile()) continue;
        const original = path.join(source, key);
        if (!fs.existsSync(original)) continue;
        const originalStat = fs.lstatSync(original);
        if (!originalStat.isFile()) continue;
        const copyStat = fs.lstatSync(absolute);
        if (
          copyStat.ino === originalStat.ino &&
          copyStat.dev === originalStat.dev
        ) {
          problems.push(`shares an inode with the sandbox: ${key}`);
        }
      }
    };
    walk(destination, '');
  }

  return problems;
}

/**
 * Copy `appDir` into a disposable build root.
 *
 * @returns {{dir: string, cleanup: () => void, retargeted: object[]}} the
 *   copy's path, a remove-everything function that is safe to call more than
 *   once, and any links that had to be retargeted.
 */
export function createMeasurementWorkspace(
  appDir,
  {prefix = 'setup-measure-', verify = true, strategy = 'auto'} = {},
) {
  const source = path.resolve(appDir);
  if (!fs.existsSync(source)) {
    throw new Error(
      `cannot measure a directory that does not exist: ${source}`,
    );
  }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const dir = path.join(root, 'app');
  let removed = false;
  const cleanup = () => {
    if (removed) return;
    removed = true;
    fs.rmSync(root, {recursive: true, force: true});
  };
  try {
    // `strategy: 'node'` forces the pure-Node path so tests can exercise the
    // platform that has no usable `cp`.
    if (strategy === 'node' || !copyWithReflink(source, dir)) {
      discardPartialCopy(dir);
      copyWithNode(source, dir);
    }
    const retargeted = retargetEscapingLinks(dir, source);
    if (verify) {
      const problems = verifyWorkspaceIsolation(dir, source, {
        full: verify === 'full',
      });
      if (problems.length > 0) {
        throw new Error(
          `build root is not isolated from the sandbox:\n  ${problems.join('\n  ')}`,
        );
      }
    }
    return {dir, cleanup, retargeted};
  } catch (error) {
    cleanup();
    throw error;
  }
}

/**
 * A manifest of a tree's bytes and modification times, for proving nothing in
 * it moved.
 *
 * Every entry is recorded: tracked, untracked, and ignored alike, because a
 * build's debris is ignored by construction and that is exactly what has to
 * stay out. Files record size, mode, mtime in nanoseconds, and content hash;
 * symlinks record their target; directories record their own mtime, so an added
 * or deleted child shows up even when no existing file changed.
 */
export function treeManifest(root) {
  const manifest = new Map();
  // `mtimeNs` exists only on bigint stats; a plain `lstatSync` would record
  // `undefined` for every entry and make the timestamp half of this check
  // silently vacuous.
  const lstat = target => fs.lstatSync(target, {bigint: true});
  const walk = (directory, relative) => {
    const stat = lstat(directory);
    manifest.set(relative === '' ? '.' : relative, {
      type: 'dir',
      mtimeNs: String(stat.mtimeNs),
    });
    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
      const absolute = path.join(directory, entry.name);
      const key = relative === '' ? entry.name : `${relative}/${entry.name}`;
      const entryStat = lstat(absolute);
      if (entry.isSymbolicLink()) {
        manifest.set(key, {
          type: 'symlink',
          target: fs.readlinkSync(absolute),
          mtimeNs: String(entryStat.mtimeNs),
        });
        continue;
      }
      if (entry.isDirectory()) {
        walk(absolute, key);
        continue;
      }
      if (entry.isFile()) {
        manifest.set(key, {
          type: 'file',
          size: String(entryStat.size),
          mode: String(entryStat.mode & 0o777n),
          mtimeNs: String(entryStat.mtimeNs),
          sha256: crypto
            .createHash('sha256')
            .update(fs.readFileSync(absolute))
            .digest('hex'),
        });
      }
    }
  };
  walk(path.resolve(root), '');
  return manifest;
}

/** The manifest entries that differ, as readable lines. */
export function manifestDifferences(before, after) {
  const differences = [];
  for (const [key, value] of before) {
    if (!after.has(key)) {
      differences.push(`removed: ${key}`);
      continue;
    }
    const other = after.get(key);
    if (JSON.stringify(value) !== JSON.stringify(other)) {
      differences.push(
        `changed: ${key} ${JSON.stringify(value)} -> ${JSON.stringify(other)}`,
      );
    }
  }
  for (const key of after.keys()) {
    if (!before.has(key)) differences.push(`added: ${key}`);
  }
  return differences.sort();
}
