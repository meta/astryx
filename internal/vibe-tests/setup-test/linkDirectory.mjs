// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file linkDirectory.mjs
 * @input Node fs/path
 * @output Exports linkDirectory, retargetLinkTarget
 * @position Shared by run-setup.mjs and setup-canonical.test.ts; side-effect
 *   free on import (no top-level fs access), so it can be unit tested
 *   directly without pulling in either caller's own setup.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Where an absolute link target should actually point, once it is about to
 * live inside `destinationRoot` instead of `sourceRoot`.
 *
 * A relative target needs nothing: it already resolves against its own
 * link's location, and `linkDirectory` mirrors `sourceRoot`'s structure
 * exactly, so the same relative text resolves to the same place inside
 * `destinationRoot`.
 *
 * An absolute target (what a Windows junction always stores, since
 * `fs.readlinkSync` never returns a relative path for one) is different: if
 * it resolves to somewhere inside `sourceRoot`, reusing that exact text
 * would give every sandbox created from the same `depsDir` a junction that
 * quietly points back at the one shared `depsDir` tree, rather than at the
 * copy `linkDirectory` is actually building. A write through that junction,
 * from a sandbox running an agent's own code and not just this script's own
 * install/build calls, corrupts the shared source and, with it, every
 * other sandbox built from it. Retargeted here to the equivalent path
 * inside `destinationRoot`, matching the pattern `setup-workspace.mjs` uses
 * for the same problem in its own copy step.
 *
 * A target that resolves outside `sourceRoot` entirely (an absolute path to
 * something else on the machine) is left as-is: it was never inside the
 * tree being copied, so there is nothing to retarget it relative to.
 */
export function retargetLinkTarget(target, sourceRoot, destinationRoot) {
  if (!path.isAbsolute(target)) {
    return target;
  }
  const resolvedTarget = path.resolve(target);
  const resolvedSource = path.resolve(sourceRoot);
  const relative = path.relative(resolvedSource, resolvedTarget);
  const isInsideSource =
    relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  if (!isInsideSource) {
    return target;
  }
  return path.join(path.resolve(destinationRoot), relative);
}

/**
 * Cross-platform equivalent of `cp -al`: recurse into real directories,
 * hard-link regular files (shares bytes with `source` instead of
 * duplicating them), and recreate symlinks/junctions as links rather than
 * dereferencing them, retargeted via `retargetLinkTarget` so a copy stays
 * isolated from the tree it was built from.
 *
 * pnpm's Windows `node_modules` layout is junction-heavy (`readdirSync`
 * reports these as `isSymbolicLink()`, not `isDirectory()`), and Windows
 * can't hard-link a reparse point, so those need
 * `fs.symlinkSync(..., 'junction')`, the one symlink type Windows creates
 * without elevated privileges.
 *
 * `rootSource`/`rootDestination` default to `source`/`destination` on the
 * outermost call and are threaded through recursive calls unchanged, so a
 * junction found several levels deep can still be retargeted relative to
 * the whole tree being copied, not just its own immediate parent.
 */
export function linkDirectory(
  source,
  destination,
  rootSource = source,
  rootDestination = destination,
) {
  fs.mkdirSync(destination, {recursive: true});
  for (const entry of fs.readdirSync(source, {withFileTypes: true})) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isSymbolicLink()) {
      const target = retargetLinkTarget(
        fs.readlinkSync(from),
        rootSource,
        rootDestination,
      );
      const isDir = fs.statSync(from).isDirectory();
      fs.symlinkSync(
        target,
        to,
        process.platform === 'win32' ? (isDir ? 'junction' : 'file') : undefined,
      );
    } else if (entry.isDirectory()) {
      linkDirectory(from, to, rootSource, rootDestination);
    } else {
      fs.linkSync(from, to);
    }
  }
}
