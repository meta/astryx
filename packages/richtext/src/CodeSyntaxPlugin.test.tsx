// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, vi, afterEach, beforeAll} from 'vitest';
import {act, cleanup, render, screen, waitFor} from '@testing-library/react';
import {useEffect} from 'react';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {$isCodeNode} from '@lexical/code';
import {
  $createLineBreakNode,
  $createRangeSelection,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  ElementNode,
  type LexicalEditor,
} from 'lexical';
import type * as codeBlock from '@astryxdesign/core/CodeBlock';
import {
  applyHighlightRangesFlat,
  tokenize,
  type CodeLanguage,
  type TokenLine,
} from '@astryxdesign/core/CodeBlock';
import {thrift} from '@astryxdesign/core/CodeBlock/languages/thrift';
import {listedLanguage, sameLanguages} from './codeLanguages';
import {RichTextEditor} from './RichTextEditor';
import {RichTextView} from './RichTextView';
import {markdownToEditorStateJSON} from './markdownSerializers';

vi.mock('@astryxdesign/core/CodeBlock', async importOriginal => {
  const actual = await importOriginal<typeof codeBlock>();
  return {...actual, tokenize: vi.fn(actual.tokenize)};
});

let rangesAdded = 0;

/** jsdom has no CSS Custom Highlight API: named sets of ranges stand in. */
class TestHighlight extends Set<AbstractRange> {
  override add(range: AbstractRange): this {
    rangesAdded++;
    return super.add(range);
  }
}

function stubHighlights(): Map<string, TestHighlight> {
  const registry = new Map<string, TestHighlight>();
  vi.stubGlobal('CSS', {...globalThis.CSS, highlights: registry});
  vi.stubGlobal('Highlight', TestHighlight);
  return registry;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// jsdom's Range has no getBoundingClientRect, which Lexical calls to scroll
// a reconciled selection into view while the editor has focus.
beforeAll(() => {
  if (typeof Range.prototype.getBoundingClientRect !== 'function') {
    Range.prototype.getBoundingClientRect = () => new DOMRect();
  }
});

function CaptureEditor({onReady}: {onReady: (editor: LexicalEditor) => void}) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    onReady(editor);
  }, [editor, onReady]);
  return null;
}

async function mountEditor(
  markdown: string,
  codeLanguages?: ReadonlyArray<CodeLanguage>,
): Promise<LexicalEditor> {
  let editor: LexicalEditor | undefined;
  render(
    <RichTextEditor
      label="Code"
      codeLanguages={codeLanguages}
      defaultValue={markdownToEditorStateJSON(markdown)}
      plugins={<CaptureEditor onReady={live => (editor = live)} />}
    />,
  );
  await waitFor(() => expect(editor).toBeDefined());
  return editor!;
}

function update(editor: LexicalEditor, fn: () => void) {
  act(() => editor.update(fn, {discrete: true}));
}

function $block() {
  const block = $getRoot().getFirstChild();
  if (!$isCodeNode(block)) {
    throw new Error('missing code block');
  }
  return block;
}

/** Rewrites the code block the way typing and pasting build one: a text node
 *  per line, with a line break node between lines. */
function $writeLines(lines: ReadonlyArray<string>) {
  const block = $block();
  block.clear();
  lines.forEach((line, i) => {
    if (i > 0) {
      block.append($createLineBreakNode());
    }
    if (line !== '') {
      block.append($createTextNode(line));
    }
  });
}

/** The text node and offset at `offset` in the code block's text. */
function $pointAt(offset: number): [string, number] {
  let start = 0;
  for (const child of $block().getChildren()) {
    const size = child.getTextContentSize();
    if ($isTextNode(child) && offset <= start + size) {
      return [child.getKey(), offset - start];
    }
    start += size;
  }
  throw new Error(`no text node at ${offset}`);
}

/** Selects `length` characters at `offset` in the code block's text. */
function $selectCode(offset: number, length = 0) {
  const [anchorKey, anchorOffset] = $pointAt(offset);
  const [focusKey, focusOffset] = $pointAt(offset + length);
  const selection = $createRangeSelection();
  selection.anchor.set(anchorKey, anchorOffset, 'text');
  selection.focus.set(focusKey, focusOffset, 'text');
  $setSelection(selection);
}

function $type(text: string) {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    throw new Error('missing selection');
  }
  selection.insertText(text);
}

function codeOf(editor: LexicalEditor): {code: string; language: string} {
  return editor.getEditorState().read(() => ({
    code: $block().getTextContent(),
    language: $block().getLanguage() ?? '',
  }));
}

function codeElement(editor: LexicalEditor): HTMLElement {
  const key = editor.getEditorState().read(() => $block().getKey());
  return editor.getElementByKey(key)!;
}

interface Span {
  type: string;
  start: number;
  end: number;
}

/** Every range in `registry`, as a token type over offsets in the code
 *  element's rendered text (-1 for a range outside it). */
function spansIn(
  registry: ReadonlyMap<string, Set<AbstractRange>>,
  element: HTMLElement,
): Span[] {
  const starts = new Map<Node, number>();
  let offset = 0;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node != null; node = walker.nextNode()) {
    starts.set(node, offset);
    offset += (node as Text).length;
  }
  const at = (node: Node, nodeOffset: number) =>
    starts.has(node) ? starts.get(node)! + nodeOffset : -1;
  const spans: Span[] = [];
  for (const [name, highlight] of registry) {
    for (const range of highlight) {
      spans.push({
        type: name.replace(/^astryx-/, ''),
        start: at(range.startContainer, range.startOffset),
        end: at(range.endContainer, range.endOffset),
      });
    }
  }
  return spans.sort(
    (a, b) =>
      a.start - b.start ||
      a.end - b.end ||
      (a.type < b.type ? -1 : a.type > b.type ? 1 : 0),
  );
}

/**
 * What coloring the block from scratch paints: core CodeBlock's tokens for
 * the whole code, laid over the rendered text line by line when it keeps the
 * line breaks or as one line of offsets when it drops them (nothing when it
 * is neither), and written by core CodeBlock's own range writer.
 */
function fullRepaint(
  element: HTMLElement,
  code: string,
  language: string | CodeLanguage,
): Span[] {
  const rendered = element.textContent ?? '';
  const lines = tokenize(code, language);
  let laid: TokenLine[] | null = null;
  if (rendered === code) {
    laid = lines;
  } else if (rendered === code.replaceAll('\n', '')) {
    const flat: TokenLine = [];
    let offset = 0;
    code.split('\n').forEach((line, i) => {
      for (const token of lines[i] ?? []) {
        flat.push({
          ...token,
          start: offset + token.start,
          end: offset + token.end,
        });
      }
      offset += line.length;
    });
    laid = [flat];
  }
  if (laid == null) {
    return [];
  }
  const live = CSS.highlights;
  const registry = new Map<string, TestHighlight>();
  Object.assign(CSS, {highlights: registry});
  try {
    const remove = applyHighlightRangesFlat(element, laid);
    const spans = spansIn(registry, element);
    remove();
    return spans;
  } finally {
    Object.assign(CSS, {highlights: live});
  }
}

function painted(
  registry: ReadonlyMap<string, Set<AbstractRange>>,
  type: string,
): string[] {
  return [...(registry.get(`astryx-${type}`) ?? [])].map(range =>
    (range as Range).toString(),
  );
}

describe('code block syntax colors (spec:AST-061 FR1)', () => {
  const code = 'let a = 1;\nreturn a;';

  it("colors with core CodeBlock's tokens, line by line where the text keeps its line breaks", async () => {
    const registry = stubHighlights();
    const editor = await mountEditor('```ts\n' + code + '\n```\n');
    expect(codeElement(editor).textContent).toBe(code);
    expect(painted(registry, 'keyword')).toEqual(['let', 'return']);
    expect(spansIn(registry, codeElement(editor))).toEqual(
      fullRepaint(codeElement(editor), code, 'ts'),
    );
  });

  it('lays the tokens over the text as one line where line breaks render without text', async () => {
    const registry = stubHighlights();
    const editor = await mountEditor('```ts\nx\n```\n');
    update(editor, () => $writeLines(code.split('\n')));
    expect(codeElement(editor).textContent).toBe(code.replace('\n', ''));
    expect(painted(registry, 'keyword')).toEqual(['let', 'return']);
    expect(spansIn(registry, codeElement(editor))).toEqual(
      fullRepaint(codeElement(editor), code, 'ts'),
    );
  });

  it('paints a listed language value, as Markdown does (CodeBlock FR13)', async () => {
    const registry = stubHighlights();
    await mountEditor('```thrift\nstruct User {}\n```\n');
    expect(painted(registry, 'keyword')).toEqual([]);
    cleanup();
    await mountEditor('```thrift\nstruct User {}\n```\n', [thrift]);
    expect(painted(registry, 'keyword')).toEqual(['struct']);
    expect(listedLanguage([thrift], 'thrift')).toBe(thrift);
    expect(listedLanguage([thrift], 'graphql')).toBeUndefined();
  });

  it('treats lists naming the same values as the same', () => {
    expect(sameLanguages([thrift], [thrift])).toBe(true);
    expect(sameLanguages(undefined, undefined)).toBe(true);
    expect(sameLanguages([thrift], [])).toBe(false);
    expect(sameLanguages([thrift], undefined)).toBe(false);
  });

  it('colors nothing for a language core does not know, or while the rendered text is not the code', async () => {
    const registry = stubHighlights();
    const editor = await mountEditor('```notalanguage\n' + code + '\n```\n');
    expect([...registry.values()].flatMap(highlight => [...highlight])).toEqual(
      [],
    );
    update(editor, () => $block().setLanguage('ts'));
    expect(painted(registry, 'keyword')).toEqual(['let', 'return']);
    // A pasted line break node beside the imported text's own line breaks
    // leaves the rendered text neither the code nor the code without breaks.
    update(editor, () => {
      $selectCode(code.length);
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        selection.insertRawText('\nlet b;');
      }
    });
    expect(spansIn(registry, codeElement(editor))).toEqual([]);
  });

  it('renders code blocks where the Highlight API is missing', async () => {
    render(
      <RichTextView
        value={markdownToEditorStateJSON('```ts\nlet plain = 1;\n```\n')}
      />,
    );
    expect(await screen.findByText('let plain = 1;')).toBeInTheDocument();
  });
});

type Edit = [find: (code: string) => number, removed: number, inserted: string];

/** Applies each edit, then checks the colors against a full repaint. */
async function expectEditsMatchFullRepaint(
  language: string,
  lines: ReadonlyArray<string>,
  layout: 'text node per line' | 'one text node',
  edits: ReadonlyArray<Edit>,
) {
  const registry = stubHighlights();
  const editor = await mountEditor(
    '```' + language + '\n' + lines.join('\n') + '\n```\n',
  );
  if (layout === 'text node per line') {
    update(editor, () => $writeLines(lines));
  }
  const check = (step: string) => {
    const {code, language: current} = codeOf(editor);
    expect(
      spansIn(registry, codeElement(editor)),
      `${layout}, ${step}: ${JSON.stringify(code)}`,
    ).toEqual(fullRepaint(codeElement(editor), code, current));
  };
  check('as loaded');
  for (const [find, removed, inserted] of edits) {
    const at = find(codeOf(editor).code);
    update(editor, () => {
      $selectCode(at, removed);
      $type(inserted);
    });
    check(`replace ${removed} at ${at} with ${JSON.stringify(inserted)}`);
  }
  cleanup();
}

function indexIn(code: string, text: string): number {
  const at = code.indexOf(text);
  if (at < 0) {
    throw new Error(`missing ${JSON.stringify(text)}`);
  }
  return at;
}
const before = (text: string) => (code: string) => indexIn(code, text);
const after = (text: string) => (code: string) =>
  indexIn(code, text) + text.length;

const TS_LINES = [
  'const a = call(1, "row"); // note',
  'let b = `two`;',
  '/* first */ const c = 3;',
  'function run() {',
  '  return a + b;',
  '}',
];

describe('edited code blocks color exactly as a full repaint does', () => {
  const layouts = ['text node per line', 'one text node'] as const;

  it.each(layouts)(
    'TypeScript, opening and closing strings, comments, and template literals (%s)',
    async layout => {
      await expectEditsMatchFullRepaint('ts', TS_LINES, layout, [
        [after('// note'), 0, 'x'],
        [after('let b = '), 0, '"'],
        [after('let b = "'), 0, 'q'],
        [before('"q'), 2, ''],
        [before('function'), 0, '/*'],
        [after('return a + b;'), 0, ' */'],
        [before('/*function'), 2, ''],
        [after('let b = `two`'), 0, '`'],
        [before('`;'), 1, ''],
        [after('const c = 3;'), 0, ' call'],
        [before('function'), 0, '('],
        [before('(function'), 1, ''],
        [after('row'), 0, 'x'],
        [after('rowx'), 0, '\\'],
        [before('1, "row'), 1, '42'],
        [after('call(42'), 0, '\n'],
        [after('return a'), 0, 'x'],
      ]);
    },
  );

  it.each(layouts)(
    'Python, opening and closing a triple-quoted string (%s)',
    async layout => {
      await expectEditsMatchFullRepaint(
        'python',
        ['def run():', '  x = call(1)', '  return x', 'y = 2'],
        layout,
        [
          [after('x = '), 0, '"""'],
          [after('return x'), 0, '"""'],
          [before('"""call'), 3, ''],
          [after('y = 2'), 0, ' # done'],
          [after('def run'), 0, 'ning'],
        ],
      );
    },
  );

  it.each(layouts)('shell, opening and closing ${ (%s)', async layout => {
    await expectEditsMatchFullRepaint(
      'sh',
      ['echo "row"', 'printf 1', 'exit 0'],
      layout,
      [
        [after('echo '), 0, '${value'],
        [after('printf 1'), 0, '}'],
        [before('${value'), 7, ''],
        [after('exit 0'), 0, ' # ok'],
      ],
    );
  });

  it.each(layouts)(
    'a language without the line cache re-tokenizes each edit (%s)',
    async layout => {
      await expectEditsMatchFullRepaint(
        'css',
        ['.a {', '  color: red;', '}', '/* end */'],
        layout,
        [
          [after('color: red'), 0, ' !important'],
          [before('}'), 0, '/*'],
          [after('/* end */'), 0, 'x'],
        ],
      );
    },
  );

  it('follows line breaks added and removed, and keeps later lines exact', async () => {
    const registry = stubHighlights();
    const editor = await mountEditor('```ts\nx\n```\n');
    update(editor, () => $writeLines(TS_LINES));
    const check = () => {
      const {code} = codeOf(editor);
      expect(spansIn(registry, codeElement(editor))).toEqual(
        fullRepaint(codeElement(editor), code, 'ts'),
      );
    };
    update(editor, () => {
      $selectCode(after('call(1, ')(codeOf(editor).code));
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        selection.insertLineBreak();
      }
    });
    check();
    update(editor, () => {
      $selectCode(after('let b = ')(codeOf(editor).code));
      $type('x + ');
    });
    check();
    update(editor, () => {
      $selectCode(before('\n"row"')(codeOf(editor).code), 1);
      $type('');
    });
    check();
    update(editor, () => {
      $selectCode(after('return a')(codeOf(editor).code));
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        selection.insertRawText(' +\n\t`more`');
      }
    });
    check();
    update(editor, () => {
      $selectCode(after('`more')(codeOf(editor).code));
      $type('!');
    });
    check();
  });

  it('recolors a block whose text nodes are replaced by others with the same text', async () => {
    const registry = stubHighlights();
    const editor = await mountEditor(
      '```ts\n' + TS_LINES.join('\n') + '\n```\n',
    );
    update(editor, () => $writeLines(TS_LINES));
    expect(painted(registry, 'keyword')).toContain('const');
    expect(spansIn(registry, codeElement(editor))).toEqual(
      fullRepaint(codeElement(editor), TS_LINES.join('\n'), 'ts'),
    );
  });

  it('follows the language and restored editor states', async () => {
    const registry = stubHighlights();
    const editor = await mountEditor('```ts\nx\n```\n');
    update(editor, () => $writeLines(TS_LINES));
    const check = () => {
      const {code, language} = codeOf(editor);
      expect(spansIn(registry, codeElement(editor))).toEqual(
        fullRepaint(codeElement(editor), code, language),
      );
    };
    const loaded = editor.getEditorState();
    update(editor, () => {
      $selectCode(after('const c = ')(codeOf(editor).code), 1);
      $type('"three"');
    });
    check();
    const edited = editor.getEditorState();
    act(() => editor.setEditorState(loaded));
    check();
    expect(painted(registry, 'number')).toContain('3');
    act(() => editor.setEditorState(edited));
    check();
    expect(painted(registry, 'string')).toContain('"three"');
    update(editor, () => $block().setLanguage('python'));
    check();
    expect(painted(registry, 'keyword')).not.toContain('const');
  });
});

interface Work {
  tokenizeCalls: number;
  linesTokenized: number;
  charactersTokenized: number;
  textNodesScanned: number;
  blockTextReads: number;
  rangesAdded: number;
}

/** Counts what `run` makes the plugin do: core tokenizer calls and the lines
 *  and characters they read, the DOM text nodes the plugin reads (through
 *  any getter or tree walk), whole-block text reads from the editor state,
 *  and ranges added. */
function measure(run: () => void): Work {
  // The plugin's own modules, not this test file's frames below them.
  const byPlugin = () =>
    /CodeSyntaxPlugin\.tsx|codeLineTokens\.ts/.test(new Error().stack ?? '');
  const scanned = new Set<Node>();
  let blockTextReads = 0;
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      scanned.add(node);
    } else {
      node.childNodes.forEach(visit);
    }
  };
  const restores: Array<() => void> = [];
  const watch = (proto: object, name: string) => {
    const descriptor = Object.getOwnPropertyDescriptor(proto, name)!;
    Object.defineProperty(proto, name, {
      ...descriptor,
      get(this: Node) {
        if (byPlugin()) {
          visit(this);
        }
        return descriptor.get!.call(this);
      },
    });
    restores.push(() => Object.defineProperty(proto, name, descriptor));
  };
  watch(CharacterData.prototype, 'data');
  watch(CharacterData.prototype, 'length');
  watch(Node.prototype, 'nodeValue');
  watch(Node.prototype, 'textContent');
  const createTreeWalker = document.createTreeWalker;
  document.createTreeWalker = function (
    this: Document,
    ...args: Parameters<Document['createTreeWalker']>
  ) {
    const walker = createTreeWalker.apply(this, args);
    const nextNode = walker.nextNode.bind(walker);
    walker.nextNode = () => {
      const node = nextNode();
      if (node != null && byPlugin()) {
        visit(node);
      }
      return node;
    };
    return walker;
  };
  restores.push(() => {
    document.createTreeWalker = createTreeWalker;
  });
  const getTextContent = ElementNode.prototype.getTextContent;
  ElementNode.prototype.getTextContent = function (this: ElementNode) {
    if ($isCodeNode(this) && byPlugin()) {
      blockTextReads++;
    }
    return getTextContent.call(this);
  };
  restores.push(() => {
    ElementNode.prototype.getTextContent = getTextContent;
  });
  const stackTraceLimit = Error.stackTraceLimit;
  Error.stackTraceLimit = 100;
  restores.push(() => {
    Error.stackTraceLimit = stackTraceLimit;
  });
  const tokenizer = vi.mocked(tokenize);
  tokenizer.mockClear();
  rangesAdded = 0;
  try {
    run();
  } finally {
    restores.reverse().forEach(restore => restore());
  }
  const inputs = tokenizer.mock.calls.map(([text]) => text);
  return {
    tokenizeCalls: inputs.length,
    linesTokenized: inputs.reduce(
      (sum, text) => sum + text.split('\n').length,
      0,
    ),
    charactersTokenized: inputs.reduce((sum, text) => sum + text.length, 0),
    textNodesScanned: scanned.size,
    blockTextReads,
    rangesAdded,
  };
}

const LINE = 'const a = 1;';

/** The work one character typed at the end of the middle line costs in a
 *  TypeScript block of `lines` copies of LINE. */
async function typingWork(
  lines: number,
  layout: 'text node per line' | 'one text node',
): Promise<Work> {
  stubHighlights();
  const source = Array.from({length: lines}, () => LINE);
  const editor = await mountEditor('```ts\n' + source.join('\n') + '\n```\n');
  if (layout === 'text node per line') {
    update(editor, () => $writeLines(source));
  }
  const middle = Math.floor(lines / 2);
  update(editor, () => $selectCode(middle * (LINE.length + 1) + LINE.length));
  const work = measure(() => update(editor, () => $type('x')));
  cleanup();
  return work;
}

describe('typing in a long code block re-tokenizes only what it changed', () => {
  // The typed line now ends in a name, which is a function name if the next
  // visible character is `(`, so the next line's first character is
  // tokenized with it: two lines, 15 characters.
  const ONE_LINE = {
    tokenizeCalls: 1,
    linesTokenized: 2,
    charactersTokenized: LINE.length + 3,
    textNodesScanned: 1,
    blockTextReads: 0,
  };

  it('costs the same in 200 and 2,000 lines when each line is a text node', async () => {
    const small = await typingWork(200, 'text node per line');
    const large = await typingWork(2000, 'text node per line');
    expect(large).toEqual(small);
    // The typed line's four tokens: `const`, `=`, `1`, `;`.
    expect(large).toEqual({...ONE_LINE, rangesAdded: 4});
  }, 60000);

  it('tokenizes and reads the same in 200 and 2,000 lines imported as one text node', async () => {
    const small = await typingWork(200, 'one text node');
    const large = await typingWork(2000, 'one text node');
    // Lexical rewrites that one text node whole, so every range in it is
    // replaced; nothing is tokenized or read again.
    expect(small).toEqual({...ONE_LINE, rangesAdded: 200 * 4});
    expect(large).toEqual({...ONE_LINE, rangesAdded: 2000 * 4});
  }, 60000);
});
