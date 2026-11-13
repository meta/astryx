// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Fast PR accessibility scope contracts.
 * @input Exact/invalid analysis fixtures and public component ownership
 * @output No full-suite fallback, qualified owners, and normalized umbrella coverage
 * @position Regression tests for the PR-only accessibility scope projection
 */

import fs from 'node:fs';
import {describe, expect, it} from 'vitest';
import {resolvePrA11yComponents} from './a11y-pr-scope.mjs';
import {
  buildStoryComponentRoutes,
  storyIdsForComponentFilters,
  unresolvedComponentFilters,
} from '../../apps/storybook/rtl-audit/rtl-audit-coverage.mjs';
import storyIdentity from './lib/a11y-story-identity.js';

const analysis = overrides => ({
  diffMode: 'three-dot',
  newComponentOwners: [],
  modifiedComponentOwners: [],
  unresolvedComponentSources: [],
  forceFullComponentAudits: false,
  ...overrides,
});

describe('fast PR accessibility scope', () => {
  it('keeps changed owners qualified and deduplicated even for a broad PR', () => {
    expect(
      resolvePrA11yComponents(
        analysis({
          newComponentOwners: ['charts/Chart', 'core/Button'],
          modifiedComponentOwners: ['core/Button', 'lab/Chart'],
          forceFullComponentAudits: true,
        }),
      ),
    ).toEqual(['charts/Chart', 'core/Button', 'lab/Chart']);
  });

  it.each([false, true])(
    'returns an explicit empty set, never the whole roster (broad=%s)',
    forceFullComponentAudits => {
      expect(
        resolvePrA11yComponents(analysis({forceFullComponentAudits})),
      ).toEqual([]);
    },
  );

  it('routes grouped exports through their actual component and umbrella stories', () => {
    // Titles/IDs from the checked-in Chat, ChatLayout, ChatComposer and Button
    // pattern stories. Exercise the same route matching the axe consumer uses.
    const routes = buildStoryComponentRoutes({
      stories: [
        {id: 'core-chat--mixed-content', title: 'Core/Chat'},
        {id: 'core-chatlayout--default', title: 'Core/ChatLayout'},
        {id: 'core-chatcomposer--default', title: 'Core/ChatComposer'},
        {
          id: 'a11y-button-pattern--chat-send-default',
          title: 'A11y/Button Pattern',
        },
        {id: 'core-button--default', title: 'Core/Button'},
      ],
      targets: JSON.parse(
        fs.readFileSync(
          new URL(
            '../../apps/storybook/rtl-audit/targets.json',
            import.meta.url,
          ),
          'utf8',
        ),
      ),
      publicComponentsByPackage: {
        core: ['ChatLayout', 'ChatComposer', 'ChatSendButton', 'Button'],
      },
    }).map(route => ({
      ...route,
      component: storyIdentity.ownerForA11yStory(route.id) ?? route.component,
    }));
    const result = resolvePrA11yComponents(
      analysis({unresolvedComponentSources: ['core/Chat']}),
      process.cwd(),
      routes,
    );
    expect(result).toEqual([
      'core/Chat',
      'core/ChatComposer',
      'core/ChatLayout',
      'core/ChatSendButton',
    ]);
    expect(unresolvedComponentFilters(routes, result)).toEqual([]);
    expect(storyIdsForComponentFilters(routes, result)).toEqual([
      'core-chat--mixed-content',
      'core-chatlayout--default',
      'core-chatcomposer--default',
      'a11y-button-pattern--chat-send-default',
    ]);
    // Red arm: exported names alone made the consumer fail before running axe.
    expect(
      unresolvedComponentFilters(routes, [
        'core/ChatMessage',
        'core/ChatMessageBubble',
      ]),
    ).toEqual(['core/ChatMessage', 'core/ChatMessageBubble']);
    expect(() =>
      resolvePrA11yComponents(
        analysis({unresolvedComponentSources: ['core/Chat']}),
        process.cwd(),
        routes.filter(route => route.component !== 'core/Chat'),
      ),
    ).toThrow('No scoped Storybook route');
  });

  it('audits Lab Chat additions through the Chat umbrella without selecting other Lab stories', () => {
    const routes = buildStoryComponentRoutes({
      stories: [
        {id: 'lab-chatadditions--reactions', title: 'Lab/ChatAdditions'},
        {
          id: 'lab-chatadditions--typing-and-unread',
          title: 'Lab/ChatAdditions',
        },
        {id: 'lab-chatadditions--emoji-picker', title: 'Lab/ChatAdditions'},
        {id: 'lab-stat--showcase', title: 'Lab/Stat'},
      ],
      publicComponentsByPackage: {
        lab: [
          'ChatEmojiPicker',
          'ChatReactionBar',
          'ChatTypingIndicator',
          'ChatUnreadDivider',
          'Stat',
        ],
      },
    }).map(route => ({
      ...route,
      component: storyIdentity.ownerForA11yStory(route.id) ?? route.component,
    }));
    const chatScope = resolvePrA11yComponents(
      analysis({unresolvedComponentSources: ['lab/Chat']}),
      process.cwd(),
      routes,
    );
    expect(chatScope).toEqual(['lab/Chat']);
    expect(unresolvedComponentFilters(routes, chatScope)).toEqual([]);
    expect(storyIdsForComponentFilters(routes, chatScope)).toEqual([
      'lab-chatadditions--reactions',
      'lab-chatadditions--typing-and-unread',
      'lab-chatadditions--emoji-picker',
    ]);

    const statScope = resolvePrA11yComponents(
      analysis({modifiedComponentOwners: ['lab/Stat']}),
      process.cwd(),
      routes,
    );
    expect(statScope).toEqual(['lab/Stat']);
    expect(storyIdsForComponentFilters(routes, statScope)).toEqual([
      'lab-stat--showcase',
    ]);
  });

  it('routes NavHeadingMenu through its normalized NavMenu umbrella', () => {
    const routes = buildStoryComponentRoutes({
      stories: [
        {id: 'core-navmenu--default', title: 'Core/NavMenu'},
        {id: 'core-button--default', title: 'Core/Button'},
      ],
      publicComponentsByPackage: {core: ['NavHeadingMenu', 'Button']},
    });
    expect(routes[0]).toEqual({
      id: 'core-navmenu--default',
      component: 'core/navmenu',
    });
    const source = analysis({unresolvedComponentSources: ['core/NavMenu']});
    const result = resolvePrA11yComponents(source, process.cwd(), routes);
    expect(result).toEqual(['core/NavMenu']);
    expect(unresolvedComponentFilters(routes, result)).toEqual([]);
    expect(storyIdsForComponentFilters(routes, result)).toEqual([
      'core-navmenu--default',
    ]);
    expect(() =>
      resolvePrA11yComponents(source, process.cwd(), routes.slice(1)),
    ).toThrow('No scoped Storybook route for core/NavHeadingMenu or core/NavMenu');
  });

  it.each([
    {modifiedComponentOwners: []},
    {modifiedComponentOwners: ['core/Button']},
  ])(
    'keeps shared theme utilities outside component scope while retaining $modifiedComponentOwners',
    ({modifiedComponentOwners}) => {
      expect(
        resolvePrA11yComponents(
          analysis({
            modifiedComponentOwners,
            unresolvedComponentSources: ['core/theme'],
            forceFullComponentAudits: true,
          }),
          process.cwd(),
          [{id: 'core-button--default', component: 'core/Button'}],
        ),
      ).toEqual(modifiedComponentOwners);
    },
  );

  it('does not turn a shared source into a full audit', () => {
    expect(
      resolvePrA11yComponents(
        analysis({
          unresolvedComponentSources: [
            'core/context',
            'core/index.ts',
            'core/__tests__',
          ],
        }),
      ),
    ).toEqual([]);
  });

  it.each(['two-dot', '', undefined])(
    'rejects approximate/missing diff mode %s',
    diffMode => {
      expect(() => resolvePrA11yComponents(analysis({diffMode}))).toThrow(
        'exact three-dot',
      );
    },
  );

  it.each([
    'newComponentOwners',
    'modifiedComponentOwners',
    'unresolvedComponentSources',
  ])('rejects missing or malformed %s', key => {
    for (const value of [undefined, null, 'core/Button', [null], [12]]) {
      expect(() => resolvePrA11yComponents(analysis({[key]: value}))).toThrow(
        key,
      );
    }
  });

  it.each([
    'Button',
    'core/',
    'unknown/Button',
    'core/Button,core/Dialog',
    'core/Button/other',
    'core/Button\n',
  ])('rejects invalid owner %s', owner => {
    expect(() =>
      resolvePrA11yComponents(analysis({newComponentOwners: [owner]})),
    ).toThrow('Invalid package-qualified');
  });

  it.each([
    'core/..',
    'core/../Button',
    'unknown/Chat',
    'core/',
    'core/Chat\n',
  ])('rejects unsafe unresolved source %s', source => {
    expect(() =>
      resolvePrA11yComponents(analysis({unresolvedComponentSources: [source]})),
    ).toThrow('Invalid unresolved');
  });
});
