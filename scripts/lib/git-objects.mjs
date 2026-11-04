// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Many files out of git in one process.
 * @input A repository and object names such as `<commit>:<path>`.
 * @output Each name's bytes, or null when git holds no such object.
 * @position check-knowledge reads every knowledge record at a review's
 *   authority commit through it: one `git cat-file --batch` instead of one
 *   `git show` per record. Each git command is a process launch, which a
 *   loaded machine makes slow.
 */
import {execFileSync} from 'node:child_process';

// A found object's header line: its id, type and size in bytes.
const FOUND = /^[0-9a-f]{40,64} [a-z]+ (\d+)$/;

/**
 * Reads every object `names` lists with one `git cat-file --batch`.
 * @param {string} root
 * @param {string[]} names
 * @returns {Map<string, Buffer | null>}
 */
export function readObjects(root, names) {
  /** @type {Map<string, Buffer | null>} */
  const objects = new Map();
  if (names.length === 0) return objects;
  const out = execFileSync('git', ['-C', root, 'cat-file', '--batch'], {
    input: names.map(name => `${name}\n`).join(''),
    maxBuffer: 1024 * 1024 * 1024,
  });
  let at = 0;
  for (const name of names) {
    const end = out.indexOf(0x0a, at);
    const found = FOUND.exec(out.toString('utf8', at, end));
    at = end + 1;
    if (found === null) {
      objects.set(name, null);
      continue;
    }
    const size = Number(found[1]);
    objects.set(name, out.subarray(at, at + size));
    // A line feed follows each object's bytes.
    at += size + 1;
  }
  return objects;
}
