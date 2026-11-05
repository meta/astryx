// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for the new authoring doc-types (schema/command/enum/theme) and the
 * generalized `function` doc (hooks + CLI/API functions sharing the schema).
 */

import {describe, it, expect} from 'vitest';
import {
  parseDoc,
  parseSchema,
  parseCommand,
  parseEnum,
  parseFunction,
  parseTheme,
} from '../index.mjs';

describe('SchemaDoc', () => {
  const doc = {
    type: 'schema',
    name: 'config',
    displayName: 'Astryx Config',
    description: 'Project config.',
    appliesTo: 'astryx.config.{ts,mjs,js}',
    fields: [
      {
        name: 'integrations',
        type: 'string[]',
        description: 'Packages to load.',
      },
      {
        name: 'hooks',
        type: 'object',
        description: 'Lifecycle hooks.',
        fields: [
          {
            name: 'hooks.postCodemod',
            type: 'PostCodemodHook[]',
            description: 'Runs after codemods.',
          },
        ],
      },
    ],
  };

  it('accepts a valid schema doc with nested fields', () => {
    const parsed = parseSchema(doc);
    expect(parsed.name).toBe('config');
    expect(parsed.fields[1].fields?.[0].name).toBe('hooks.postCodemod');
    expect(parseDoc(doc).type).toBe('schema');
  });

  it('throws when a field is missing its type', () => {
    expect(() =>
      parseSchema({
        type: 'schema',
        name: 'x',
        displayName: 'X',
        description: '',
        fields: [{name: 'a', description: 'no type'}],
      }),
    ).toThrow(/type is required/);
  });
});

describe('CommandDoc', () => {
  const doc = {
    type: 'command',
    name: 'search',
    displayName: 'astryx search',
    summary: 'Find components, hooks, docs, and templates.',
    fn: 'search',
    args: [{name: 'query', param: 'query', required: true}],
    options: [
      {
        flag: '--type <domain>',
        param: 'options.type',
        choices: ['component', 'hook'],
      },
      {
        flag: '--json',
        cliOnly: true,
        description: 'Emit the typed JSON envelope.',
      },
    ],
    examples: [{label: 'Terminal', cli: 'astryx search button --json'}],
    exitCodes: [{code: 1, when: 'invalid --type'}],
  };

  it('accepts a command doc that references a function', () => {
    expect(parseCommand(doc).fn).toBe('search');
    expect(parseDoc(doc).type).toBe('command');
  });
});

describe('EnumDoc', () => {
  it('accepts a closed vocabulary', () => {
    const doc = {
      type: 'enum',
      name: 'error-codes',
      displayName: 'Error Codes',
      description: 'Stable CLI error codes.',
      members: [{value: 'ERR_UNKNOWN', description: 'Fallback code.'}],
    };
    expect(parseEnum(doc).members).toHaveLength(1);
    expect(parseDoc(doc).type).toBe('enum');
  });
});

describe('ThemeDoc', () => {
  const doc = {
    type: 'theme',
    name: 'ocean',
    displayName: 'Ocean',
    description: 'Cool blue surfaces with crisp contrast.',
    maintained: true,
  };

  it('accepts a complete theme descriptor and dispatches through parseDoc', () => {
    expect(parseTheme(doc)).toEqual(doc);
    expect(parseDoc(doc)).toEqual(doc);
  });

  it('rejects non-kebab identity and missing required metadata', () => {
    expect(() => parseTheme({...doc, name: 'OceanTheme'})).toThrow(
      /lowercase kebab-case/,
    );
    const {maintained: _maintained, ...missingMaintained} = doc;
    expect(() => parseTheme(missingMaintained)).toThrow(/maintained/);
  });
});

describe('generalized FunctionDoc', () => {
  it('accepts an API function whose returns are envelope entries (no field name)', () => {
    const apiFn = {
      type: 'function',
      kind: 'api',
      name: 'search',
      displayName: 'search()',
      importPath: '@astryxdesign/cli/api',
      params: [
        {name: 'query', type: 'string', description: 'Term.', required: true},
      ],
      returns: [{type: 'search', description: 'query + ranked results[]'}],
      throws: [{code: 'ERR_INVALID_ARGUMENT', when: 'empty query'}],
    };
    expect(() => parseFunction(apiFn)).not.toThrow();
    expect(parseDoc(apiFn).name).toBe('search');
  });

  it('still accepts a hook whose returns are named fields', () => {
    const hook = {
      type: 'function',
      name: 'useThing',
      displayName: 'useThing',
      params: [{name: 'opts', type: 'Opts', description: 'Options.'}],
      returns: [{name: 'value', type: 'string', description: 'The value.'}],
      usage: {description: 'Use it.'},
    };
    expect(() => parseFunction(hook)).not.toThrow();
  });
});
