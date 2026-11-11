// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A test's fixture project in the OS temp directory, whose imports
 *   resolve to the CLI's own packages.
 * @input A directory name prefix and the packages the fixture imports.
 * @output The fixture's real path.
 * @position Test support. A fixture under packages/cli lies in the tree that
 *   scanners walk, and it can vanish under a walk. Links beside the fixture
 *   resolve its imports as the CLI resolves them.
 */
import fs from 'node:fs';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';

const CLI_ROOT = path.resolve(import.meta.dirname, '..');
const require = createRequire(path.join(CLI_ROOT, 'package.json'));
const CLI_PACKAGE = require('./package.json').name;
/** The roots makeLinkedFixture made and has not removed. */
const made = new Set();

/**
 * Makes an empty fixture directory that resolves `packages`. The links sit in
 * the directory's parent, so the directory holds only what the test writes.
 * The parent's package.json gives the project a top and the CLI's module
 * type, as the CLI's own package.json gives its files.
 * @param {string} prefix
 * @param {string[]} packages Package names. A scope the CLI holds, such as
 *   `@astryxdesign`, links whole.
 * @returns {string}
 */
export function makeLinkedFixture(prefix, packages) {
  // The real path counts, because the temp directory can be a link (macOS:
  // /var to /private/var).
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  made.add(root);
  fs.writeFileSync(path.join(root, 'package.json'), '{"type": "module"}\n');
  for (const name of packages) {
    const link = path.join(root, 'node_modules', name);
    fs.mkdirSync(path.dirname(link), {recursive: true});
    // A Windows directory symlink needs Developer Mode or an elevated shell,
    // so without one every fixture fails with EPERM. A junction needs
    // neither. It resolves and is removed like a symlink, and it takes the
    // absolute target that packageDir gives.
    fs.symlinkSync(
      packageDir(name),
      link,
      process.platform === 'win32' ? 'junction' : 'dir',
    );
  }
  const dir = path.join(root, 'project');
  fs.mkdirSync(dir);
  return dir;
}

/**
 * Removes a fixture that makeLinkedFixture made, with its links.
 * @param {string} dir
 */
export function removeLinkedFixture(dir) {
  const root = path.dirname(dir);
  // A wrong argument must not remove the temp directory itself, so only a
  // root that makeLinkedFixture made goes.
  if (path.basename(dir) !== 'project' || !made.delete(root)) {
    throw new Error(`not a linked fixture: ${dir}`);
  }
  fs.rmSync(root, {recursive: true, force: true});
}

/** @param {string} name */
function packageDir(name) {
  if (name === CLI_PACKAGE) return CLI_ROOT;
  const own = path.join(CLI_ROOT, 'node_modules', name);
  if (fs.existsSync(own)) return own;
  return path.dirname(require.resolve(`${name}/package.json`));
}
