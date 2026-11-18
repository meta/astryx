// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file sharedRealm.ts
 * @input A registered name and its protocol version
 * @output One value per key in the JavaScript realm, shared by every copy of
 *   Core, and the shapes that hold it: state, maps, stores, brands and
 *   sequences
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

/**
 * One value per page under a registered name: a counter, a flag, or an object
 * that holds several. Every copy of Core that asks for the same name and
 * version gets the same value. Name it `<folder>/<file>/<binding>` in kebab
 * case, as a literal; the name is the slot's identity, so a file move keeps
 * it, and a change to the value's shape bumps the version.
 */
export function sharedState<T>(
  name: string,
  version: number,
  create: () => T,
): T {
  return realmValue(sharedKey(name, version), create);
}

/** A map shared by every copy of Core under a registered name. */
export function sharedMap<K, V>(name: string, version: number): Map<K, V> {
  return sharedState(name, version, () => new Map<K, V>());
}

/** A weak map shared by every copy of Core, such as a per-document store. */
export function sharedWeakMap<K extends WeakKey, V>(
  name: string,
  version: number,
): WeakMap<K, V> {
  return sharedState(name, version, () => new WeakMap<K, V>());
}

/** A weak set shared by every copy of Core, such as a set of registered values. */
export function sharedWeakSet<T extends WeakKey>(
  name: string,
  version: number,
): WeakSet<T> {
  return sharedState(name, version, () => new WeakSet<T>());
}

/** A value with listeners, in the shape `useSyncExternalStore` reads. */
export interface SharedStore<T> {
  get: () => T;
  set: (value: T) => void;
  subscribe: (listener: () => void) => () => void;
}

/**
 * A value and its listeners shared by every copy of Core. A `set` from one
 * copy reaches the listeners of every copy.
 */
export function sharedStore<T>(
  name: string,
  version: number,
  initial: T,
): SharedStore<T> {
  return sharedState(name, version, () => {
    let value = initial;
    const listeners = new Set<() => void>();
    return {
      get: () => value,
      set: next => {
        if (Object.is(next, value)) {
          return;
        }
        value = next;
        for (const listener of [...listeners]) {
          listener();
        }
      },
      subscribe: listener => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    };
  });
}

/**
 * The type side of a shared brand: one member that is never present at
 * runtime. It is required, so only code that casts makes a branded value, and
 * its name is the same in the package and a swizzled copy.
 */
export type SharedBrand<Name extends string> = {
  readonly [K in `@astryxdesign/core/${Name}`]: never;
};

/** Marks and reads a value under a brand every copy of Core shares. */
export interface SharedBrandKey<V> {
  /** The registered key, for an object literal: `{[brand.key]: value}`. */
  readonly key: symbol;
  /** The branded value of `target`, or undefined when it carries none. */
  read: (target: unknown) => V | undefined;
}

/**
 * A brand every copy of Core reads the same way, for values one copy makes and
 * another copy recognizes, such as a capability a hook returns.
 */
export function sharedBrand<V>(
  name: string,
  version: number,
): SharedBrandKey<V> {
  const key = sharedKey(name, version);
  return {
    key,
    read: target =>
      typeof target === 'object' && target !== null && key in target
        ? (target as {readonly [key: symbol]: V})[key]
        : undefined,
  };
}

/** The next number of a sequence every copy of Core shares, such as element ids. */
export function sharedSequence(name: string, version: number): () => number {
  const counter = sharedState(name, version, () => ({next: 0}));
  return () => {
    counter.next += 1;
    return counter.next;
  };
}

/**
 * Test-only: forget every shared value whose name starts with `prefix`, as on
 * a fresh page. With no prefix it forgets them all.
 */
export function resetSharedStateForTest(prefix = ''): void {
  const realm = globalThis as typeof globalThis & {[key: symbol]: unknown};
  const start = `@astryxdesign/core/${prefix}`;
  for (const key of Object.getOwnPropertySymbols(realm)) {
    if (key.description?.startsWith(start)) {
      Reflect.deleteProperty(realm, key);
    }
  }
}
