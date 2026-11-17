// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file What kind of file sits at a path a command reads back or writes.
 *
 * @input  a path
 * @output null for a regular file or a free path, else what is there; a
 *         file's bytes, read only when it is a regular one
 * @position packages/cli/foundation/fs — shared by every writer that reads a
 *           file it is about to replace. An open of a named pipe waits for a
 *           writer, and a device may never end; a synchronous wait holds the
 *           main thread, so no signal handler runs. Writers test the kind
 *           first and refuse anything but a regular file.
 */

import * as fs from 'node:fs';

/**
 * What sits at `file` when it is no regular file (`a named pipe`, `a
 * device`, `a socket`, `a folder`); null for a regular file or a path with
 * nothing at it. A symbolic link is judged by what it points to.
 * @param {string} file
 * @returns {string | null}
 */
export function irregularFileKind(file) {
  /** @type {fs.Stats} */
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    return null;
  }
  if (stat.isFile()) return null;
  if (stat.isFIFO()) return 'a named pipe';
  if (stat.isCharacterDevice() || stat.isBlockDevice()) return 'a device';
  if (stat.isSocket()) return 'a socket';
  if (stat.isDirectory()) return 'a folder';
  return 'no regular file';
}

/**
 * Read a file the editor reads or replaces, only when it is a regular
 * file: a named pipe, a device or a folder at its path is never read (a
 * read of one can wait for good, or never end). Opened without waiting,
 * then checked, so nothing blocks; one that is not a regular file throws
 * with code `ENOTREG`, as any unreadable file throws.
 * @overload
 * @param {string} file
 * @returns {Buffer}
 */
/**
 * @overload
 * @param {string} file
 * @param {BufferEncoding} encoding
 * @returns {string}
 */
/**
 * @param {string} file
 * @param {BufferEncoding} [encoding]
 * @returns {Buffer | string}
 */
export function readRegularFile(file, encoding) {
  const fd = fs.openSync(
    file,
    fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK ?? 0),
  );
  try {
    if (!fs.fstatSync(fd).isFile())
      throw Object.assign(new Error(`${file} is not a regular file`), {
        code: 'ENOTREG',
        path: file,
      });
    return encoding ? fs.readFileSync(fd, encoding) : fs.readFileSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}
