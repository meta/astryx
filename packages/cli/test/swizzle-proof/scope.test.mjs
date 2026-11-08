// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file scope.test.mjs
 * @input A change as the proof reads it: the changed paths (or none when git
 *   cannot read them), whether a toolchain path changed, the component
 *   source that changed, and the run's event
 * @output Proves which targets the swizzle proof checks for each kind of run
 *   (spec:AST-110 FR7)
 * @position Node test of proof.mjs's scope choice; reads no files
 */

import {describe, expect, it} from 'vitest';

import {proofScope} from './proof.mjs';

const component = ['packages/core/src/Button/Button.tsx'];

describe('which targets the swizzle proof checks', () => {
  it('checks nothing when no component source and no toolchain path changed', () => {
    expect(
      proofScope({
        changed: ['docs/README.md'],
        toolchain: undefined,
        relevant: [],
        event: 'pull_request',
      }).mode,
    ).toBe('none');
  });

  it('checks the affected targets of a pull request that changes component source', () => {
    expect(
      proofScope({
        changed: component,
        toolchain: undefined,
        relevant: component,
        event: 'pull_request',
      }).mode,
    ).toBe('affected');
  });

  it("checks the affected targets of main's run, diffed against its parent", () => {
    expect(
      proofScope({
        changed: component,
        toolchain: undefined,
        relevant: component,
        event: 'workflow_dispatch',
      }).mode,
    ).toBe('affected');
  });

  it('checks every target when a toolchain path changed', () => {
    const scope = proofScope({
      changed: ['packages/build/src/babel.js'],
      toolchain: 'packages/build/src/babel.js',
      relevant: [],
      event: 'push',
    });
    expect(scope.mode).toBe('all');
    expect(scope.reason).toContain('packages/build/src/babel.js');
  });

  it('checks every target of a pull request whose change git cannot read', () => {
    const scope = proofScope({
      changed: null,
      toolchain: undefined,
      relevant: [],
      event: 'pull_request',
    });
    expect(scope.mode).toBe('all');
    expect(scope.reason).toMatch(/could not be read/);
  });

  it('checks every target of a local run whose change git cannot read', () => {
    expect(
      proofScope({
        changed: null,
        toolchain: undefined,
        relevant: [],
        event: undefined,
      }).mode,
    ).toBe('all');
  });

  it("checks nothing in main's run when its parent cannot be read, and says the release check proves every target", () => {
    const scope = proofScope({
      changed: null,
      toolchain: undefined,
      relevant: [],
      event: 'workflow_dispatch',
    });
    expect(scope.mode).toBe('none');
    expect(scope.reason).toMatch(/release check/);
  });

  it('checks every target when asked for all of them', () => {
    expect(
      proofScope({
        changed: null,
        toolchain: undefined,
        relevant: [],
        event: 'push',
        all: true,
      }).mode,
    ).toBe('all');
  });
});
