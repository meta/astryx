// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file layerHost.test.ts
 * @input Tests resolveLayerPortalTarget
 * @output Coverage for when and where a layer is portaled
 * @position Test for /packages/core/src/Layer/layerHost.ts
 */

import {describe, it, expect, afterEach} from 'vitest';
import {resolveLayerPortalTarget} from './layerHost';

function mount(html: string): HTMLElement {
  const root = document.createElement('div');
  root.id = 'root';
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
}

afterEach(() => {
  document.getElementById('root')?.remove();
});

describe('resolveLayerPortalTarget', () => {
  it('returns null without an inline parent', () => {
    expect(resolveLayerPortalTarget(null)).toBeNull();
  });

  it('returns null when the intended inline position is already safe', () => {
    const root = mount(
      '<div id="host"><template id="marker"></template></div>',
    );
    const target = resolveLayerPortalTarget(root.querySelector('#host'));

    expect(target).toBeNull();
  });

  it.each([
    ['paragraph', '<p><template></template></p>'],
    ['heading', '<h2><template></template></h2>'],
    ['link', '<a href="#x"><template></template></a>'],
    ['button', '<button><template></template></button>'],
    ['label', '<label><template></template></label>'],
    ['data', '<data><template></template></data>'],
    ['definition', '<dfn><template></template></dfn>'],
    ['meter', '<meter><template></template></meter>'],
    ['output', '<output><template></template></output>'],
    ['progress', '<progress><template></template></progress>'],
    [
      'nested inline formatting',
      '<p><em><b><template id="marker"></template></b></em></p>',
    ],
  ])('walks out of a %s', (_name, markup) => {
    const root = mount(`<div id="host">${markup}</div>`);
    const marker = root.querySelector('template');
    const target = resolveLayerPortalTarget(marker?.parentElement ?? null);

    expect(target).toBe(root.querySelector('#host'));
  });

  it('walks past a safe wrapper nested inside an unsafe ancestor', () => {
    const root = mount(
      '<div id="host"><a href="#x"><div id="inline"><template></template></div></a></div>',
    );
    const target = resolveLayerPortalTarget(root.querySelector('#inline'));

    expect(target).toBe(root.querySelector('#host'));
  });

  it.each([
    [
      'table row',
      '<table><tbody><tr><template></template></tr></tbody></table>',
    ],
    ['list', '<ul><template></template></ul>'],
    ['select', '<select><template></template></select>'],
    ['heading group', '<hgroup><template></template></hgroup>'],
  ])('walks out of a structural %s', (_name, markup) => {
    const root = mount(`<div id="host">${markup}</div>`);
    const marker = root.querySelector('template');
    const target = resolveLayerPortalTarget(marker?.parentElement ?? null);

    expect(target).toBe(root.querySelector('#host'));
  });

  it('keeps a safe layer position inside its nearest dialog', () => {
    const root = mount(
      '<div id="host"><table><tbody><tr><td><dialog><div id="inline"><template></template></div></dialog></td></tr></tbody></table></div>',
    );
    const target = resolveLayerPortalTarget(root.querySelector('#inline'));

    expect(target).toBeNull();
  });

  it('walks out of unsafe hosts without crossing the nearest dialog', () => {
    const root = mount(
      '<div id="host"><table><tbody><tr><td><dialog id="dialog"><p><span id="inline"><template></template></span></p></dialog></td></tr></tbody></table></div>',
    );
    const target = resolveLayerPortalTarget(root.querySelector('#inline'));

    expect(target).toBe(root.querySelector('#dialog'));
  });

  it('stops at the nearest safe ancestor rather than the body', () => {
    const root = mount(
      '<section id="outer"><li id="host"><p><span id="t">t</span></p></li></section>',
    );
    const marker = root.querySelector('#t');
    const target = resolveLayerPortalTarget(marker?.parentElement ?? null);

    // The nearest safe ancestor keeps the layer inside the trigger's theme
    // scope and next to it in the tab order.
    expect(target).toBe(root.querySelector('#host'));
    expect(target).not.toBe(document.body);
  });
});
