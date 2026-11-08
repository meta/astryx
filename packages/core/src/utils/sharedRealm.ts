// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file sharedRealm.ts
 * @input A registered name and its protocol version
 * @output One value per key in the JavaScript realm, shared by every copy of
 *   Core
 * @position Shared runtime state for stores and contexts; no React and no
 *   client directive, so server-safe modules can use it
 */

/**
 * The registered key of a shared value. The version names the value's shape.
 * Change it when a copy built against the old shape cannot read the value.
 * Each copy then keeps its own value.
 */
export function sharedKey(name: string, version: number): symbol {
  return Symbol.for(`@astryxdesign/core/${name}/v${version}`);
}

/**
 * The value under `key` in this JavaScript realm, created on first use. Every
 * copy of Core that asks for the same key gets the same value.
 *
 * The key names the protocol version, so a value found under it has this
 * protocol's shape. `accepts` guards against a key collision: a value it
 * rejects is left in place, and this copy keeps a value of its own.
 */
export function realmValue<T>(
  key: symbol,
  create: () => T,
  accepts: (value: unknown) => boolean = () => true,
): T {
  const realm = globalThis as typeof globalThis & {[key: symbol]: unknown};
  if (Object.hasOwn(realm, key)) {
    const existing = realm[key];
    return accepts(existing) ? (existing as T) : create();
  }
  const value = create();
  realm[key] = value;
  return value;
}
