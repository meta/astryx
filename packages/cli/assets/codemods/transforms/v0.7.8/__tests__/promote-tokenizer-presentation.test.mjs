// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import transform from '../promote-tokenizer-presentation.mjs';

async function applyTransform(source) {
  const jscodeshift = (await import('jscodeshift')).default;
  const j = jscodeshift.withParser('tsx');
  const api = {jscodeshift: j, stats: () => {}, report: () => {}};
  return transform({source, path: 'test.tsx'}, api) ?? source;
}

/** Collapse whitespace so assertions ignore the printer's line breaks. */
const flat = text => text.replace(/\s+/g, ' ');

describe('promote-tokenizer-presentation', () => {
  it('moves a static presentation out of experimental and drops the emptied object', async () => {
    const output = flat(
      await applyTransform(`import {Tokenizer} from '@astryxdesign/core';
const a = <Tokenizer label="Tags" experimental={{presentation: 'adaptive'}} />;
const b = <Tokenizer label="Tags" experimental={{'presentation': 'bottom-sheet' as const}} />;`),
    );
    expect(output).not.toContain('experimental');
    expect(output).toContain(
      '<Tokenizer label="Tags" presentation="adaptive" />',
    );
    expect(output).toContain(
      '<Tokenizer label="Tags" presentation="bottom-sheet" />',
    );
  });

  it('moves an expression and a shorthand key as an expression', async () => {
    const output = flat(
      await applyTransform(`import {Tokenizer as Tags} from '@astryxdesign/core/Tokenizer';
const a = <Tags label="Tags" experimental={{presentation: isPhone ? 'bottom-sheet' : 'popover'}} />;
const b = <Tags label="Tags" experimental={{presentation}} />;`),
    );
    expect(output).toContain(
      "presentation={isPhone ? 'bottom-sheet' : 'popover'}",
    );
    expect(output).toContain(
      '<Tags label="Tags" presentation={presentation} />',
    );
    expect(output).not.toContain('experimental');
  });

  it('keeps other experimental keys beside the moved prop', async () => {
    const output = flat(
      await applyTransform(`import * as Core from '@astryxdesign/core';
const a = <Core.Tokenizer label="Tags" experimental={{presentation: 'adaptive', other: true}} />;`),
    );
    expect(output).toContain(
      'experimental={{ other: true }} presentation="adaptive"',
    );
  });

  it('leaves a TODO and the call unchanged where it cannot prove the rewrite', async () => {
    const source = `import {Tokenizer} from '@astryxdesign/core';
const a = <Tokenizer label="Tags" experimental={options} />;
const b = <Tokenizer label="Tags" experimental={{presentation: 'adaptive'}} {...rest} />;
const c = <Tokenizer label="Tags" presentation="popover" experimental={{presentation: 'adaptive'}} />;
const d = <Tokenizer label="Tags" experimental={{...base, presentation: 'adaptive'}} />;`;
    const output = await applyTransform(source);
    expect(output.match(/TODO\(astryx upgrade\)/g)).toHaveLength(4);
    expect(flat(output)).toContain("experimental={{presentation: 'adaptive'}}");
    expect(flat(output)).toContain('experimental={options}');
    // Each case names its own reason.
    const text = flat(output);
    expect(text).toContain('because the value is not a literal object.');
    expect(text).toContain('because a spread may also set presentation.');
    expect(text).toContain(
      'presentation is already set; remove experimental.presentation.',
    );
    expect(text).toContain(
      'because the object has a spread or a computed key.',
    );
  });

  it('names a repeated presentation key in its TODO', async () => {
    const output = flat(
      await applyTransform(`import {Tokenizer} from '@astryxdesign/core';
const a = <Tokenizer label="Tags" experimental={{presentation: 'adaptive', 'presentation': 'popover'}} />;`),
    );
    expect(output).toContain(
      'because the object sets presentation more than once.',
    );
    expect(output).not.toContain('presentation="');
  });

  it('leaves a TODO for a spread on either side of experimental, because the spread can set presentation', async () => {
    const source = `import {Tokenizer} from '@astryxdesign/core';
const a = <Tokenizer {...args} label="Tags" experimental={{presentation: 'bottom-sheet'}} />;
const b = <Tokenizer label="Tags" experimental={{presentation: 'bottom-sheet'}} {...args} />;`;
    const output = await applyTransform(source);
    expect(output.match(/TODO\(astryx upgrade\)/g)).toHaveLength(2);
    expect(
      flat(output).match(/because a spread may also set presentation\./g),
    ).toHaveLength(2);
    expect(flat(output)).not.toContain('presentation="bottom-sheet"');
    expect(await applyTransform(output)).toBe(output);
  });

  it('changes nothing without an experimental presentation or outside core', async () => {
    const source = `import {Tokenizer} from '@astryxdesign/core';
import {Tokenizer as Other} from 'some-other-library';
const a = <Tokenizer label="Tags" presentation="popover" />;
const b = <Tokenizer label="Tags" experimental={{}} />;
const c = <Other label="Tags" experimental={{presentation: 'adaptive'}} />;
const d = <Selector experimental={{presentation: 'adaptive'}} />;`;
    expect(await applyTransform(source)).toBe(source);
  });

  it('is idempotent and prints parseable source', async () => {
    const once =
      await applyTransform(`import {Tokenizer} from '@astryxdesign/core';
const a = <Tokenizer label="Tags" experimental={{presentation: 'adaptive'}} />;
const b = <Tokenizer label="Tags" experimental={options} />;`);
    expect(await applyTransform(once)).toBe(once);
    const jscodeshift = (await import('jscodeshift')).default;
    expect(() => jscodeshift.withParser('tsx')(once)).not.toThrow();
  });
});
