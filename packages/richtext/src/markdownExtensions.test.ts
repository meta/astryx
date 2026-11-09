// Copyright (c) Meta Platforms, Inc. and affiliates.

import {readFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {createHeadlessEditor} from '@lexical/headless';
import {$generateHtmlFromNodes, $generateNodesFromDOM} from '@lexical/html';
import {$getRoot, $insertNodes, $isTextNode} from 'lexical';
import {
  createMarkdownPlugin,
  type MarkdownExtensionNode,
  type MarkdownPluginEntry,
} from '@astryxdesign/core/Markdown/plugins';
import {parseMarkdownAst} from '@astryxdesign/core/Markdown/parser';
import {
  createRichTextExtension,
  editorStateJSONToMarkdown,
  markdownToEditorStateJSON,
  RichTextExtensionError,
} from './markdown';
import {DEFAULT_NODES} from './editorNodes';
import {
  $isRichTextExtensionNode,
  RichTextExtensionNode,
} from './markdownExtensionNode';
import {
  $exportMarkdownKeepingSource,
  importMarkdownKeepingSource,
} from './markdownSource';
import {DEFAULT_TRANSFORMERS} from './markdownTable';

type MentionNode = MarkdownExtensionNode<
  'mentions',
  'mention',
  {readonly label: string},
  'inline'
>;
type NoteNode = MarkdownExtensionNode<
  'notes',
  'note',
  {readonly body: string},
  'block'
>;
type AsideNode = MarkdownExtensionNode<
  'asides',
  'aside',
  {readonly text: string},
  'inline'
>;

const mentions = createMarkdownPlugin<'mentions', MentionNode>({
  name: 'mentions',
  apiVersion: 1,
  parseKey: 'v1',
  syntax: {
    inline: [
      {
        startsWith: ['@{'],
        maxSpan: 80,
        tokenize({source, offset, end}) {
          const close = source.indexOf('}', offset + 2);
          if (close < 0 || close >= end) {
            return {status: 'no-match'};
          }
          return {
            status: 'match',
            end: close + 1,
            node: {
              type: 'extension',
              plugin: 'mentions',
              name: 'mention',
              display: 'inline',
              data: {label: source.slice(offset + 2, close)},
            },
          };
        },
      },
    ],
  },
  renderers: {
    mention: {
      render: () => null,
      toText: node => `@${node.data.label}`,
    },
  },
});

const notes = createMarkdownPlugin<'notes', NoteNode>({
  name: 'notes',
  apiVersion: 1,
  parseKey: 'v1',
  syntax: {
    block: [
      {
        startsWith: [':::note'],
        maxSpan: 500,
        tokenize({source, offset, end}) {
          const close = source.indexOf('\n:::', offset);
          if (close < 0 || close + 4 > end) {
            return {status: 'no-match'};
          }
          return {
            status: 'match',
            end: close + 4,
            node: {
              type: 'extension',
              plugin: 'notes',
              name: 'note',
              display: 'block',
              data: {body: source.slice(offset + 8, close)},
            },
          };
        },
      },
    ],
  },
  renderers: {
    note: {render: () => null, toText: node => node.data.body},
  },
});

// Plugin source that holds base Markdown: emphasis, a link, a list marker.
const asides = createMarkdownPlugin<'asides', AsideNode>({
  name: 'asides',
  apiVersion: 1,
  parseKey: 'v1',
  syntax: {
    inline: [
      {
        startsWith: ['{{'],
        maxSpan: 200,
        tokenize({source, offset, end}) {
          const close = source.indexOf('}}', offset + 2);
          if (close < 0 || close + 2 > end) {
            return {status: 'no-match'};
          }
          return {
            status: 'match',
            end: close + 2,
            node: {
              type: 'extension',
              plugin: 'asides',
              name: 'aside',
              display: 'inline',
              data: {text: source.slice(offset + 2, close)},
            },
          };
        },
      },
    ],
  },
  renderers: {
    aside: {render: () => null, toText: node => node.data.text},
  },
});

const PLUGINS: ReadonlyArray<MarkdownPluginEntry> = [mentions, notes, asides];
const EXTENSIONS = PLUGINS.map(createRichTextExtension);

interface Recognized {
  readonly plugin: string;
  readonly name: string;
  readonly display: string;
  readonly data: unknown;
  readonly source: string | undefined;
}

/** The nodes core recognizes, inline anywhere and block at the top level. */
function coreNodes(markdown: string): Array<Recognized> {
  const found: Array<Recognized> = [];
  const visit = (node: unknown, isTopLevel: boolean) => {
    const candidate = node as {type?: string; children?: Array<unknown>};
    if (candidate.type === 'extension') {
      const extension = node as MarkdownExtensionNode;
      if (extension.display === 'inline' || isTopLevel) {
        found.push({
          plugin: extension.plugin,
          name: extension.name,
          display: extension.display,
          data: extension.data,
          source: extension.source,
        });
      }
      return;
    }
    candidate.children?.forEach(child => visit(child, false));
  };
  parseMarkdownAst(markdown, {plugins: [...PLUGINS]}).children.forEach(block =>
    visit(block, true),
  );
  return found;
}

/** The extension nodes in stored RichText state, in document order. */
function richTextNodes(json: string): Array<Recognized> {
  const found: Array<Recognized> = [];
  const visit = (node: Record<string, unknown>) => {
    if (node.type === 'astryx-markdown-extension') {
      found.push({
        plugin: node.plugin as string,
        name: node.name as string,
        display: node.display as string,
        data: node.data,
        source: node.source as string,
      });
    }
    (node.children as Array<Record<string, unknown>> | undefined)?.forEach(
      visit,
    );
  };
  visit((JSON.parse(json) as {root: Record<string, unknown>}).root);
  return found;
}

/** Every node type in stored RichText state. */
function nodeTypes(json: string): Set<string> {
  const types = new Set<string>();
  const visit = (node: Record<string, unknown>) => {
    types.add(node.type as string);
    if (typeof node.format === 'number' && node.format !== 0) {
      types.add(`format:${node.format}`);
    }
    (node.children as Array<Record<string, unknown>> | undefined)?.forEach(
      visit,
    );
  };
  visit((JSON.parse(json) as {root: Record<string, unknown>}).root);
  return types;
}

const CORPUS: ReadonlyArray<string> = [
  'Hi @{ada} and @{grace}.\n',
  '`@{code}` then @{real} and `@{code}` again @{real}.\n',
  '\\@{escaped} and @{real}\n',
  'Adjacent @{a}@{b} nodes.\n',
  '- item @{list}\n- other\n',
  '> quote @{quoted}\n',
  '| a | b |\n| --- | --- |\n| @{cell} | x |\n',
  '[link @{inside}](https://example.com) after\n',
  '*emphasis @{inside}* and **strong**\n',
  ':::note\nBody with **bold**\n:::\n\nAfter @{x}\n',
  '{{see **this**, [that](https://example.com), and - this}} stays one node.\n',
  '```\n@{fenced}\n```\n',
  'Two paragraphs @{one}\n\nand @{two}\n',
  // A block node that leads its group keeps the group's authored bytes,
  // three blank lines included, through stored state.
  ':::note\nBody\n:::\n\n\n\nAfter @{x}\n',
  // A block that starts on the line after a paragraph line.
  'Intro line @{a}\n:::note\nBody\n:::\nAfter line @{b}\n',
  // The same source as a decoy before the real node: in code, escaped, and in
  // a link destination. Placing the node at the first occurrence fails these.
  '`@{ada}` then @{ada}.\n',
  '\\@{ada} then @{ada}.\n',
  '[x](https://example.com/@{ada}) then @{ada}.\n',
  'Many @{a} @{a} `@{a}` @{a}\n',
  // Nodes inside marks.
  '*emphasis @{inside} here* and **strong @{s}**, ~~struck @{d}~~, ***both @{b}***.\n',
];

describe('createRichTextExtension (spec:AST-064 FR1, FR4)', () => {
  it('adopts a syntax plugin as it is', () => {
    expect(createRichTextExtension(mentions).name).toBe('mentions');
  });

  it('refuses a plugin that declares a transform, naming the plugin and the capability', () => {
    const transforming = createMarkdownPlugin({
      name: 'transforming',
      apiVersion: 1,
      transform: root => root,
    });
    let refusal: unknown;
    try {
      createRichTextExtension(transforming);
    } catch (error) {
      refusal = error;
    }
    expect(refusal).toBeInstanceOf(RichTextExtensionError);
    expect(refusal).toMatchObject({
      name: 'RichTextExtensionError',
      plugin: 'transforming',
      capability: 'transform',
      claimant: null,
    });
    expect(String(refusal)).toContain('"transforming"');
  });

  it('refuses an entry that did not come from createMarkdownPlugin', () => {
    expect(() =>
      createRichTextExtension({
        name: 'forged',
        apiVersion: 1,
      } as unknown as MarkdownPluginEntry),
    ).toThrow('createMarkdownPlugin()');
  });
});

describe('configuration conflicts (spec:AST-064 FR6)', () => {
  it('refuses two extensions for one plugin, and a transformer that owns plugin nodes', () => {
    expect(() =>
      markdownToEditorStateJSON('x', {
        extensions: [
          createRichTextExtension(mentions),
          createRichTextExtension(mentions),
        ],
      }),
    ).toThrow(RichTextExtensionError);
    const owning = {
      dependencies: [RichTextExtensionNode],
      export: () => null,
      regExp: /(?!)/,
      replace: () => false,
      type: 'element',
    } as unknown as (typeof DEFAULT_TRANSFORMERS)[number];
    expect(() =>
      markdownToEditorStateJSON('x', {
        extensions: EXTENSIONS,
        transformers: [...DEFAULT_TRANSFORMERS, owning],
      }),
    ).toThrow(/claim its nodes/);
  });

  it('opens a document whose plugin source holds base syntax with the default transformers', () => {
    const json = markdownToEditorStateJSON(CORPUS[10] ?? '', {
      extensions: EXTENSIONS,
    });
    const types = nodeTypes(json);
    // The aside is one node; its emphasis, link, and list marker are not read.
    expect(types.has('link')).toBe(false);
    expect(types.has('list')).toBe(false);
    expect([...types].some(type => type.startsWith('format:'))).toBe(false);
    expect(richTextNodes(json)).toEqual([
      {
        plugin: 'asides',
        name: 'aside',
        display: 'inline',
        data: {text: 'see **this**, [that](https://example.com), and - this'},
        source: '{{see **this**, [that](https://example.com), and - this}}',
      },
    ]);
  });
});

describe('recognition (spec:AST-064 FR5)', () => {
  it.each(CORPUS.map(markdown => [JSON.stringify(markdown), markdown]))(
    'recognizes what core recognizes in %s',
    (_, markdown) => {
      const json = markdownToEditorStateJSON(markdown, {
        extensions: EXTENSIONS,
      });
      expect(richTextNodes(json)).toEqual(coreNodes(markdown));
    },
  );

  it('keeps block syntax nested in a list item as text', () => {
    const markdown = '- item\n\n  :::note\n  nested\n  :::\n';
    const json = markdownToEditorStateJSON(markdown, {extensions: EXTENSIONS});
    expect(richTextNodes(json)).toEqual([]);
    expect(editorStateJSONToMarkdown(json)).toBe(markdown);
  });

  it('keeps plugin syntax as text without the extension', () => {
    const markdown = CORPUS[0] ?? '';
    const json = markdownToEditorStateJSON(markdown);
    expect(richTextNodes(json)).toEqual([]);
    expect(editorStateJSONToMarkdown(json)).toBe(markdown);
  });
});

describe('source authority (spec:AST-064 FR10, FR11)', () => {
  it.each(CORPUS.map(markdown => [JSON.stringify(markdown), markdown]))(
    'round-trips %s byte for byte',
    (_, markdown) => {
      const json = markdownToEditorStateJSON(markdown, {
        extensions: EXTENSIONS,
      });
      expect(editorStateJSONToMarkdown(json)).toBe(markdown);
      // Export needs no plugin: the nodes carry their source.
      expect(
        editorStateJSONToMarkdown(json, {transformers: DEFAULT_TRANSFORMERS}),
      ).toBe(markdown);
    },
  );

  it("stores each node's source, plugin name, protocol version, and data", () => {
    const json = markdownToEditorStateJSON('Hi @{ada}.\n', {
      extensions: EXTENSIONS,
    });
    const paragraph = (
      JSON.parse(json) as {
        root: {children: Array<{children: Array<Record<string, unknown>>}>};
      }
    ).root.children[0];
    const node = paragraph?.children.find(
      child => child.type === 'astryx-markdown-extension',
    );
    expect(node).toMatchObject({
      plugin: 'mentions',
      apiVersion: 1,
      name: 'mention',
      display: 'inline',
      data: {label: 'ada'},
      source: '@{ada}',
    });
    expect(node).not.toHaveProperty('parseKey');
  });

  it('rewrites nothing in a node when the text beside it changes, and moves its bytes with it', () => {
    const editor = createHeadlessEditor({
      nodes: [...DEFAULT_NODES],
      onError(error) {
        throw error;
      },
    });
    importMarkdownKeepingSource(
      editor,
      'Hi @{ada}   and *more*.\n\n{{keep **this** exactly}}\n',
      [...DEFAULT_TRANSFORMERS],
      PLUGINS,
    );
    editor.update(
      () => {
        const first = $getRoot().getAllTextNodes()[0];
        if ($isTextNode(first)) {
          first.setTextContent('Hello ');
        }
      },
      {discrete: true},
    );
    const exported = editor
      .getEditorState()
      .read(() => $exportMarkdownKeepingSource([...DEFAULT_TRANSFORMERS]));
    expect(exported).toContain('Hello @{ada}');
    expect(exported).toContain('{{keep **this** exactly}}');
  });
});

/** Edits the first text node whose text includes `find`, then exports. */
function editAndExport(
  markdown: string,
  find: string,
  replace: string,
): string {
  const editor = createHeadlessEditor({
    nodes: [...DEFAULT_NODES],
    onError(error) {
      throw error;
    },
  });
  importMarkdownKeepingSource(
    editor,
    markdown,
    [...DEFAULT_TRANSFORMERS],
    PLUGINS,
  );
  editor.update(
    () => {
      const target = $getRoot()
        .getAllTextNodes()
        .find(node => node.getTextContent().includes(find));
      if (!$isTextNode(target)) {
        throw new Error(`No text holds ${find}`);
      }
      target.setTextContent(target.getTextContent().replace(find, replace));
    },
    {discrete: true},
  );
  return editor
    .getEditorState()
    .read(() => $exportMarkdownKeepingSource([...DEFAULT_TRANSFORMERS]));
}

/** Each inline plugin node's source and the formats around it. */
function formatsOf(json: string): Array<[string, number]> {
  const found: Array<[string, number]> = [];
  const visit = (node: Record<string, unknown>) => {
    if (node.type === 'astryx-markdown-extension') {
      found.push([node.source as string, node.format as number]);
    }
    (node.children as Array<Record<string, unknown>> | undefined)?.forEach(
      visit,
    );
  };
  visit((JSON.parse(json) as {root: Record<string, unknown>}).root);
  return found;
}

/** A paragraph's inline content, with code in backticks and nodes marked. */
function coreLine(markdown: string): string {
  const flat = (node: Record<string, unknown>): string => {
    switch (node.type) {
      case 'text':
        return node.value as string;
      case 'inlineCode':
        return `\`${node.value as string}\``;
      case 'extension':
        return `[[${node.source as string}]]`;
      default:
        return ((node.children as Array<Record<string, unknown>>) ?? [])
          .map(flat)
          .join('');
    }
  };
  const [paragraph] = parseMarkdownAst(markdown, {plugins: [...PLUGINS]})
    .children as unknown as Array<Record<string, unknown>>;
  return paragraph == null ? '' : flat(paragraph);
}

function richTextLine(json: string): string {
  const flat = (node: Record<string, unknown>): string => {
    if (node.type === 'astryx-markdown-extension') {
      return `[[${node.source as string}]]`;
    }
    if (node.type === 'text') {
      const text = node.text as string;
      // Format bit 16 is inline code.
      return ((node.format as number) & 16) !== 0 ? `\`${text}\`` : text;
    }
    return ((node.children as Array<Record<string, unknown>>) ?? [])
      .map(flat)
      .join('');
  };
  const [paragraph] = (
    JSON.parse(json) as {root: {children: Array<Record<string, unknown>>}}
  ).root.children;
  return paragraph == null ? '' : flat(paragraph);
}

describe('placement among same-source decoys (spec:AST-064 FR5)', () => {
  it.each([
    '`@{ada}` then @{ada}.\n',
    '\\@{ada} then @{ada}.\n',
    '[x](https://example.com/@{ada}) then @{ada}.\n',
    'Many @{a} @{a} `@{a}` @{a}\n',
  ])('puts the node where core reads it in %j', markdown => {
    const json = markdownToEditorStateJSON(markdown, {extensions: EXTENSIONS});
    expect(richTextLine(json)).toBe(coreLine(markdown));
  });
});

describe('nodes inside marks (spec:AST-064 FR5, FR10)', () => {
  const MARKED =
    '*emphasis @{inside} here* and **strong @{s}**, ~~struck @{d}~~, ***both @{b}***, [link @{l}](https://example.com).\n';

  it('keep the formats around them', () => {
    const json = markdownToEditorStateJSON(MARKED, {extensions: EXTENSIONS});
    // italic 2, bold 1, strikethrough 4, bold + italic 3. Core reads link
    // text as text, so the mention in the link stays text on both.
    expect(formatsOf(json)).toEqual([
      ['@{inside}', 2],
      ['@{s}', 1],
      ['@{d}', 4],
      ['@{b}', 3],
    ]);
    expect(richTextNodes(json)).toEqual(coreNodes(MARKED));
  });

  it('stay inside their marks when text beside them is edited, and read back the same', () => {
    const exported = editAndExport(MARKED, ' and ', ' or ');
    expect(exported).toBe(MARKED.replace(' and ', ' or '));
    const again = markdownToEditorStateJSON(exported, {extensions: EXTENSIONS});
    expect(formatsOf(again)).toEqual(
      formatsOf(markdownToEditorStateJSON(MARKED, {extensions: EXTENSIONS})),
    );
    // An edit inside the emphasis keeps the node inside it too.
    expect(editAndExport(MARKED, ' here', ' there')).toBe(
      MARKED.replace(' here', ' there'),
    );
  });
});

describe('a mark on a node alone (spec:AST-064 FR10)', () => {
  it('exports when only the node changes, and reads back inside the mark', () => {
    const editor = createHeadlessEditor({
      nodes: [...DEFAULT_NODES],
      onError(error) {
        throw error;
      },
    });
    importMarkdownKeepingSource(
      editor,
      'Ping @{ada} about it.\n',
      [...DEFAULT_TRANSFORMERS],
      PLUGINS,
    );
    editor.update(
      () => {
        const node = $getRoot().getAllTextNodes()[0]?.getNextSibling();
        if (!$isRichTextExtensionNode(node)) {
          throw new Error('No plugin node');
        }
        node.setFormatFlag('bold', true);
      },
      {discrete: true},
    );
    const exported = editor
      .getEditorState()
      .read(() => $exportMarkdownKeepingSource([...DEFAULT_TRANSFORMERS]));
    expect(exported).toBe('Ping **@{ada}** about it.\n');
    expect(
      formatsOf(markdownToEditorStateJSON(exported, {extensions: EXTENSIONS})),
    ).toEqual([['@{ada}', 1]]);
  });
});

describe('a block after a paragraph line (spec:AST-064 FR5)', () => {
  it('splits the paragraph around the block node, as core reads it', () => {
    const markdown = 'Intro line\n:::note\nBody\n:::\nAfter line\n';
    const json = markdownToEditorStateJSON(markdown, {extensions: EXTENSIONS});
    const root = (
      JSON.parse(json) as {root: {children: Array<Record<string, unknown>>}}
    ).root;
    expect(root.children.map(node => node.type)).toEqual([
      'paragraph',
      'astryx-markdown-extension',
      'paragraph',
    ]);
    expect(editorStateJSONToMarkdown(json)).toBe(markdown);
    // An edit regenerates the chunk the block shares with its paragraphs, in
    // canonical form (spec:AST-062 DEC-2): blank lines between the blocks,
    // the same structure, and the node's exact source.
    const edited = editAndExport(markdown, 'Intro', 'Opening');
    expect(edited).toBe('Opening line\n\n:::note\nBody\n:::\n\nAfter line\n');
    const again = (
      JSON.parse(
        markdownToEditorStateJSON(edited, {extensions: EXTENSIONS}),
      ) as {
        root: {children: Array<Record<string, unknown>>};
      }
    ).root;
    expect(again.children.map(node => node.type)).toEqual([
      'paragraph',
      'astryx-markdown-extension',
      'paragraph',
    ]);
  });
});

describe('placement cost', () => {
  it('places 200 list items and 500 identical nodes in a paragraph without a parse per node', () => {
    const list = Array.from({length: 200}, (_, index) => `- item @{n${index}}`)
      .join('\n')
      .concat('\n');
    const paragraph = `${Array.from({length: 500}, () => '@{same}').join(' ')}\n`;
    const started = performance.now();
    const listJson = markdownToEditorStateJSON(list, {extensions: EXTENSIONS});
    const paragraphJson = markdownToEditorStateJSON(paragraph, {
      extensions: EXTENSIONS,
    });
    const elapsed = performance.now() - started;
    expect(richTextNodes(listJson)).toHaveLength(200);
    expect(richTextNodes(paragraphJson)).toHaveLength(500);
    expect(editorStateJSONToMarkdown(paragraphJson)).toBe(paragraph);
    // Every occurrence is a node, so no occurrence needs core to confirm it.
    expect(elapsed).toBeLessThan(5000);
  });
});

describe('plugin nodes as HTML (spec:AST-064 FR7)', () => {
  it('come back as the same nodes, with the same source, from the HTML they copy as', () => {
    const editorWith = () =>
      createHeadlessEditor({
        nodes: [...DEFAULT_NODES],
        onError(error) {
          throw error;
        },
      });
    const source = editorWith();
    importMarkdownKeepingSource(
      source,
      'Hi @{ada}, *see @{grace}*.\n\n:::note\nBody **bold**\n:::\n',
      [...DEFAULT_TRANSFORMERS],
      PLUGINS,
    );
    const html = source
      .getEditorState()
      .read(() => $generateHtmlFromNodes(source, null));
    const target = editorWith();
    target.update(
      () => {
        const dom = new DOMParser().parseFromString(html, 'text/html');
        $getRoot().clear().select();
        $insertNodes($generateNodesFromDOM(target, dom));
      },
      {discrete: true},
    );
    const facts = (editor: typeof source) =>
      editor.getEditorState().read(() =>
        [...$getRoot().getChildren()]
          .flatMap(node =>
            $isRichTextExtensionNode(node)
              ? [node]
              : 'getChildren' in node && typeof node.getChildren === 'function'
                ? (node.getChildren() as Array<unknown>).filter(
                    $isRichTextExtensionNode as (value: unknown) => boolean,
                  )
                : [],
          )
          .map(node => ({
            ...(node as RichTextExtensionNode).getFacts(),
            format: (node as RichTextExtensionNode).getFormat(),
          })),
      );
    expect(facts(target)).toEqual(facts(source));
    // The node inside emphasis keeps its italic format (2) through the HTML.
    expect(
      facts(source).map(({source: text, format}) => [text, format]),
    ).toEqual([
      ['@{ada}', 0],
      ['@{grace}', 2],
      [':::note\nBody **bold**\n:::', 0],
    ]);
  });
});

describe('@astryxdesign/richtext/markdown (spec:AST-064 FR3, FR12)', () => {
  it('imports no React, DOM, or client module', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const seen = new Set<string>();
    const bare = new Set<string>();
    const visit = (file: string) => {
      if (seen.has(file)) {
        return;
      }
      seen.add(file);
      const source = readFileSync(file, 'utf8');
      expect(source, file).not.toMatch(/^\s*['"]use client['"]/m);
      for (const [, specifier] of source.matchAll(
        /^(?:import|export)[^'"]*from\s+['"]([^'"]+)['"]/gm,
      )) {
        if (specifier == null) {
          continue;
        }
        if (specifier.startsWith('.')) {
          const base = resolve(dirname(file), specifier);
          const candidates = [
            `${base}.ts`,
            `${base}.tsx`,
            join(base, 'index.ts'),
          ];
          const next = candidates.find(path => {
            try {
              readFileSync(path);
              return true;
            } catch {
              return false;
            }
          });
          if (next != null) {
            visit(next);
          }
        } else {
          bare.add(specifier);
        }
      }
    };
    visit(join(here, 'markdown.ts'));
    for (const specifier of bare) {
      expect(specifier).not.toMatch(
        /^(react|react-dom|@lexical\/react)(\/|$)|plugin-renderer/,
      );
    }
    expect(bare).toContain('@astryxdesign/core/Markdown/plugins');
  });
});
