// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Every Core doc has a named home in the docs tree (spec:AST-046 FR12).
 *
 * A reader sees a doc's home in its path (`Guides › Getting started`) and in
 * its Up move. A flat Core topic sits in Guides or Foundations by the
 * category it declares, so a new topic with no category, or one the levels
 * do not know, fails here instead of landing in a catch-all. The integration
 * guides and their field reference live under `authoring`, and the routes
 * they left name where they went.
 */

import {describe, expect, it} from 'vitest';
import {docs} from './docs.mjs';
import {TOPIC_LEVELS} from '../../foundation/doc-compiler/tree.mjs';

const CLI = '@astryxdesign/cli';
const SLOW = 60_000;

describe('every Core doc has a named home', () => {
  it(
    'puts each flat Core topic in Guides or Foundations by its category',
    async () => {
      const list = await docs();
      const core = list.data.filter(topic => topic.package === CLI);
      expect(core.length).toBeGreaterThan(10);
      /** @type {string[]} */
      const unfiled = [];
      for (const topic of core) {
        const read = await docs(topic.topic);
        const {category} = read.data;
        if (category !== 'guide' && category !== 'foundations') {
          unfiled.push(`${topic.topic} (category ${String(category)})`);
          continue;
        }
        const level =
          category === 'foundations'
            ? TOPIC_LEVELS.foundations
            : TOPIC_LEVELS.guides;
        expect(read.data.links.up, topic.topic).toBe(
          `astryx docs ${level.route}`,
        );
      }
      expect(unfiled, 'Core topics with no home: give each a category').toEqual(
        [],
      );
    },
    SLOW,
  );

  it(
    'lists each level under a plain name, and no catch-all',
    async () => {
      const list = await docs();
      const roots = (list.meta.namespaces ?? []).map(entry => entry.topic);
      expect(roots).toEqual(expect.arrayContaining(['guides', 'foundations']));
      expect(roots).not.toContain('unorganized');
      const guides = await docs('guides');
      expect(guides.data).toMatchObject({route: 'guides', title: 'Guides'});
      expect(guides.data.slots[0].children.map(child => child.route)).toEqual(
        expect.arrayContaining(['getting-started', 'principles', 'theme']),
      );
      const foundations = await docs('foundations');
      expect(foundations.data.title).toBe('Foundations');
      expect(
        foundations.data.slots[0].children.map(child => child.route),
      ).toEqual(expect.arrayContaining(['color', 'icons', 'spacing']));
      await expect(docs('unorganized')).rejects.toMatchObject({
        code: 'ERR_UNKNOWN_TOPIC',
      });
    },
    SLOW,
  );

  it(
    'keeps everything for integration authors under authoring, and names where an old route went',
    async () => {
      const authoring = await docs('authoring');
      expect(authoring.data).toMatchObject({
        route: 'authoring',
        kind: 'namespace',
        breadcrumb: [],
        links: {up: 'astryx docs'},
      });
      const children = authoring.data.slots.flatMap(slot =>
        slot.children.map(child => child.route),
      );
      expect(children).toEqual(
        expect.arrayContaining([
          'authoring/quick-start',
          'authoring/building-blocks',
          'authoring/ship',
          'authoring/help',
          'authoring/field-reference',
        ]),
      );
      // Every field reference section still opens from the namespace by its
      // key, as `astryx docs authoring <name>` did on the topic (FR13).
      const reference = await docs('authoring/field-reference', undefined, {
        index: true,
      });
      const keys = reference.data.sections.map(section => section.id);
      expect(keys.length).toBeGreaterThan(15);
      for (const key of keys) {
        const section = await docs('authoring', key);
        expect(section.type, key).toBe('docs.detail.section');
        expect(section.data.id, key).toBe(key);
      }
      for (const [old, now] of [
        ['cli/integrations', 'authoring'],
        ['cli/integrations/quick-start', 'authoring/quick-start'],
        ['cli/integrations/ship/publishing', 'authoring/ship/publishing'],
      ]) {
        const error = await docs(old).catch(e => e);
        expect(error).toMatchObject({
          code: 'ERR_UNKNOWN_TOPIC',
          message: expect.stringContaining(`It moved to "${now}"`),
        });
        // The new route comes first, ahead of the suggestions any unknown
        // route gets (FR6).
        expect(error.suggestions[0]).toMatchObject({name: now});
      }
    },
    SLOW,
  );
});
