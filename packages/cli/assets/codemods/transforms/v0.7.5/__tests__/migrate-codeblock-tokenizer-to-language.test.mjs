// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import transform from '../migrate-codeblock-tokenizer-to-language.mjs';

async function applyTransform(source) {
  const jscodeshift = (await import('jscodeshift')).default;
  const j = jscodeshift.withParser('tsx');
  const api = {jscodeshift: j, stats: () => {}, report: () => {}};
  return transform({source, path: 'test.tsx'}, api) ?? source;
}

/** Collapse whitespace so assertions ignore the printer's line breaks. */
const flat = text => text.replace(/\s+/g, ' ');

describe('migrate-codeblock-tokenizer-to-language', () => {
  it('rewrites tokenizer beside a static language to a custom language', async () => {
    const output = flat(
      await applyTransform(`import {CodeBlock} from '@astryxdesign/core/CodeBlock';
const a = <CodeBlock code={src} language="zig" tokenizer={zigTokens} />;
const b = <CodeBlock code={src} language={'nim'} tokenizer={(c) => tokens(c)} />;`),
    );

    expect(output).not.toContain('tokenizer=');
    expect(output).toContain(
      "import { CodeBlock, createCodeLanguage } from '@astryxdesign/core/CodeBlock';",
    );
    expect(output).toContain(
      "language={zigTokens ? createCodeLanguage({ name: 'zig', identifiers: ['zig'], tokenize: zigTokens }) : 'zig'}",
    );
    expect(output).toContain(
      "language={createCodeLanguage({ name: 'nim', identifiers: ['nim'], tokenize: (c) => tokens(c) })}",
    );
  });

  it('adds the import beside a root-package import and follows aliases', async () => {
    const output = flat(
      await applyTransform(`import {CodeBlock as Code} from '@astryxdesign/core';
const a = <Code code={src} language="zig" tokenizer={zigTokens} />;`),
    );

    expect(output).toContain(
      "import { createCodeLanguage } from '@astryxdesign/core/CodeBlock';",
    );
    expect(output).toContain("createCodeLanguage({ name: 'zig'");
  });

  it('adds a separate import beside a namespace import', async () => {
    const output =
      await applyTransform(`import * as CB from '@astryxdesign/core/CodeBlock';
const a = <CB.CodeBlock code={src} language="zig" tokenizer={zigTokens} />;`);
    expect(output).toContain(
      "import * as CB from '@astryxdesign/core/CodeBlock';",
    );
    expect(flat(output)).toContain(
      "import { createCodeLanguage } from '@astryxdesign/core/CodeBlock';",
    );
    const jscodeshift = (await import('jscodeshift')).default;
    expect(() => jscodeshift.withParser('tsx')(output)).not.toThrow();
  });

  it('guards a name or property that may be undefined', async () => {
    const output = flat(
      await applyTransform(`import {CodeBlock} from '@astryxdesign/core/CodeBlock';
const a = <CodeBlock code={src} language="zig" tokenizer={props.tokenizer} />;`),
    );
    expect(output).toContain(
      "language={props.tokenizer ? createCodeLanguage({ name: 'zig', identifiers: ['zig'], tokenize: props.tokenizer }) : 'zig'}",
    );
  });

  it('imports under a free alias when the file binds the name already', async () => {
    const fromLocal = flat(
      await applyTransform(`import {CodeBlock} from '@astryxdesign/core/CodeBlock';
import {createCodeLanguage} from './my-languages';
const a = <CodeBlock code={src} language="zig" tokenizer={(c) => t(c)} />;`),
    );
    expect(fromLocal).toContain(
      "import { CodeBlock, createCodeLanguage as createCodeLanguage2 } from '@astryxdesign/core/CodeBlock';",
    );
    expect(fromLocal).toContain(
      "import {createCodeLanguage} from './my-languages';",
    );
    expect(fromLocal).toContain("language={createCodeLanguage2({ name: 'zig'");

    const fromFunction = flat(
      await applyTransform(`import {CodeBlock} from '@astryxdesign/core/CodeBlock';
function createCodeLanguage() {}
const a = <CodeBlock code={src} language="zig" tokenizer={(c) => t(c)} />;`),
    );
    expect(fromFunction).toContain('createCodeLanguage as createCodeLanguage2');
    const jscodeshift = (await import('jscodeshift')).default;
    const parse = jscodeshift.withParser('tsx');
    expect(() => parse(fromLocal)).not.toThrow();
  });

  it('reports a tokenizer value it cannot read twice, naming the tokenizer', async () => {
    const output =
      await applyTransform(`import {CodeBlock} from '@astryxdesign/core/CodeBlock';
const a = <CodeBlock code={src} language="zig" tokenizer={registry.get('zig').tokenize} />;
const b = <CodeBlock code={src} language="zig" tokenizer={enabled ? t : undefined} />;`);
    expect(output.match(/this tokenizer value is computed/g)).toHaveLength(2);
    expect(output).not.toContain('the language here is computed');
    expect(output).toContain("tokenizer={registry.get('zig').tokenize}");
  });

  it('reports what it cannot prove and leaves it unchanged', async () => {
    const source = `import {CodeBlock} from '@astryxdesign/core/CodeBlock';
const a = <CodeBlock code={src} language={lang} tokenizer={t} />;
const b = <CodeBlock code={src} tokenizer={t} />;
const c = <CodeBlock code={src} language="plaintext" tokenizer={t} />;
const d = <CodeBlock {...rest} code={src} language="zig" tokenizer={t} />;
const e = <CodeBlock code={src} language="zig" tokenizer={enabled ? t : undefined} />;
const f = <CodeBlock code={src} language="zig" tokenizer={enabled && t} />;`;
    const output = await applyTransform(source);

    expect(output.match(/TODO\(astryx upgrade\)/g)).toHaveLength(6);
    expect(output.match(/tokenizer=\{t\}/g)).toHaveLength(4);
    expect(output).toContain('tokenizer={enabled ? t : undefined}');
    expect(output).toContain('tokenizer={enabled && t}');
    expect(output).not.toMatch(/import \{[^}]*createCodeLanguage/);
    expect(await applyTransform(output)).toBe(output);
  });

  it('leaves files without CodeBlock tokenizer alone', async () => {
    const source = `import {CodeBlock} from '@astryxdesign/core/CodeBlock';
const a = <CodeBlock code={src} language="ts" />;`;
    expect(await applyTransform(source)).toBe(source);
  });
});
