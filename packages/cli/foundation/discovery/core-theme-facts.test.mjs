// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Theme build's facts from Core's component docs are worked out in one place
 * (themeFactsOf), from the docs in their walk order.
 */

import {describe, expect, it} from 'vitest';
import {EXACT_CODEC} from '../fs/exact-codec.mjs';
import {themeFactsOf} from './core-theme-facts.mjs';
import {targetsFromDocs} from './theming-targets.mjs';

/**
 * A doc entry as core-component-docs.mjs lists it.
 * @param {string} file
 * @param {any} doc
 */
const read = (file, doc) => ({file, doc});

describe('themeFactsOf', () => {
  it('names the docs that declare each target token in doc order, each once', () => {
    const docs = [
      read('/core/src/Card/Card.doc.mjs', {
        name: 'Card',
        components: [{name: 'CardHeader'}, {name: 7}],
        theming: {
          targets: [
            {className: 'astryx-shared-dot'},
            {className: 'astryx-shared-dot'},
            {className: 'astryx-card'},
          ],
        },
      }),
      {file: '/core/src/Broken/Broken.doc.mjs', error: new Error('broken')},
      read('/core/src/Avatar/Avatar.doc.mjs', {
        theming: {targets: [{className: 'astryx-shared-dot'}]},
      }),
    ];
    expect(themeFactsOf(docs).owners).toEqual({
      'shared-dot': [
        {moduleName: 'Card', components: ['CardHeader']},
        // A doc with no name is named for its folder.
        {moduleName: 'Avatar', components: []},
      ],
      card: [{moduleName: 'Card', components: ['CardHeader']}],
    });
  });

  it('is plain data a kept gather stores exactly, even where a doc names several tokens', () => {
    const docs = [
      read('/core/src/Avatar/Avatar.doc.mjs', {
        name: 'Avatar',
        components: [{name: 'AvatarStatusDot'}],
        theming: {
          targets: [
            {className: 'astryx-avatar', visualProps: ['size']},
            {className: 'astryx-avatar-status-dot', visualProps: ['size']},
          ],
        },
      }),
    ];
    const facts = themeFactsOf(docs);
    expect(EXACT_CODEC.decode(EXACT_CODEC.encode(facts))).toEqual(facts);
  });

  it('gives each target the values its visual props take, from its own doc and from the doc of the component it is named for', () => {
    const docs = [
      read('/core/src/Text/Heading.doc.mjs', {
        name: 'Text',
        props: [{name: 'size', type: "'sm' | 'lg'"}],
        theming: {
          targets: [
            {className: 'astryx-heading', visualProps: ['level', 'size']},
          ],
        },
      }),
      read('/core/src/Heading/Heading.doc.mjs', {
        name: 'Heading',
        props: [{name: 'level', type: '1 | 2 | 3'}],
      }),
    ];
    expect(themeFactsOf(docs).knownValues).toEqual({
      heading: {level: ['1', '2', '3'], size: ['sm', 'lg']},
    });
  });

  it('lists the theming targets as collectThemingTargets does', () => {
    const docs = [
      read('/core/src/Button/Button.doc.mjs', {
        name: 'Button',
        theming: {
          targets: [{className: 'astryx-button', visualProps: ['variant']}],
        },
      }),
    ];
    expect(themeFactsOf(docs).targets).toEqual(targetsFromDocs(docs));
    expect(themeFactsOf(docs).targets.map(target => target.key)).toEqual([
      'button',
    ]);
  });
});
