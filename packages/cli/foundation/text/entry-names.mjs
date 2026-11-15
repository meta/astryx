// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How an entry's name is written: a component's name is PascalCase, a
 * prop's is camelCase. Discovery reads component exports by it; search
 * reads a typed identifier by it.
 *
 * @input a name or a typed identifier
 * @output whether it is written as a component's name
 * @position packages/cli/foundation/text — naming rules shared by discovery and search
 */

/** A component's name: a capital letter, then letters, digits, `_` or `$`. */
export const COMPONENT_NAME_RE = /^[A-Z][\w$]*$/;
