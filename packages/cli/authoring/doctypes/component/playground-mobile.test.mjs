// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `playground.mobile`: a component whose layout changes at phone width
 * declares the props of its phone render, merged over `defaults`; the
 * authoring contract types it and AppShell declares its mobile layout there.
 *
 * @position authoring doctypes — tests
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {describe, expect, it} from 'vitest';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../..');

describe('playground.mobile', () => {
  it('is typed in the authoring contract and described in the component doc type', () => {
    const type = fs.readFileSync(path.join(HERE, '../base/type.ts'), 'utf8');
    expect(type).toMatch(/\n {2}mobile\?: Record<string, unknown>;/);
    const doc = fs.readFileSync(path.join(HERE, 'component.doc.mjs'), 'utf8');
    expect(doc).toMatch(/`mobile` \(props merged over `defaults`/);
  });

  it("holds AppShell's mobile layout beside its playground defaults", async () => {
    const mod = await import(
      pathToFileURL(
        path.join(ROOT, 'packages/core/src/AppShell/AppShell.doc.mjs'),
      ).href
    );
    const playground = (mod.default ?? mod.docs).playground;
    expect(playground.mobile.mobileNav).toEqual({
      defaultIsMobile: true,
      isOpen: true,
    });
    // The open menu draws the top bar's links as its own rows.
    expect(playground.mobile.topNav.props.startContent).toHaveLength(2);
    // (The docsite playground's own defaults stay as they are.)
    expect(playground.defaults).not.toHaveProperty('mobileNav');
  });
});
