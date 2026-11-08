// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Direct-API tests for the `theme targets` leaf. Runs against the real
 * core docs, so it doubles as a guard that the themeable surface stays
 * readable and shaped as `theme.targets` promises.
 */

import {describe, it, expect} from 'vitest';
import {themeTargets} from './targets.mjs';

describe('themeTargets (api/theme/targets)', () => {
  it('returns a theme.targets envelope covering the whole surface', async () => {
    const result = await themeTargets();
    expect(result.type).toBe('theme.targets');
    expect(result.data.filter).toBeNull();
    expect(result.data.targets.length).toBeGreaterThan(100);
    expect(result.data.componentCount).toBeGreaterThan(50);
    const allowedKeys = new Set([
      'className',
      'component',
      'key',
      'props',
      'states',
    ]);
    for (const target of result.data.targets) {
      expect(target).toMatchObject({
        className: expect.any(String),
        component: expect.any(String),
        key: expect.any(String),
        props: expect.any(Array),
        states: expect.any(Array),
      });
      expect(Object.keys(target).filter(key => !allowedKeys.has(key))).toEqual(
        [],
      );
    }
  }, 60_000);

  it('scopes to one component by name', async () => {
    const {data} = await themeTargets('Switch');
    expect(data.filter).toBe('Switch');
    expect(data.componentCount).toBe(1);
    expect(data.targets.map(t => t.key)).toEqual([
      'switch',
      'switch-field',
      'switch-label',
      'switch-thumb',
    ]);
  }, 60_000);

  it.each(['table-header', 'table-body', 'table-footer'])(
    '%s appears once under the Table owner',
    async target => {
      const {data} = await themeTargets('Table');
      const matches = data.targets.filter(entry => entry.key === target);
      expect(data.componentCount).toBe(1);
      expect(matches).toHaveLength(1);
      expect(matches[0]).toMatchObject({
        key: target,
        component: 'Table',
      });
    },
    60_000,
  );

  // Half the system's keys contain "button" (chat-send-button, toggle-button,
  // …). A component name has to mean the component, or `theme targets Button`
  // answers a different question than `component Button` and the two views
  // look like they disagree.
  it('prefers an exact component name over a substring match', async () => {
    const {data} = await themeTargets('Button');
    expect(data.targets.map(t => t.key)).toEqual(['button']);
  }, 60_000);

  // This command answers "which theme slot paints the switch thumb?" — a
  // question you can only ask by the part, not the component, until you
  // already know which component owns it.
  it('searches keys by substring, across components', async () => {
    const {data} = await themeTargets('thumb');
    expect(data.componentCount).toBeGreaterThan(1);
    expect(data.targets.map(t => t.key)).toContain('switch-thumb');
    for (const t of data.targets) expect(t.key).toContain('thumb');
  }, 60_000);

  it('rejects a filter that matches nothing, with components to try', async () => {
    await expect(themeTargets('nosuchthing')).rejects.toMatchObject({
      code: 'ERR_UNKNOWN_COMPONENT',
    });
  }, 60_000);
});
