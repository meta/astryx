// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Docs-only demo content (template-authoring INV8): every JSX element a
 * template imports from the demo-content module becomes a generic `<Text>`
 * placeholder in emitted source, the import goes, and anything that cannot be
 * replaced without leaving a reference or dropping code throws.
 */

import {describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parse as parseModule} from '@babel/parser';
import {
  DEMO_CONTENT_MODULE,
  replaceDemoContent,
  replaceTemplateDemos,
} from './template-adapter.mjs';

/** @param {string} source */
const parse = source =>
  parseModule(source, {sourceType: 'module', plugins: ['jsx', 'typescript']});

const CARD = "import {Card} from '@astryxdesign/core/Card';\n";
const DEMO = `import {PlayingCardContents} from '${DEMO_CONTENT_MODULE}';\n`;

describe('replaceDemoContent', () => {
  it('replaces a demo element with a Text placeholder and imports Text in place of the demo import', () => {
    const source =
      CARD +
      DEMO +
      '\nexport default function Example() {\n' +
      '  return <Card><PlayingCardContents rank="Q" suit="hearts" /></Card>;\n' +
      '}\n';
    expect(replaceDemoContent(source)).toEqual({
      source:
        CARD +
        "import {Text} from '@astryxdesign/core/Text';\n" +
        '\nexport default function Example() {\n' +
        '  return <Card><Text>Card content</Text></Card>;\n' +
        '}\n',
      demoContentReplaced: 1,
    });
  });

  it('reuses an existing Text import, under its local name, and counts each element', () => {
    const source =
      "import {Text as Label} from '@astryxdesign/core/Text';\n" +
      `import {PlayingCardBack, PlayingCardContents as Face} from '${DEMO_CONTENT_MODULE}';\n` +
      'const a = <Face rank="A" suit={"spades"} />;\n' +
      'const b = (\n  <PlayingCardBack>\n  </PlayingCardBack>\n);\n';
    const result = replaceDemoContent(source);
    expect(result.demoContentReplaced).toBe(2);
    expect(result.source).toBe(
      "import {Text as Label} from '@astryxdesign/core/Text';\n" +
        'const a = <Label>Card content</Label>;\n' +
        'const b = (\n  <Label>Card content</Label>\n);\n',
    );
  });

  it('replaces an element whose prop reads a variable the file still reads', () => {
    const source =
      DEMO +
      'const [isFaceUp, setIsFaceUp] = useState(true);\n' +
      'const a = (\n  <Card aria-pressed={!isFaceUp}>\n' +
      '    <PlayingCardContents rank="Q" suit="hearts" faceDown={!isFaceUp} />\n' +
      '  </Card>\n);\n';
    expect(replaceDemoContent(source)).toEqual({
      source:
        "import {Text} from '@astryxdesign/core/Text';\n" +
        'const [isFaceUp, setIsFaceUp] = useState(true);\n' +
        'const a = (\n  <Card aria-pressed={!isFaceUp}>\n' +
        '    <Text>Card content</Text>\n' +
        '  </Card>\n);\n',
      demoContentReplaced: 1,
    });
  });

  it('removes an unused demo import without adding Text', () => {
    const source = `${DEMO}export const x = 1;\n`;
    expect(replaceDemoContent(source)).toEqual({
      source: 'export const x = 1;\n',
      demoContentReplaced: 0,
    });
  });

  it('returns source that never names the module unchanged', () => {
    const source = `${CARD}export default () => <Card />;\n`;
    expect(replaceDemoContent(source)).toEqual({
      source,
      demoContentReplaced: 0,
    });
  });

  it('leaves a comment that mentions the module as written', () => {
    const source = `// Demo content comes from ${DEMO_CONTENT_MODULE}.\nexport const x = 1;\n`;
    expect(replaceDemoContent(source)).toEqual({
      source,
      demoContentReplaced: 0,
    });
  });

  it('imports Text under a unique alias when a module-level destructuring already binds Text', () => {
    const source =
      CARD +
      DEMO +
      'const {Text} = Typography;\n' +
      'export default function Example() {\n' +
      '  return <Card><Text>Title</Text><PlayingCardContents rank="Q" suit="hearts" /></Card>;\n' +
      '}\n';
    const result = replaceDemoContent(source);
    expect(result).toEqual({
      source:
        CARD +
        "import {Text as AstryxText} from '@astryxdesign/core/Text';\n" +
        'const {Text} = Typography;\n' +
        'export default function Example() {\n' +
        '  return <Card><Text>Title</Text><AstryxText>Card content</AstryxText></Card>;\n' +
        '}\n',
      demoContentReplaced: 1,
    });
    expect(() => parse(result.source)).not.toThrow();
  });

  it('imports Text under a unique alias when a local declaration named Text exists', () => {
    const source = `${DEMO}function Text() { return null; }\nconst a = <PlayingCardContents rank="Q" suit="hearts" />;\n`;
    expect(replaceDemoContent(source)).toEqual({
      source:
        "import {Text as AstryxText} from '@astryxdesign/core/Text';\n" +
        'function Text() { return null; }\n' +
        'const a = <AstryxText>Card content</AstryxText>;\n',
      demoContentReplaced: 1,
    });
  });

  it('does not use an Astryx Text import that a parameter named Text shadows at the element', () => {
    const source =
      "import {Text} from '@astryxdesign/core/Text';\n" +
      DEMO +
      'export const title = <Text>Title</Text>;\n' +
      'export function Face({Text}) {\n' +
      '  return <Text><PlayingCardContents rank="Q" suit="hearts" /></Text>;\n' +
      '}\n';
    const result = replaceDemoContent(source);
    expect(result).toEqual({
      source:
        "import {Text} from '@astryxdesign/core/Text';\n" +
        "import {Text as AstryxText} from '@astryxdesign/core/Text';\n" +
        'export const title = <Text>Title</Text>;\n' +
        'export function Face({Text}) {\n' +
        '  return <Text><AstryxText>Card content</AstryxText></Text>;\n' +
        '}\n',
      demoContentReplaced: 1,
    });
    expect(() => parse(result.source)).not.toThrow();
  });

  it('reuses an Astryx Text import from the package root when it is the binding at every element', () => {
    const source =
      "import {Card, Text} from '@astryxdesign/core';\n" +
      DEMO +
      'export const a = <Card><Text>Title</Text><PlayingCardContents rank="Q" suit="hearts" /></Card>;\n';
    expect(replaceDemoContent(source)).toEqual({
      source:
        "import {Card, Text} from '@astryxdesign/core';\n" +
        'export const a = <Card><Text>Title</Text><Text>Card content</Text></Card>;\n',
      demoContentReplaced: 1,
    });
  });

  it.each([
    [
      'a spread prop',
      `${DEMO}const p = {rank: 'Q'};\nconst a = <PlayingCardContents {...p} />;\n`,
      /spreads props/u,
    ],
    [
      'a prop that runs code',
      `${DEMO}const a = <PlayingCardContents rank={pickRank()} suit="hearts" />;\n`,
      /prop rank is not a literal value or a variable read/u,
    ],
    [
      'a prop whose variable nothing else reads',
      `${DEMO}const r = 'Q';\nconst a = <PlayingCardContents rank={r} suit="hearts" />;\n`,
      /reads r, and nothing else in the file reads it/u,
    ],
    [
      'a prop whose variable is only declared elsewhere',
      `${DEMO}const [isOpen, setIsOpen] = useState(false);\nfunction f({isOpen: x} = {}) {}\nconst a = <PlayingCardContents rank="Q" suit="hearts" faceDown={!isOpen} />;\n`,
      /reads isOpen, and nothing else in the file reads it/u,
    ],
    [
      'children',
      `${DEMO}const a = <PlayingCardContents rank="Q" suit="hearts">Q</PlayingCardContents>;\n`,
      /has children/u,
    ],
    [
      'a use outside JSX',
      `${DEMO}const Face = PlayingCardContents;\n`,
      /PlayingCardContents is used as a value/u,
    ],
    [
      'a shorthand object value',
      `${DEMO}const parts = {PlayingCardContents};\n`,
      /used as a value/u,
    ],
    [
      'a namespace import',
      `import * as Demo from '${DEMO_CONTENT_MODULE}';\nconst a = <Demo.PlayingCardContents rank="Q" suit="hearts" />;\n`,
      /only named value imports/u,
    ],
    [
      'a default import',
      `import Demo from '${DEMO_CONTENT_MODULE}';\n`,
      /only named value imports/u,
    ],
    [
      'a type import',
      `import type {PlayingCardSuit} from '${DEMO_CONTENT_MODULE}';\n`,
      /imported as a type/u,
    ],
    [
      'a re-export',
      `export {PlayingCardContents} from '${DEMO_CONTENT_MODULE}';\n`,
      /outside a static import/u,
    ],
    [
      'a dynamic import',
      `const m = import('${DEMO_CONTENT_MODULE}');\n`,
      /outside a static import/u,
    ],
    [
      'a prop whose variable only another component reads, by the same name',
      `${DEMO}function Face() {\n  const rank = 'Q';\n  return <PlayingCardContents rank={rank} suit="hearts" />;\n}\nfunction Label({rank}) {\n  return rank;\n}\n`,
      /reads rank, and nothing else in the file reads it/u,
    ],
    [
      'source that does not parse',
      `${DEMO}const a = <PlayingCardContents rank="Q" ;\n`,
      /does not parse/u,
    ],
  ])('fails closed on %s', (_label, source, reason) => {
    expect(() => replaceDemoContent(source)).toThrow(reason);
    expect(() => replaceDemoContent(source)).toThrow(
      `Demo content from ${DEMO_CONTENT_MODULE} cannot be replaced safely`,
    );
  });
});

describe('replaceTemplateDemos', () => {
  it('reports both counts, replacing demo content and demo media in one pass', () => {
    const source =
      DEMO +
      'const a = (\n  <>\n    <PlayingCardContents rank="Q" suit="hearts" />\n' +
      '    <img src="/template-assets/hero.png" alt="" />\n  </>\n);\n';
    const result = replaceTemplateDemos(source);
    expect(result.demoContentReplaced).toBe(1);
    expect(result.demoMediaReplaced).toBe(1);
    expect(result.source).not.toContain(DEMO_CONTENT_MODULE);
    expect(result.source).not.toContain('PlayingCardContents');
    expect(result.source).not.toContain('/template-assets/');
  });
});

describe('catalog blocks', () => {
  const blocksDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../assets/templates/blocks',
  );
  /** @param {string} dir @returns {string[]} */
  const tsxFiles = dir =>
    fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return tsxFiles(full);
      return entry.name.endsWith('.tsx') && !entry.name.includes('.test.')
        ? [full]
        : [];
    });
  const files = tsxFiles(blocksDir);

  it('finds the catalog', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('leaves no demo-content reference in any block as a copy writes it', () => {
    const remaining = files.filter(file => {
      const {source} = replaceTemplateDemos(fs.readFileSync(file, 'utf8'));
      return source.includes(DEMO_CONTENT_MODULE);
    });
    expect(remaining).toEqual([]);
  });
});
