// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Whether a folder is outside a project (spec AST-081 FR3).
 *
 * A folder is inside a project when the CLI finds a Core or a CLI installed
 * there or above it, or a package.json above it that declares either one; the
 * release choice already worked that out (foundation/release/run-context.mjs).
 * Outside a project, output never gives advice that works only inside one, such
 * as the setup reminder, the getting-started steps, or a step that adds a theme
 * to an app; each surface that prints such a step asks here first.
 *
 * @input  a folder
 * @output whether it is outside a project, or outside any package
 * @position foundation/env — read by the setup reminder, init, doctor, upgrade,
 *   the theme, search, discover, and integration-check surfaces, and the
 *   commands that refuse to run outside a project.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {runChoice} from '../release/run-context.mjs';

/**
 * True when `cwd` is outside any project.
 * @param {string} [cwd]
 * @returns {boolean}
 */
export function isOutsideProject(cwd = process.cwd()) {
  try {
    return !runChoice(cwd).inProject;
  } catch {
    // A folder the release choice cannot read keeps its in-project output.
    return false;
  }
}

/**
 * True when `cwd` is outside any project and no package.json is at or above
 * it: where a command that writes to a project or package refuses to run. A
 * folder with a package.json at or above it is a package being authored,
 * even before it declares Astryx.
 * @param {string} [cwd]
 * @returns {boolean}
 */
export function isOutsideAnyPackage(cwd = process.cwd()) {
  return isOutsideProject(cwd) && !hasPackageJsonAbove(cwd);
}

/**
 * Is there a package.json in `dir` or a folder above it?
 * @param {string} dir
 */
function hasPackageJsonAbove(dir) {
  for (let at = path.resolve(dir); ; at = path.dirname(at)) {
    if (fs.existsSync(path.join(at, 'package.json'))) return true;
    if (path.dirname(at) === at) return false;
  }
}
