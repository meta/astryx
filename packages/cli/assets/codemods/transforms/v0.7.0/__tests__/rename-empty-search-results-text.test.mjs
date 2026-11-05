// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import transform from '../rename-empty-search-results-text.mjs';
import manifest from '../index.mjs';

async function applyTransform(source) {
  const jscodeshift = (await import('jscodeshift')).default;
  const j = jscodeshift.withParser('tsx');
  const api = {jscodeshift: j, stats: () => {}, report: () => {}};
  return transform({source, path: 'test.tsx'}, api) ?? source;
}

describe('rename-empty-search-results-text', () => {
  it('is staged in the next-release manifest', () => {
    expect(manifest.map(entry => entry.name)).toContain(
      'rename-empty-search-results-text',
    );
  });

  describe('JSX props', () => {
    it('renames the prop on Tokenizer, Typeahead, and BaseTypeahead', async () => {
      const output =
        await applyTransform(`import {BaseTypeahead, Tokenizer, Typeahead} from '@astryxdesign/core';
const a = <Tokenizer label="People" emptySearchResultsText="Nobody found" />;
const b = <Typeahead label="Fruit" emptySearchResultsText={copy.empty} />;
const c = <BaseTypeahead emptySearchResultsText={'None'} />;`);

      expect(output).toContain(
        '<Tokenizer label="People" emptySearchText="Nobody found" />',
      );
      expect(output).toContain(
        '<Typeahead label="Fruit" emptySearchText={copy.empty} />',
      );
      expect(output).toContain("<BaseTypeahead emptySearchText={'None'} />");
      expect(output).not.toContain('emptySearchResultsText');
    });

    it('follows aliases, namespaces, and subpath default imports', async () => {
      const output =
        await applyTransform(`import {Tokenizer as People} from '@astryxdesign/core';
import * as Astryx from '@astryxdesign/core';
import Typeahead from '@astryxdesign/core/Typeahead';
const a = <People emptySearchResultsText="x" />;
const b = <Astryx.BaseTypeahead emptySearchResultsText="y" />;
const c = <Typeahead emptySearchResultsText="z" />;`);

      expect(output).not.toContain('emptySearchResultsText');
      expect(output.match(/emptySearchText=/g)).toHaveLength(3);
    });

    it('renames the value as written, whatever shape it has', async () => {
      const output =
        await applyTransform(`import {Tokenizer} from '@astryxdesign/core';
const a = <Tokenizer emptySearchResultsText={compact ? 'None' : 'No matches'} />;
const b = <Tokenizer emptySearchResultsText={props.text ?? null} />;
const c = <Tokenizer {...props} emptySearchResultsText="After a spread" />;`);

      expect(output).toContain(
        "emptySearchText={compact ? 'None' : 'No matches'}",
      );
      expect(output).toContain('emptySearchText={props.text ?? null}');
      // A spread may carry either name, so the element gets a TODO instead.
      expect(output).toContain('{...props} /* TODO(astryx upgrade)');
      expect(output).toContain('emptySearchResultsText="After a spread"');
      expect(output).toContain('spreads props that may carry either name');
      expect(output.match(/emptySearchResultsText/g)).toHaveLength(2);
    });

    it('leaves a TODO instead of choosing when emptySearchText is already set', async () => {
      const output =
        await applyTransform(`import {Typeahead} from '@astryxdesign/core';
const a = <Typeahead emptySearchResultsText="Old copy" emptySearchText="New copy" />;`);

      expect(output).toContain('TODO(astryx upgrade)');
      expect(output).toContain('emptySearchResultsText="Old copy"');
      expect(output).toContain('emptySearchText="New copy"');
      expect(await applyTransform(output)).toBe(output);
    });

    it('leaves other packages, other components, and shadowed names alone', async () => {
      const source = `import {MobileTokenizer} from '@astryxdesign/lab';
import {Selector} from '@astryxdesign/core';
import {Tokenizer} from './my-tokenizer';
const a = <MobileTokenizer emptySearchResultsText="kept" />;
const b = <Selector emptySearchResultsText="kept" />;
const c = <Tokenizer emptySearchResultsText="kept" />;`;
      expect(await applyTransform(source)).toBe(source);
    });

    it('is idempotent', async () => {
      const once =
        await applyTransform(`import {Tokenizer} from '@astryxdesign/core';
const a = <Tokenizer emptySearchResultsText="Nobody found" />;`);
      expect(await applyTransform(once)).toBe(once);
    });
  });

  describe('ChatComposerInput trigger objects', () => {
    it('renames the key on triggers written inline, in an array or alone', async () => {
      const output =
        await applyTransform(`import {ChatComposerInput} from '@astryxdesign/core';
const a = (
  <ChatComposerInput
    triggers={[
      {char: '@', searchSource, onSelect, emptySearchResultsText: 'Nobody found'},
      {char: '#', emptySearchResultsText: 'No tags'} as ChatComposerTrigger,
    ]}
  />
);
const b = <ChatComposerInput triggers={{char: '/', emptySearchResultsText: 'No commands'}} />;`);

      expect(output).toContain("emptySearchText: 'Nobody found'");
      expect(output).toContain("emptySearchText: 'No tags'");
      expect(output).toContain("emptySearchText: 'No commands'");
      expect(output).not.toContain('emptySearchResultsText');
    });

    it('leaves a TODO on a trigger with a spread or computed key, or one that already sets the new name', async () => {
      const output =
        await applyTransform(`import {ChatComposerInput} from '@astryxdesign/core';
const a = (
  <ChatComposerInput
    triggers={[
      {...base, emptySearchResultsText: 'Nobody'},
      {[key]: 1, emptySearchResultsText: 'Nobody'},
      {char: '@', emptySearchText: 'New', emptySearchResultsText: 'Old'},
    ]}
  />
);`);

      expect(output.match(/TODO\(astryx upgrade\)/g)).toHaveLength(3);
      expect(output.match(/emptySearchResultsText:/g)).toHaveLength(3);
      expect(await applyTransform(output)).toBe(output);
    });

    it('leaves a TODO on triggers it cannot read instead of following them', async () => {
      const output =
        await applyTransform(`import {ChatComposerInput} from '@astryxdesign/core';
import {mentionTrigger} from './triggers';
const local = {char: '@', emptySearchResultsText: 'Nobody'};
const a = <ChatComposerInput triggers={[local, mentionTrigger]} />;
const b = <ChatComposerInput triggers={buildTriggers()} />;
const c = <ChatComposerInput triggers={useMemo(() => [t], [t])} />;
const d = <ChatComposerInput {...props} triggers={[{char: '#', emptySearchResultsText: 'No tags'}]} />;`);

      expect(output.match(/These triggers are built elsewhere/g)).toHaveLength(
        4,
      );
      // The inline object beside a spread is still renamed; the spread is flagged.
      expect(output).toContain("emptySearchText: 'No tags'");
      expect(output).toContain("emptySearchResultsText: 'Nobody'");
      expect(await applyTransform(output)).toBe(output);
    });

    it('marks every spread onto these elements, even when the element writes neither name', async () => {
      const output =
        await applyTransform(`import {Tokenizer, Typeahead, ChatComposerInput} from '@astryxdesign/core';
import {Selector} from '@astryxdesign/core';
const people = {emptySearchResultsText: 'No people match'};
export function Wrappers(props) {
  return (
    <>
      <Tokenizer {...people} />
      <Typeahead {...{emptySearchResultsText: 'Inline'}} />
      <Tokenizer {...props} label="x" />
      <ChatComposerInput {...props} />
      <Selector {...props} />
      <Tokenizer {...props} emptySearchText="already new" />
    </>
  );
}`);

      expect(
        output.match(/spreads props that may carry either name/g),
      ).toHaveLength(4);
      expect(output.match(/These triggers are built elsewhere/g)).toHaveLength(
        1,
      );
      expect(output).toContain('<Selector {...props} />');
      expect(await applyTransform(output)).toBe(output);
    });

    it('marks an inline trigger object whose keys come only from a spread, once across runs', async () => {
      const once =
        await applyTransform(`import {ChatComposerInput} from '@astryxdesign/core';
const a = <ChatComposerInput triggers={[{...baseMention, onSelect}, {[key]: 1, onSelect}]} />;`);

      expect(once.match(/has a spread or computed key/g)).toHaveLength(2);
      const twice = await applyTransform(once);
      expect(twice).toBe(once);
      expect(twice.match(/TODO\(astryx upgrade\)/g)).toHaveLength(2);
    });

    it('leaves a file with no runtime core import alone', async () => {
      const source = `import {MobileTokenizer} from '@astryxdesign/lab';
const copy = {emptySearchResultsText: 'kept'};
const a = <MobileTokenizer {...copy} />;`;
      expect(await applyTransform(source)).toBe(source);
    });
  });
});
