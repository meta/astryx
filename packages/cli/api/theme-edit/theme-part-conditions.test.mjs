// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A part's conditions are read from what its theming target declares: a
 * runtime state Core adds tomorrow (here `expanded`) is recorded by the part
 * data and kept by the readers with no change to the editor.
 */

import {describe, expect, it} from 'vitest';
import {declarations, walkMarkup} from './_parts.mjs';
import {makeCompiler} from './_compiler.mjs';

/** A one-target project whose target declares `states`. @param {string[]} states */
const projectWith = states =>
  /** @type {any} */ ({
    core: {},
    target: new Map([
      [
        'disclosure',
        {
          key: 'disclosure',
          className: 'astryx-disclosure',
          component: 'Disclosure',
          props: ['variant'],
          states,
        },
      ],
    ]),
  });

/** The part data for one open and one closed element. @param {ReturnType<typeof projectWith>} project */
const partsOf = project => {
  const css =
    '.x1a{background-color:var(--color-background-surface)}' +
    '.x1b{background-color:var(--color-accent-muted)}';
  const html =
    '<div class="astryx-disclosure x1a" data-variant="plain"></div>' +
    '<div class="astryx-disclosure x1b" data-variant="plain" data-expanded="expanded" data-probe="x"></div>';
  const tokens = new Set([
    '--color-background-surface',
    '--color-accent-muted',
  ]);
  return {
    version: 0,
    coreKey: '',
    rendered: 1,
    items: 1,
    ...walkMarkup(html, declarations(css), tokens, project.target),
  };
};

describe('part conditions from the target declaration', () => {
  it('records and keeps a runtime state the target declares, with no code for it', () => {
    const project = projectWith(['expanded']);
    const parts = partsOf(project);
    // Only declared attributes are conditions (no data-probe).
    expect(parts.map.disclosure.attrs).toEqual({
      variant: ['plain'],
      expanded: ['expanded'],
    });
    const C = makeCompiler(project, parts);
    const reads = C.partReads('disclosure', 'background');
    expect(reads.find(r => r.token === '--color-accent-muted')?.when).toEqual([
      'expanded=expanded',
    ]);
    expect(
      reads.find(r => r.token === '--color-background-surface')?.when,
    ).toEqual(['']);
  });

  it("keeps a condition that is not one of the part's own visual props", () => {
    const project = projectWith([]);
    const parts = partsOf(project);
    // Not declared, so not recorded from the markup...
    expect(parts.map.disclosure.attrs.expanded).toBeUndefined();
    // ...but a condition the part's own props do not name is still kept.
    parts.map.disclosure.own['background-color'].tokens[
      '--color-accent-muted'
    ] = ['variant=plain,expanded=expanded'];
    const C = makeCompiler(project, parts);
    expect(
      C.partReads('disclosure', 'background').find(
        r => r.token === '--color-accent-muted',
      )?.when,
    ).toEqual(['expanded=expanded']);
  });
});
