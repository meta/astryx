// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {
  COMPONENT_ICON_SLOT_FIELDS,
  COMPONENT_ICON_SLOT_STATE_FIELDS,
  COMPONENT_VAR_FIELDS,
  DERIVED_VAR_FIELDS,
  THEMING_DOC_FIELDS,
  THEMING_TARGET_FIELDS,
  projectThemingDoc,
} from '../../scripts/lib/theming-doc.mjs';

const GENERATOR = path.resolve(__dirname, '../../scripts/generate-data.mjs');

/** The field names of one `export interface <name> {…}` the generator emits. */
function emittedInterfaceFields(name: string): string[] {
  const source = fs.readFileSync(GENERATOR, 'utf8');
  const match = new RegExp(
    `export interface ${name} \\{([\\s\\S]*?)\\n\\}`,
  ).exec(source);
  if (!match) {
    throw new Error(`generate-data.mjs emits no interface ${name}`);
  }
  return [...match[1].matchAll(/^\s{2}([A-Za-z]+)\??:/gm)].map(m => m[1]);
}

// The docsite's `latest` target documents the PUBLISHED packages, whose
// .doc.mjs files can carry theming fields a later release removed. The
// generated registry must typecheck against the interfaces the generator
// emits, so the projection's field lists must match those interfaces exactly.
describe('generated theming docs typecheck against the emitted interfaces', () => {
  it.each([
    ['ThemingTarget', THEMING_TARGET_FIELDS],
    ['ComponentVar', COMPONENT_VAR_FIELDS],
    ['DerivedVar', DERIVED_VAR_FIELDS],
    ['ComponentIconSlot', COMPONENT_ICON_SLOT_FIELDS],
    ['ComponentIconSlotState', COMPONENT_ICON_SLOT_STATE_FIELDS],
    ['ThemingDoc', THEMING_DOC_FIELDS],
  ])('%s: the projection keeps exactly the emitted fields', (name, fields) => {
    expect([...fields].sort()).toEqual(emittedInterfaceFields(name).sort());
  });

  it('drops a published deprecated alias target and any field the current interfaces no longer declare', () => {
    const published = {
      container: true,
      targets: [
        {className: 'astryx-button', visualProps: ['color'], states: ['hover']},
        {
          className: 'astryx-button-old',
          deprecatedFor: 'astryx-button',
          states: ['hover'],
        },
      ],
      vars: [
        {
          name: '--button-gap',
          description: 'Gap',
          default: '4px',
          since: '0.6',
        },
      ],
      derived: [{property: 'padding', vars: ['--p'], note: 'legacy'}],
      componentIcons: [
        {
          slot: 'button-icon',
          description: 'Icon',
          fallback: 'none',
          whenNull: 'Hides it.',
          since: '0.8',
          state: [
            {name: 'busy', type: 'boolean', description: 'Busy', note: 'x'},
          ],
        },
      ],
      legacyTargets: [],
    };
    expect(projectThemingDoc(published)).toEqual({
      container: true,
      targets: [
        {className: 'astryx-button', visualProps: ['color'], states: ['hover']},
      ],
      vars: [{name: '--button-gap', description: 'Gap', default: '4px'}],
      derived: [{property: 'padding', vars: ['--p']}],
      componentIcons: [
        {
          slot: 'button-icon',
          description: 'Icon',
          fallback: 'none',
          whenNull: 'Hides it.',
          state: [{name: 'busy', type: 'boolean', description: 'Busy'}],
        },
      ],
    });
  });

  it('returns a current doc unchanged and leaves non-objects alone', () => {
    const current = {
      targets: [{className: 'astryx-card'}],
      vars: [
        {
          name: '--card-radius',
          description: 'Radius',
          default: '8px',
          derived: true,
          formula: 'x',
          private: false,
        },
      ],
      derived: [{property: 'padding', expand: 'container', replaces: true}],
      componentIcons: [
        {
          slot: 'card-dismiss',
          description: 'Dismiss',
          fallback: '`close`',
          state: [{name: 'open', type: 'boolean', description: 'Open'}],
          whenNull: 'Hides the glyph.',
        },
      ],
    };
    expect(projectThemingDoc(current)).toEqual(current);
    expect(projectThemingDoc(null)).toBeNull();
  });
});
