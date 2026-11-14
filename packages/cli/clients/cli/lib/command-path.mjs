// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The full path of a command after `astryx`, such as `theme build`.
 * @input a Commander command
 * @output commandPath()
 * @position clients/cli/lib — the one walk from a command up to the root
 */

/**
 * The full path of a command after `astryx`, such as `theme build`. The root
 * program's path is ''.
 * @param {import('commander').Command} cmd
 * @returns {string}
 */
export function commandPath(cmd) {
  /** @type {string[]} */
  const parts = [];
  /** @type {import('commander').Command | null} */
  let node = cmd;
  while (node?.parent) {
    parts.unshift(node.name());
    node = node.parent;
  }
  return parts.join(' ');
}
