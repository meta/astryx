// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Portable create-only file publication.
 *
 * @input  A fully written temporary file and a destination path.
 * @output The destination exists with the temporary's content, or an error
 *         is thrown and nothing is created.
 * @position foundation/fs — used by every write transaction that creates a
 *           new file without overwriting (integration add, palette generation,
 *           manifest creation).
 *
 * The ideal primitive is `fs.linkSync`: it is a single atomic directory-entry
 * operation that fails with EEXIST when the destination already exists, giving
 * concurrent-creator safety for free.
 *
 * Some virtual, network, and cross-device filesystems reject hard links with
 * EPERM or EXDEV. When that happens, we fall back to `fs.copyFileSync` with
 * `COPYFILE_EXCL`, which creates the destination with O_EXCL (still fails
 * EEXIST on collision) and copies the content.
 *
 * SYNC: residual crash-atomicity tradeoff — `linkSync` adds a directory
 * entry in a single metadata operation, so a crash cannot produce a partial
 * file. `copyFileSync` writes data, so a crash mid-copy could leave a
 * truncated destination. Callers that need crash-atomic guarantees on
 * link-hostile filesystems would need `fsync` + rename, which conflicts
 * with the no-clobber requirement. For CLI-driven interactive writes the
 * window is negligible and the tradeoff is accepted.
 */

import * as fs from 'node:fs';

/**
 * Publish a fully written temporary file to a new destination path.
 *
 * Semantics:
 * - **Create-only**: if `destination` already exists, throws with
 *   `code === 'EEXIST'` and leaves the existing file untouched.
 * - **Concurrent-creator safe**: two racing publishers to the same
 *   destination — at most one wins; the loser gets EEXIST.
 * - **Symlink-neutral**: this function does not follow or reject
 *   symlinks at `destination`; callers that need symlink rejection
 *   must check before calling.
 *
 * The temporary file is NOT removed by this function — the caller
 * owns cleanup so that rollback paths can still read it.
 *
 * @param {string} temporary  Fully written source (temp) file path.
 * @param {string} destination  Target path that must not yet exist.
 */
export function publishNewFile(temporary, destination) {
  try {
    fs.linkSync(temporary, destination);
  } catch (linkError) {
    if (
      linkError &&
      typeof linkError === 'object' &&
      'code' in linkError &&
      (linkError.code === 'EPERM' || linkError.code === 'EXDEV')
    ) {
      // Hard links unavailable (EPERM) or cross-device (EXDEV).
      // Fall back to exclusive-create copy: O_EXCL guarantees no-clobber.
      fs.copyFileSync(temporary, destination, fs.constants.COPYFILE_EXCL);
      return;
    }
    throw linkError;
  }
}
