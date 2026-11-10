// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file shared-identity.test.mjs
 * @input The shipped source of the packages swizzle copies from, and
 *   scripts/shared-identity.baseline.json
 * @output Fails when a module keeps cross-module identity in module scope
 *   (a module-local symbol or registry) that the baseline does not list, or
 *   when the baseline lists one the source no longer has
 *   (spec:AST-110 FR3, FR7)
 * @position Node test over source; needs no build
 */

import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

import {REPO, findAll, findInSource, sharedSlots} from './shared-identity.mjs';

const BASELINE = path.join(REPO, 'scripts/shared-identity.baseline.json');
const FIX =
  'Keep it under a registered key: sharedKey or realmValue from ' +
  'packages/core/src/utils/sharedRealm.ts, createSharedContext for a ' +
  'context, and for a type brand one optional phantom member typed never ' +
  '(spec:AST-110 FR3).';

describe('cross-module identity in module scope (spec:AST-110 FR3)', () => {
  it('flags a module-local symbol brand and passes a shared key', () => {
    const local = findInSource(
      'brand.ts',
      [
        `const brand: unique symbol = Symbol('Brand');`,
        `export interface Branded { readonly [brand]: true }`,
        `export function make(): Branded { return {[brand]: true}; }`,
      ].join('\n'),
    );
    expect(local.map(hit => hit.name)).toEqual(['brand']);
    const shared = findInSource(
      'brand.ts',
      [
        `import {sharedKey} from './sharedRealm';`,
        `const BRAND = sharedKey('brand', 1);`,
        `export interface Branded { readonly '@astryxdesign/core/brand/v1'?: never }`,
        `export function make(): Branded { return {[BRAND]: true} as Branded; }`,
      ].join('\n'),
    );
    expect(shared).toEqual([]);
  });

  it('flags a module-scope registry an exported function reads', () => {
    const hits = findInSource(
      'host.ts',
      [
        `let registered: unknown = null;`,
        `export function registerHost(host: unknown) { registered = host; }`,
      ].join('\n'),
    );
    expect(hits.map(hit => hit.name)).toEqual(['registered']);
  });

  it('flags state an export reaches through a private helper or an export list, including a literal it changes', () => {
    const hits = findInSource(
      'claims.ts',
      [
        `const held = new Map<number, string>();`,
        `const regions: WeakMap<Document, string> = new WeakMap();`,
        `const claims: Record<string, number[]> = {overflow: []};`,
        `function remember(id: number) { held.set(id, 'x'); claims.overflow.push(id); }`,
        `function claim(id: number) { remember(id); }`,
        `export {claim};`,
      ].join('\n'),
    );
    expect(hits.map(hit => [hit.name, hit.why])).toEqual([
      ['held', 'module state the exported claim uses'],
      ['claims', 'module state the exported claim uses'],
      ['regions', 'a per-document store in module scope'],
    ]);
  });

  it('flags state a function the module hands out at load reaches', () => {
    const hits = findInSource(
      'route.ts',
      [
        `import {installRoute} from './other';`,
        `const deferred = new WeakMap<object, string>();`,
        `function announce(scope: object) { deferred.set(scope, 'x'); }`,
        `installRoute({announce});`,
      ].join('\n'),
    );
    expect(hits.map(hit => hit.name)).toEqual(['deferred']);
  });

  it('lists every hit in the baseline, and nothing the source no longer has', () => {
    const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8')).entries;
    const hits = findAll();
    const found = new Set(hits.map(hit => `${hit.file}:${hit.name}`));
    const unlisted = hits
      .filter(hit => !(`${hit.file}:${hit.name}` in baseline))
      .map(hit => `${hit.file}:${hit.name}: ${hit.why}. ${FIX}`);
    const stale = Object.keys(baseline).filter(key => !found.has(key));
    expect(unlisted, 'new module-scope identity').toEqual([]);
    expect(
      stale,
      'baseline entries the source no longer has; delete them',
    ).toEqual([]);
  });

  it('names every shared slot with a literal name and version, once', () => {
    // A slot's name and version are its identity across copies: a computed
    // name could change with a file move, and two calls with one name would
    // share a slot by accident. A move keeps the name, or bumps the version.
    const slots = sharedSlots();
    expect(
      slots
        .filter(slot => slot.slot == null)
        .map(slot => `${slot.file}:${slot.line} ${slot.helper}`),
      'shared slots named without a literal name and version',
    ).toEqual([]);
    const seen = new Map();
    const repeated = [];
    for (const slot of slots) {
      if (slot.slot == null) continue;
      const first = seen.get(slot.slot);
      if (first)
        repeated.push(`${slot.slot}: ${first} and ${slot.file}:${slot.line}`);
      else seen.set(slot.slot, `${slot.file}:${slot.line}`);
    }
    expect(repeated, 'shared slots named twice').toEqual([]);
  });

  it('gives every allowed entry a reason and every open entry a fix group', () => {
    const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8')).entries;
    for (const [key, entry] of Object.entries(baseline)) {
      if (entry.status === 'allowed') {
        expect(entry.reason, key).toMatch(/\S/);
      } else {
        expect(entry.status, key).toBe('open');
        expect(entry.group, key).toMatch(/\S/);
      }
    }
  });
});
