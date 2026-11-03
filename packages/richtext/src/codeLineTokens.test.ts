// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, vi, beforeEach} from 'vitest';
import type * as codeBlock from '@astryxdesign/core/CodeBlock';
import {tokenize} from '@astryxdesign/core/CodeBlock';
import {CodeLineTokens} from './codeLineTokens';

vi.mock('@astryxdesign/core/CodeBlock', async importOriginal => {
  const actual = await importOriginal<typeof codeBlock>();
  return {...actual, tokenize: vi.fn(actual.tokenize)};
});

const tokenizer = vi.mocked(tokenize);

beforeEach(() => {
  tokenizer.mockClear();
});

/** What the cache must always hold: a full `tokenize` of its code. */
function expectWhole(lines: CodeLineTokens, language: string) {
  const text = lines.text;
  let start = 0;
  expect({tokens: lines.tokens, starts: lines.starts}).toEqual({
    tokens: tokenize(text, language),
    starts: text.split('\n').map(line => {
      const lineStart = start;
      start += line.length + 1;
      return lineStart;
    }),
  });
}

/** The characters the tokenizer read since the last check. */
function charactersTokenized(): number {
  const characters = tokenizer.mock.calls.reduce(
    (sum, [text]) => sum + text.length,
    0,
  );
  tokenizer.mockClear();
  return characters;
}

const DELIMITERS = [
  '"',
  "'",
  '`',
  '"""',
  '/*',
  '*/',
  '//',
  '#',
  '${',
  '}',
  '<<-',
  '\r\n',
  '\\',
  '\n',
  '(',
  ')',
  ' ',
  'x',
];

describe('CodeLineTokens', () => {
  // An edit can recolor lines above it as well as below: removing a closing
  // delimiter reopens a string or comment that started earlier.
  it.each([
    [
      'typescript',
      'function run() {\n  const a = call(1, "row"); // line\n  return a;\n}',
    ],
    ['ts', 'const a = call(1); // line\nresult'],
    ['ts', '/* first\n\nlast */\nconst a = `one\ntwo`;\ncall\n  (a);'],
    ['js', 'const a = 1;\n+// "open\nclose";\nconst b = 2;'],
    ['ts', 'const a = 1; /* note\nstill note */\nconst b = 2;'],
    ['tsx', 'const view = list\n\n  .map(item => item);\nrender\n\n(view)'],
    ['hack', '<?hh\n$x->call();\n/* first\nlast */'],
    ['python', 'def run():\n  x = """first\nlast"""\n  return x'],
    ['python', 'def run():\n  x = call(1, "row") # note\n  return 1\nresult'],
    ['py', 'x = 1\npass\n@decorator\ncall\n (1)'],
    ['python', 'x = "a\nb"\nreturn 1'],
    ['bash', 'echo "row"; # note\nprintf 1\nresult'],
    ['sh', 'echo ${value\n}\necho "row";'],
    ['shell', 'cat <<EOF\necho "body"\nEOF\necho "after";'],
    ['zsh', 'echo $(printf "row")\necho `printf row`;'],
    ['markdown', '# Heading\n```ts\nconst a = 1;\n```\n**bold**'],
    ['yaml', 'name: first\nvalue: |\n  next line\nend: true'],
    ['json', '{\n  "name"\n  : "first",\n  "value": 1\n}'],
  ])(
    'matches a whole %s tokenize through delimiters typed and deleted anywhere',
    (language, text) => {
      const lines = new CodeLineTokens(text, language);
      expectWhole(lines, language);
      for (let i = 0; i <= text.length; i++) {
        for (const inserted of DELIMITERS) {
          lines.replace(i, 0, inserted);
          expectWhole(lines, language);
          lines.replace(i, inserted.length, '');
          expect(lines.text).toBe(text);
          expectWhole(lines, language);
        }
        if (i < text.length) {
          lines.replace(i, 1, '');
          expectWhole(lines, language);
          lines.replace(i, 0, text[i]);
          expectWhole(lines, language);
        }
      }
    },
  );

  it.each(['ts', 'python', 'bash'])(
    'matches a whole %s tokenize through edits at the end of the code',
    language => {
      const lines = new CodeLineTokens('call(1);\nresult', language);
      for (const suffix of [
        'Value',
        '(',
        '  ',
        '\n(1);',
        '\n\n  (1);',
        '\n/* next\nline */',
      ]) {
        const at = lines.text.length;
        lines.replace(at, 0, suffix);
        expectWhole(lines, language);
        lines.replace(at, suffix.length, '');
        expectWhole(lines, language);
      }
    },
  );

  it.each(['', 'r', 'b', 'u', 'f', 'fr', 'rf'])(
    'keeps Python triple quotes first behind a "%s" prefix',
    prefix => {
      for (const spelling of new Set([prefix, prefix.toUpperCase()])) {
        for (const quote of ['"', "'"]) {
          const text = `x = ${spelling}${quote}${quote}\ny = ${quote.repeat(3)}ok${quote.repeat(3)}`;
          const lines = new CodeLineTokens(text, 'python');
          const at = text.indexOf(quote);
          for (const inserted of [quote, quote.repeat(2), quote.repeat(3)]) {
            lines.replace(at, 0, inserted);
            expectWhole(lines, 'python');
            lines.replace(at, inserted.length, '');
            expectWhole(lines, 'python');
          }
        }
      }
    },
  );

  it('recolors a name ending an earlier line when the next visible character becomes "("', () => {
    const text = 'const a = call\n\n  \n  value;\nnext();';
    const lines = new CodeLineTokens(text, 'ts');
    const at = text.indexOf('value');
    const types = () => lines.tokens[0].map(token => token.type);
    expect(types()).not.toContain('function');
    charactersTokenized();
    expect(lines.replace(at, 0, '(')).toEqual([0, 3]);
    expectWhole(lines, 'ts');
    expect(types()).toContain('function');
    expect(lines.replace(at, 1, '')).toEqual([0, 3]);
    expectWhole(lines, 'ts');
    expect(types()).not.toContain('function');
    // Typing elsewhere on the line leaves the name above alone.
    expect(lines.replace(at + 2, 0, 'x')).toEqual([3]);
  });

  it.each([
    ['python', 'value = """closed"""'],
    ['bash', 'echo ${value};'],
    ['sh', 'cat <<-EOF'],
    ['shell', 'echo `date`;'],
    ['zsh', 'echo $(date);'],
    ['ts', 'const a = /* open'],
    ['notalanguage', 'value'],
  ])(
    'tokenizes all of a %s block holding `%s`, whose tokens may reach other lines',
    (language, unsafe) => {
      const ordinary =
        language === 'python' ? 'value = call(1)' : 'echo "row";';
      const text = `${unsafe}\n${ordinary}\nresult`;
      const lines = new CodeLineTokens(text, language);
      charactersTokenized();
      expect(lines.replace(text.indexOf(ordinary), 0, 'x')).toBeNull();
      expect(charactersTokenized()).toBe(text.length + 1);
      expectWhole(lines, language);
    },
  );

  it.each(
    [200, 2000].flatMap(count =>
      [
        ['ts', 'const value = call(1, "row"); // note'],
        ['python', 'value = call(1) # note'],
        ['bash', 'echo "row" $value # note'],
      ].map(([language, line]) => ({count, language, line})),
    ),
  )(
    'tokenizes only the edited $language line in a $count-line block',
    ({count, language, line}) => {
      const text = Array.from({length: count}, () => line).join('\n');
      const lines = new CodeLineTokens(text, language);
      const middle = lines.starts[count / 2];
      charactersTokenized();
      for (const at of [middle, middle + line.length]) {
        expect(lines.replace(at, 0, 'x')).toEqual([count / 2]);
        expect(charactersTokenized()).toBeLessThan(2 * line.length);
        expectWhole(lines, language);
        lines.replace(at, 1, '');
        expectWhole(lines, language);
        charactersTokenized();
      }
    },
  );

  it('keeps offsets exact through edits in a 2,000-line block', () => {
    const text = Array.from(
      {length: 2000},
      (_, i) => `const value_${i} = call(${i}, "row"); // line ${i}`,
    ).join('\n');
    const lines = new CodeLineTokens(text, 'ts');
    const offset = text.indexOf('value_1000');
    for (const inserted of ['x', '']) {
      lines.replace(offset, inserted ? 0 : 1, inserted);
      expectWhole(lines, 'ts');
    }
    lines.replace(offset, 0, '"');
    expectWhole(lines, 'ts');
    lines.replace(offset, 1, '');
    expectWhole(lines, 'ts');
    expect(lines.text).toBe(text);
  });
});
