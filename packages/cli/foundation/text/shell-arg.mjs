// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file One command-line word for a printed command: a value as written when
 * the shell reads it as one plain word, else single-quoted, so a printed
 * command runs as printed and never substitutes anything.
 */

/**
 * A value as one shell word.
 * @param {string} value
 * @returns {string}
 */
export function shellArg(value) {
  if (/^[A-Za-z0-9@/._-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
