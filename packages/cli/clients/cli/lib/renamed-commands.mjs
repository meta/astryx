// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Experimental commands that changed their name, by their old name. An
 * old name is no alias: its line fails, names the new command, and answers
 * `--json` with that error's envelope.
 *
 * @input none
 * @output RENAMED_EXPERIMENTAL and RENAMED_PATHS
 * @position packages/cli/clients/cli/lib — read by the experimental group
 *   (commands/experimental/index.mjs) and by the program's JSON gate
 *   (index.mjs)
 */

/** @type {Readonly<Record<string, string>>} */
export const RENAMED_EXPERIMENTAL = Object.freeze({render: 'export'});

/** The old names' full command paths. */
export const RENAMED_PATHS = new Set(
  Object.keys(RENAMED_EXPERIMENTAL).map(old => `experimental ${old}`),
);
