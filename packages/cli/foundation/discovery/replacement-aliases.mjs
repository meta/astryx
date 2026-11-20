// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The names a replaced doc leaves behind.
 *
 * When one doc replaces another under a new name, the old name keeps
 * answering: it points at the doc that replaced it. A name replaced twice
 * points at the newest doc, so it never answers with one that is itself
 * gone. The docs catalog keeps a topic's old names here, and icon
 * definitions keep a definition's old names here, so both follow the same
 * chain the same way.
 *
 * @input pairs of (replaced name, replacing name), in the order they apply
 * @output each old name's current name, and the old names of a name
 * @position packages/cli/foundation/discovery — shared by the docs catalog
 *   and icon definition discovery
 */

export class ReplacementAliases {
  /** @type {Map<string, string>} old key → the key that replaced it */
  #aliases = new Map();
  /** @type {(name: string) => string} */
  #key;

  /**
   * @param {(name: string) => string} [key] how a name is compared: the
   *   docs catalog compares topics without case, icon definitions as typed.
   */
  constructor(key = name => name) {
    this.#key = key;
  }

  /** The number of old names. */
  get size() {
    return this.#aliases.size;
  }

  /**
   * Record that `replacement` took the place of `replaced`. A name that
   * already pointed at `replaced` now points at `replacement`, so a doc
   * renamed twice keeps every name it has ever answered to.
   * @param {string} replaced
   * @param {string} replacement
   */
  record(replaced, replacement) {
    const from = this.#key(replaced);
    const to = this.#key(replacement);
    if (from === to) return;
    this.#aliases.set(from, to);
    for (const [old, current] of this.#aliases) {
      if (current === from) this.#aliases.set(old, to);
    }
  }

  /**
   * Follow a name's chain to the first key `exists` accepts. A chain is at
   * most as long as the number of old names, and a cycle can only come from
   * a bug, so the walk is bounded either way.
   * @param {string} name
   * @param {(key: string) => boolean} exists
   * @returns {string | undefined} the key that exists, or undefined
   */
  resolve(name, exists) {
    let key = this.#key(name);
    for (let hops = 0; hops <= this.#aliases.size; hops++) {
      if (exists(key)) return key;
      const next = this.#aliases.get(key);
      if (next == null) return undefined;
      key = next;
    }
    return undefined;
  }

  /**
   * Every old name that now answers with `name`.
   * @param {string} name
   * @returns {string[]}
   */
  aliasesOf(name) {
    // Recorded out of order, an old name can point at another old name, so
    // the walk follows every name that reaches this one.
    const found = new Set();
    const next = [this.#key(name)];
    while (next.length > 0) {
      const key = /** @type {string} */ (next.pop());
      for (const [old, current] of this.#aliases) {
        if (current === key && !found.has(old) && old !== this.#key(name)) {
          found.add(old);
          next.push(old);
        }
      }
    }
    return [...found];
  }
}
