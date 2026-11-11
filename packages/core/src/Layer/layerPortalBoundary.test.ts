// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file layerPortalBoundary.test.ts
 * @input The portal resolver and the integration boundary protocol.
 * @output Corrective targets avoid managed DOM without changing safe inline hosting.
 * @position Focused ownership-boundary regression tests.
 */

import {afterEach, describe, expect, it} from 'vitest';
import {resolveLayerPortalTarget} from './layerHost';
import {layerRootProps} from '../privateAttributes/layerRoot.stylex';
import {rendererManagedRootProps} from '../privateAttributes/layerPortalBoundary.stylex';
const roots: HTMLElement[] = [];
function mount(html: string) {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.appendChild(root);
  roots.push(root);
  const managed = root.querySelector('#managed');
  if (managed) {
    for (const [name, value] of Object.entries(rendererManagedRootProps)) {
      managed.setAttribute(name, value);
    }
  }
  const popup = root.querySelector('#popup');
  if (popup) {
    for (const [name, value] of Object.entries(layerRootProps)) {
      popup.setAttribute(name, value);
    }
  }
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) {
    root.remove();
  }
});
describe('integration portal boundary', () => {
  it('moves a corrective portal outside the managed root', () => {
    const root = mount(
      '<section id="safe"><div id="managed"><p><template></template></p></div></section>',
    );
    expect(
      resolveLayerPortalTarget(
        root.querySelector('template')?.parentElement ?? null,
      ),
    ).toBe(root.querySelector('#safe'));
  });
  it('does not move safe inline JSX merely because it is inside a managed tree', () => {
    const root = mount(
      '<div id="managed"><div id="inline"><template></template></div></div>',
    );
    expect(resolveLayerPortalTarget(root.querySelector('#inline'))).toBeNull();
  });
  it('does not infer ownership from a non-editable wrapper', () => {
    const root = mount(
      '<div contenteditable="false" id="inline"><template></template></div>',
    );
    expect(resolveLayerPortalTarget(root.querySelector('#inline'))).toBeNull();
  });
  it('keeps corrections within the nearest native popup focus owner', () => {
    const root = mount(
      '<div id="managed"><div id="popup" popover="auto"><span><template></template></span></div></div>',
    );
    expect(
      resolveLayerPortalTarget(
        root.querySelector('template')?.parentElement ?? null,
      ),
    ).toBe(root.querySelector('#popup'));
  });
  it('still escapes an unsafe link above a fixed layer root', () => {
    const root = mount(
      '<a href="#test"><div id="popup"><span><template></template></span></div></a>',
    );
    expect(
      resolveLayerPortalTarget(
        root.querySelector('template')?.parentElement ?? null,
      ),
    ).toBe(root);
  });

  it('respects an older managed root after escaping an unsafe ancestor above a layer', () => {
    const root = mount(
      '<section id="safe"><div id="managed"><a href="#test"><div id="popup"><span><template></template></span></div></a></div></section>',
    );
    expect(
      resolveLayerPortalTarget(
        root.querySelector('template')?.parentElement ?? null,
      ),
    ).toBe(root.querySelector('#safe'));
  });

  it('keeps corrections within a native dialog', () => {
    const root = mount(
      '<dialog id="dialog"><div id="managed"><p><template></template></p></div></dialog>',
    );
    expect(
      resolveLayerPortalTarget(
        root.querySelector('template')?.parentElement ?? null,
      ),
    ).toBe(root.querySelector('#dialog'));
  });
});
