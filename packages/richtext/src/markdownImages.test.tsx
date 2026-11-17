// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect} from 'vitest';
import {render, waitFor} from '@testing-library/react';
import {createRef} from 'react';
import {createHeadlessEditor} from '@lexical/headless';
import {
  $createTextNode,
  $getRoot,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  $parseSerializedNode,
  $getSelection,
  type TextNode,
  CONTROLLED_TEXT_INSERTION_COMMAND,
  SELECTION_CHANGE_COMMAND,
} from 'lexical';
import {$createLinkNode} from '@lexical/link';
import {DEFAULT_NODES} from './editorNodes';
import {RichTextEditor, type RichTextEditorRef} from './RichTextEditor';
import {RichTextEditorAutoLinkPlugin} from './RichTextEditorAutoLinkPlugin';
import {
  editorStateJSONToMarkdown,
  markdownToEditorStateJSON,
} from './markdownSerializers';

/**
 * Image Markdown is source RichText cannot show as a structure
 * (spec:AST-062 FR5). An edit beside it must not change it (FR2), and an edit
 * in its own paragraph must keep every character of it (FR5), so another
 * client still reads an image.
 */

function editAndExport(markdown: string, edit: () => void): string {
  const editor = createHeadlessEditor({
    namespace: 'astryx-markdown-images-test',
    nodes: [...DEFAULT_NODES],
    onError(error: Error) {
      throw error;
    },
  });
  editor.setEditorState(
    editor.parseEditorState(markdownToEditorStateJSON(markdown)),
  );
  editor.update(edit, {discrete: true});
  return editorStateJSONToMarkdown(
    JSON.stringify(editor.getEditorState().toJSON()),
  );
}

/** Types `text` at the end of the first block containing `needle`. */
function $appendToBlockContaining(needle: string, text: string): void {
  const block = $getRoot()
    .getChildren()
    .find(candidate => candidate.getTextContent().includes(needle));
  if (!$isElementNode(block)) {
    throw new Error(`no block contains ${needle}`);
  }
  block.append($createTextNode(text));
}

/** The text node holding the image source `image`. */
function $imageText(image: string): TextNode {
  const node = $getRoot()
    .getAllTextNodes()
    .find(candidate => candidate.getTextContent() === image);
  if (node == null) {
    throw new Error(`no text holds ${image}`);
  }
  return node;
}

const IMAGES = {
  named: '![A chart](https://example.com/chart.png)',
  emptyAlt: '![](https://example.com/chart.png)',
  titled: '![A chart](https://example.com/chart.png "Weekly chart")',
  quotedTitle: `![A (chart)](https://example.com/chart.png "Weekly \\"chart\\" (draft)")`,
  angleDestination: "![A chart](<https://example.com/my chart.png> 'Weekly')",
};

describe('image Markdown through edits (spec:AST-062)', () => {
  for (const [name, image] of Object.entries(IMAGES)) {
    it(`keeps a ${name} image on its own line when the next paragraph changes (FR2)`, () => {
      const source = `${image}\n\nEdit me\n`;
      expect(
        editAndExport(source, () =>
          $appendToBlockContaining('Edit me', ' now'),
        ),
      ).toBe(`${image}\n\nEdit me now\n`);
    });

    it(`keeps a ${name} image inline when the paragraph beside it changes (FR2)`, () => {
      const source = `Before ${image} after\n\nEdit me\n`;
      expect(
        editAndExport(source, () =>
          $appendToBlockContaining('Edit me', ' now'),
        ),
      ).toBe(`Before ${image} after\n\nEdit me now\n`);
    });

    it(`keeps every character of a ${name} image when its own paragraph changes (FR5)`, () => {
      const source = `Before ${image} after\n`;
      expect(
        editAndExport(source, () => $appendToBlockContaining('after', ' now')),
      ).toBe(`Before ${image} after now\n`);
    });

    it(`keeps every character of a ${name} image on its own line when text is added after it (FR5)`, () => {
      const source = `${image}\n`;
      expect(
        editAndExport(source, () =>
          $appendToBlockContaining('chart', ' caption'),
        ),
      ).toBe(`${image} caption\n`);
    });
  }

  it.each([
    ['full', '![A chart][chart]'],
    ['collapsed', '![chart][]'],
    ['shortcut', '![chart]'],
  ])(
    'keeps a %s reference image as written when its paragraph changes (FR5)',
    (_form, image) => {
      const source = `Before ${image} after\n\n[chart]: https://example.com/chart.png\n`;
      expect(
        editAndExport(source, () => $appendToBlockContaining('Before', ' now')),
      ).toBe(
        `Before ${image} after now\n\n[chart]: https://example.com/chart.png\n`,
      );
    },
  );

  it('keeps an image inside a link, and the link around it, through an edit (FR5)', () => {
    const badge =
      '[![Build](https://example.com/badge.svg)](https://example.com/ci)';
    expect(
      editAndExport(`${badge} status\n`, () =>
        $appendToBlockContaining('status', ' now'),
      ),
    ).toBe(`${badge} status now\n`);
  });

  it('leaves an escaped image marker and an image in code as they were (FR3)', () => {
    const source =
      '\\![not an image](https://example.com/a.png) and `![code](x)`\n';
    expect(
      editAndExport(source, () => $appendToBlockContaining('code', ' now')),
    ).toBe(
      '\\![not an image](https://example.com/a.png) and `![code](x)` now\n',
    );
  });

  it('shows an image as its source text, one token a person deletes whole (FR5)', () => {
    const state = JSON.parse(
      markdownToEditorStateJSON(`Before ${IMAGES.emptyAlt} after\n`),
    ) as {
      root: {
        children: Array<{children: Array<{text?: string; mode?: string}>}>;
      };
    };
    const texts = state.root.children[0].children;
    expect(texts.map(node => node.text)).toEqual([
      'Before ',
      IMAGES.emptyAlt,
      ' after',
    ]);
    expect(texts[1].mode).toBe('token');
  });

  it('copies an image within the editor as the same source (FR5)', () => {
    const source = `Before ${IMAGES.titled} after\n\nTarget\n`;
    expect(
      editAndExport(source, () => {
        const copy = $parseSerializedNode(
          $imageText(IMAGES.titled).exportJSON(),
        );
        const target = $getRoot().getChildren()[1];
        if (!$isElementNode(target)) {
          throw new Error('no target paragraph');
        }
        target.append($createTextNode(' '), copy);
      }),
    ).toBe(`Before ${IMAGES.titled} after\n\nTarget ${IMAGES.titled}\n`);
  });

  it('deletes an image whole when a selection takes part of it, and keeps the text around it (FR5)', () => {
    const source = `Before ${IMAGES.named} after\n`;
    expect(
      editAndExport(source, () => {
        const image = $imageText(IMAGES.named);
        const after = image.getNextSibling();
        if (!$isTextNode(after)) {
          throw new Error('no text after the image');
        }
        const selection = image.select(5, 5);
        selection.focus.set(after.getKey(), 0, 'text');
        selection.removeText();
      }),
    ).toBe('Before  after\n');
  });

  it('keeps an image whole when Enter splits its paragraph before or after it (FR5)', () => {
    const source = `Before ${IMAGES.emptyAlt} after\n`;
    const splitAt = (atStart: boolean) =>
      editAndExport(source, () => {
        const image = $imageText(IMAGES.emptyAlt);
        const neighbour = atStart
          ? image.getPreviousSibling()
          : image.getNextSibling();
        if (!$isTextNode(neighbour)) {
          throw new Error('no text beside the image');
        }
        if (atStart) {
          neighbour.selectEnd();
        } else {
          neighbour.selectStart();
        }
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          throw new Error('no range selection');
        }
        selection.insertParagraph();
      });
    expect(splitAt(true)).toBe(`Before \n\n${IMAGES.emptyAlt} after\n`);
    expect(splitAt(false)).toBe(`Before ${IMAGES.emptyAlt}\n\n after\n`);
  });

  it('keeps an image whole when its paragraph joins the one before (FR5)', () => {
    const source = `Lead\n\n${IMAGES.emptyAlt} after\n`;
    expect(
      editAndExport(source, () => {
        const [lead, imageParagraph] = $getRoot().getChildren();
        if (!$isElementNode(lead) || !$isElementNode(imageParagraph)) {
          throw new Error('no paragraphs');
        }
        lead.append($createTextNode(' '), ...imageParagraph.getChildren());
        imageParagraph.remove();
      }),
    ).toBe(`Lead ${IMAGES.emptyAlt} after\n`);
  });

  it('moves a caret placed inside an image to its edge, so typing adds text beside it (FR5)', async () => {
    const markdown = `Before ${IMAGES.titled} after\n`;
    const ref = createRef<RichTextEditorRef>();
    render(
      <RichTextEditor
        label="Notes"
        ref={ref}
        defaultValue={markdownToEditorStateJSON(markdown)}
        plugins={<RichTextEditorAutoLinkPlugin />}
      />,
    );
    await waitFor(() => expect(ref.current?.getEditor()).toBeTruthy());
    const editor = ref.current!.getEditor()!;
    const typeAt = (offset: number, text: string) => {
      editor.update(
        () => {
          $imageText(IMAGES.titled).select(offset, offset);
        },
        {discrete: true},
      );
      editor.update(
        () => {
          editor.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined);
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) {
            throw new Error('no range selection');
          }
          selection.insertText(text);
        },
        {discrete: true},
      );
    };
    typeAt(IMAGES.titled.length - 3, '!');
    expect(ref.current?.getMarkdown()).toBe(`Before ${IMAGES.titled}! after\n`);
    typeAt(2, 'x');
    expect(ref.current?.getMarkdown()).toBe(
      `Before x${IMAGES.titled}! after\n`,
    );
  });

  it('moves a caret still inside an image when a key arrives, so the key lands beside it (FR5)', async () => {
    const markdown = `Before ${IMAGES.emptyAlt} after\n`;
    const ref = createRef<RichTextEditorRef>();
    render(
      <RichTextEditor
        label="Notes"
        ref={ref}
        defaultValue={markdownToEditorStateJSON(markdown)}
      />,
    );
    await waitFor(() => expect(ref.current?.getEditor()).toBeTruthy());
    const editor = ref.current!.getEditor()!;
    editor.update(
      () => {
        $imageText(IMAGES.emptyAlt).select(4, 4);
      },
      {discrete: true},
    );
    editor.update(
      () => {
        editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, 'k');
      },
      {discrete: true},
    );
    expect(ref.current?.getMarkdown()).toBe(
      `Before k${IMAGES.emptyAlt} after\n`,
    );
  });

  it('escapes a ( typed right after a reference image, so it never becomes its destination (FR3)', () => {
    const source = 'See ![logo] here\n\n[logo]: https://example.com/logo.png\n';
    expect(
      editAndExport(source, () => {
        $imageText('![logo]').insertAfter($createTextNode('(beta)'));
      }),
    ).toBe(
      'See ![logo]\\(beta) here\n\n[logo]: https://example.com/logo.png\n',
    );
  });

  it('writes a shortcut reference image before a link in its collapsed form, so the link stays a link (FR3)', () => {
    const source = 'See ![logo] here\n\n[logo]: https://example.com/logo.png\n';
    expect(
      editAndExport(source, () => {
        const link = $createLinkNode('https://example.com/site');
        link.append($createTextNode('site'));
        $imageText('![logo]').insertAfter(link);
      }),
    ).toBe(
      'See ![logo][][site](https://example.com/site) here\n\n[logo]: https://example.com/logo.png\n',
    );
  });

  it('moves a click inside an image to the nearer edge every time, and an arrow key past it (FR5)', async () => {
    const markdown = `Before ${IMAGES.emptyAlt} after\n`;
    const ref = createRef<RichTextEditorRef>();
    render(
      <RichTextEditor
        label="Notes"
        ref={ref}
        defaultValue={markdownToEditorStateJSON(markdown)}
      />,
    );
    await waitFor(() => expect(ref.current?.getEditor()).toBeTruthy());
    const editor = ref.current!.getEditor()!;
    const placeAndType = (offset: number, text: string, arrow = false) => {
      if (arrow) {
        editor.update(
          () => {
            $imageText(IMAGES.emptyAlt).select(0, 0);
          },
          {discrete: true},
        );
        editor
          .getRootElement()
          ?.dispatchEvent(
            new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}),
          );
      }
      editor.update(
        () => {
          $imageText(IMAGES.emptyAlt).select(offset, offset);
          editor.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined);
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) {
            throw new Error('no range selection');
          }
          selection.insertText(text);
        },
        {discrete: true},
      );
    };
    placeAndType(2, 'A');
    placeAndType(3, 'B');
    expect(ref.current?.getMarkdown()).toBe(
      `Before AB${IMAGES.emptyAlt} after\n`,
    );
    placeAndType(1, 'Z', true);
    expect(ref.current?.getMarkdown()).toBe(
      `Before AB${IMAGES.emptyAlt}Z after\n`,
    );
  });
});
