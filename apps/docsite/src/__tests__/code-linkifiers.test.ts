// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Unit tests for the inline-code linkifiers.
 *
 * Run: pnpm -F @astryxdesign/docsite test
 */

import {describe, it, expect} from 'vitest';
import {linkifyCode} from '../components/codeLinkifiers';
import {docTopics, docsTreeRoutes} from '../generated/docsRegistry';
import {components} from '../generated/componentRegistry';

describe('doc topic linkifier', () => {
  it.each([
    ['astryx docs tokens', '/docs/tokens'],
    ['astryx docs styling-libraries', '/docs/styling-libraries'],
    ['npx astryx docs icons', '/docs/icons'],
    ['npx @astryxdesign/cli docs icons', '/docs/icons'],
    ['npx @astryxdesign/cli@0.7.2 docs global', '/docs/global'],
    ['  astryx docs theme  ', '/docs/theme'],
    // The docs index, for a bare command.
    ['astryx docs', '/docs'],
    // A section argument and CLI-only flags still belong to the topic page.
    ['astryx docs tokens spacing', '/docs/tokens'],
    ['astryx docs styling --dense', '/docs/styling'],
    ['astryx docs styling --zh', '/docs/styling'],
  ])('links %s', (code, href) => {
    expect(linkifyCode(code)).toBe(href);
  });

  it('links every topic the site serves', () => {
    for (const {topic} of docTopics) {
      expect(linkifyCode(`astryx docs ${topic}`)).toBe(`/docs/${topic}`);
    }
  });

  it.each([
    // A renamed topic degrades to plain code rather than a 404.
    ['astryx docs nonexistent-topic'],
    // Other commands have no one-to-one page.
    ['astryx component Button'],
    ['astryx theme build'],
    ['astryx upgrade --apply'],
    // Ordinary backticked prose and identifiers.
    ['xstyle'],
    ['--color-text-primary'],
    ['See astryx docs tokens for the full reference'],
    ['other-cli docs tokens'],
    [''],
  ])('leaves %s as plain code', code => {
    expect(linkifyCode(code)).toBeNull();
  });
});

describe('component name linkifier', () => {
  it.each([
    ['Button', '/components/Button'],
    [
      'InternationalizationProvider',
      '/components/InternationalizationProvider',
    ],
    [
      '<InternationalizationProvider>',
      '/components/InternationalizationProvider',
    ],
    ['<Button/>', '/components/Button'],
    ['<Button />', '/components/Button'],
    ['  <Popover>  ', '/components/Popover'],
    // XDS-prefixed aliases map to the unprefixed page, like the changelog's
    // prose linkifier.
    ['XDSButton', '/components/Button'],
    ['<XDSButton>', '/components/Button'],
  ])('links %s', (code, href) => {
    expect(linkifyCode(code)).toBe(href);
  });

  it('links every documented component and hook name', () => {
    for (const {name} of Object.values(components).flat()) {
      expect(linkifyCode(name)).toBe(`/components/${name}`);
    }
  });

  it.each([
    // Case matters: `button` is the HTML element, `Button` the component.
    ['button'],
    ['<dialog>'],
    // A name with anything attached is a snippet, not a reference.
    ['Popover API'],
    ['<Button open>'],
    ['Button.props'],
    ['Crimson Text'],
    ['NotARealComponent'],
    ['<NotARealComponent>'],
    ['XDSNotARealComponent'],
  ])('leaves %s as plain code', code => {
    expect(linkifyCode(code)).toBeNull();
  });
});

/** Every backticked `astryx docs ...` reference in a chunk of authored data. */
function docReferences(json: string): string[] {
  const found = [...json.matchAll(/`((?:npx )?astryx docs[^`]*)`/g)];
  return [...new Set(found.map(m => m[1]))];
}

/**
 * Guards the failure mode the linkifier cannot catch at runtime: if a topic is
 * renamed, an unresolvable reference degrades to plain code instead of 404ing,
 * so nobody notices the cross-reference went stale.
 *
 * Scanning the serialized registries rather than walking their shapes keeps
 * this short and covers every authored field, not just the ones rendered
 * today.
 */
describe('doc references in shipped content', () => {
  const corpora = {
    'doc topics': JSON.stringify(docTopics),
    'component docs': JSON.stringify(components),
  };

  it.each(Object.entries(corpora))('scans %s', (_name, json) => {
    expect(docReferences(json).length).toBeGreaterThan(0);
  });

  it('links every reference to a page the site serves', () => {
    // A docs-tree route the site has no page for yet (a namespace, a command
    // or API doc) stays plain code, and still opens in `astryx docs`; any
    // other unlinked reference is stale.
    const treeRoutes = new Set(docsTreeRoutes);
    const inTree = (ref: string) =>
      treeRoutes.has(ref.replace(/^(?:npx )?astryx docs /, '').split(' ')[0]);
    const all = Object.values(corpora).flatMap(docReferences);
    expect(all.filter(ref => linkifyCode(ref) == null && !inTree(ref))).toEqual(
      [],
    );
    expect(treeRoutes.has('cli/commands/upgrade')).toBe(true);
  });
});
