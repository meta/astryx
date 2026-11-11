// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file modalOutlet.shared.test.ts
 * @input Two loads of the modal outlet and input hold modules, as the package
 *   and a swizzled copy of a component each carry one
 * @output Proves a copy reads the global hosts the package marked, and that a
 *   copy's dismissal hold leaves such a host live
 * @position Unit tests for Layer/modalOutlet.ts (spec:AST-003 FR18)
 */

import {afterEach, describe, expect, it, vi} from 'vitest';

afterEach(() => {
  document.body.replaceChildren();
  vi.resetModules();
});

describe('the global hosts a swizzled copy shares', () => {
  it('reads a host the package marked, and its removal', async () => {
    const pkg = await import('./modalOutlet');
    vi.resetModules();
    const copy = await import('./modalOutlet');
    expect(copy).not.toBe(pkg);
    const host = document.createElement('div');
    const unmark = pkg.markModalOutletHost(host);
    expect(copy.isModalOutletHost(host)).toBe(true);
    expect(copy.modalOutletHosts()).toContain(host);
    unmark();
    expect(copy.isModalOutletHost(host)).toBe(false);
  });

  it("leaves a host the package marked live under a copy's dismissal hold of the page", async () => {
    const pkg = await import('./modalOutlet');
    vi.resetModules();
    const copy = await import('./inputHold');
    const host = document.createElement('div');
    const content = document.createElement('div');
    document.body.append(host, content);
    const unmark = pkg.markModalOutletHost(host);
    const release = copy.holdInput(document.body, {
      until: new Promise<void>(() => {}),
      scope: 'layer',
    });
    expect(content.hasAttribute('inert')).toBe(true);
    expect(host.hasAttribute('inert')).toBe(false);
    release();
    unmark();
  });
});
