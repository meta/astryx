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
 * @output whether it is outside a project
 * @position foundation/env — read by the setup reminder, init, doctor, upgrade,
 *   and the theme, search, discover, and integration-check surfaces.
 */

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
