// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {parseDoc, parseNamespace, parseReference} from '../../index.mjs';

const namespaceDoc = {
  type: 'namespace',
  name: 'integrations',
  title: 'Author integrations',
  summary: 'Publish reusable Astryx packages.',
  aliases: ['cli-integrations'],
  placement: {parent: 'namespace:cli', slot: 'guides', order: 10},
  slots: {
    contributions: {
      title: 'What do you want to publish?',
      accepts: {kinds: ['namespace']},
    },
    providerGuides: {
      title: 'Provider guidance',
      accepts: {providers: 'configured', kinds: ['generic', 'schema']},
    },
  },
  adopts: [
    {
      source: {group: 'cli-api', kinds: ['function', 'schema', 'enum']},
      into: 'contributions',
      groupBy: 'kind',
    },
  ],
  blocks: [
    {
      type: 'workflow',
      title: 'Package lifecycle',
      steps: [
        {title: 'Add', references: ['command:integration-add']},
        {
          title: 'Validate',
          references: ['command:doctor-integration-validate'],
        },
      ],
    },
    {
      type: 'collection',
      source: {slot: 'contributions'},
      presentation: 'cards',
    },
    {
      type: 'reference',
      target: 'schema:integration',
      projection: {fields: ['components', 'docs']},
    },
  ],
};

describe('NamespaceDoc', () => {
  it('accepts the reviewed plain-object shape through both parsers', () => {
    expect(parseNamespace(namespaceDoc)).toEqual(namespaceDoc);
    expect(parseDoc(namespaceDoc)).toEqual(namespaceDoc);
  });

  it('reports stable nested field paths', () => {
    expect(() =>
      parseNamespace({
        ...namespaceDoc,
        blocks: [{type: 'workflow', steps: [{title: ''}]}],
      }),
    ).toThrow(/blocks\.0\.steps\.0\.title/u);
  });

  it.each(['choice', 'callout', 'checklist'])(
    'rejects unsupported %s blocks',
    type => {
      expect(() => parseNamespace({...namespaceDoc, blocks: [{type}]})).toThrow(
        /blocks\.0\.type/u,
      );
    },
  );

  it('rejects misspelled fields instead of silently dropping them', () => {
    expect(() =>
      parseNamespace({...namespaceDoc, summmary: 'misspelled'}),
    ).toThrow(/summmary/u);
  });

  it('requires at least one declared slot', () => {
    expect(() => parseNamespace({...namespaceDoc, slots: {}})).toThrow(
      /at least one slot is required/u,
    );
  });

  it('rejects a collection that names an undeclared slot', () => {
    expect(() =>
      parseNamespace({
        ...namespaceDoc,
        blocks: [{type: 'collection', source: {slot: 'missing'}}],
      }),
    ).toThrow(/blocks\.0\.source\.slot.*declared slot/u);
  });

  it('rejects an adoption rule that names an undeclared slot', () => {
    expect(() =>
      parseNamespace({
        ...namespaceDoc,
        adopts: [{source: {group: 'cli-api'}, into: 'missing'}],
      }),
    ).toThrow(/adopts\.0\.into.*declared slot/u);
  });

  it('rejects an adoption rule whose generated kind is not accepted', () => {
    expect(() =>
      parseNamespace({
        ...namespaceDoc,
        adopts: [
          {
            source: {group: 'cli-api', kinds: ['command']},
            into: 'providerGuides',
            groupBy: 'kind',
          },
        ],
      }),
    ).toThrow(/does not accept adopted kind "namespace"/u);

    expect(() =>
      parseNamespace({
        ...namespaceDoc,
        adopts: [
          {
            source: {group: 'cli-api', kinds: ['command']},
            into: 'providerGuides',
          },
        ],
      }),
    ).toThrow(/does not accept adopted kind "command"/u);
  });
});

describe('semantic graph blocks', () => {
  it('keeps graph-only blocks out of the stable ReferenceDoc section union', () => {
    expect(() =>
      parseReference({
        type: 'generic',
        name: 'publishing',
        title: 'Publishing',
        description: 'Publish an integration.',
        sections: [
          {
            id: 'start',
            title: 'Start',
            content: namespaceDoc.blocks,
          },
        ],
      }),
    ).toThrow(/Invalid discriminator value/u);
  });

  it('keeps shape-sniffing an unknown stamp for 0.6.x compatibility', () => {
    expect(parseDoc({type: 'choice', name: 'x', props: []})).toMatchObject({
      type: 'choice',
      name: 'x',
      props: [],
    });
  });
});
