// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Plain words for file-system failures.
 *
 * @input  an error thrown by `node:fs`, and the project-relative path it hit
 * @output one sentence that names the path and the fix, with no errno text
 * @position shared by commands that write into the user's project, so a raw
 *   `EISDIR` or `ENAMETOOLONG` never reaches the caller
 */

/**
 * @param {unknown} err
 * @param {string} relative the path as the user wrote it, relative to the project
 * @returns {string | null} null when the error is not a known file-system failure
 */
export function fsErrorMessage(err, relative) {
  switch (/** @type {NodeJS.ErrnoException | null} */ (err)?.code) {
    case 'EISDIR':
      return `${relative} is a folder; give a file path.`;
    case 'ENOTDIR':
      return `A part of ${relative} is a file, not a folder; give another path.`;
    case 'EEXIST':
      return `A file is in the way at ${relative}, where a folder is needed; give another path.`;
    case 'ENAMETOOLONG':
      return 'The path is too long for this file system; give a shorter name.';
    case 'EACCES':
    case 'EPERM':
    case 'EROFS':
      return `No permission to write ${relative}.`;
    default:
      return null;
  }
}
