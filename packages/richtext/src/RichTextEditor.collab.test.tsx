// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file RichTextEditor.collab.test.tsx
 * @input Uses yjs, y-protocols, @lexical/react collaboration plugins
 * @output Proves the `isCollaborative` prop on Astryx RichTextEditor: an edit
 *   made in one editor reaches a second editor bound to the same Yjs
 *   document, and a client that does not bootstrap seeds nothing into a
 *   shared empty document. Covers the v1 and v2 bindings.
 * @position Unit test for the RichTextEditor collaboration contract.
 *
 * The provider is a local test double — two Y.Docs wired directly to each
 * other — so this exercises the editor and Lexical's CollaborationPlugin,
 * not a transport.
 */
import {afterEach, describe, expect, test} from 'vitest';
import {cleanup, render, waitFor} from '@testing-library/react';
import {createRef} from 'react';
import {
  CollaborationPlugin,
  CollaborationPluginV2__EXPERIMENTAL,
} from '@lexical/react/LexicalCollaborationPlugin';
import {$createParagraphNode, $createTextNode, $getRoot} from 'lexical';
import type {Provider} from '@lexical/yjs';
import {Awareness} from 'y-protocols/awareness';
import * as Y from 'yjs';

import {RichTextEditor, type RichTextEditorRef} from './RichTextEditor';
import {markdownToEditorStateJSON} from './markdownSerializers';

afterEach(cleanup);

const DOC_ID = 'shared-doc';

/** A Provider over one Y.Doc of a directly-linked pair. */
function makeProvider(doc: Y.Doc, peers: Y.Doc[]): Provider {
  // y-protocols types `getLocalState()` as an open record, while Lexical
  // narrows it to the cursor state it writes there. The object is the one
  // Lexical's own provider carries; only the declaration differs.
  const awareness = new Awareness(doc) as unknown as Provider['awareness'];
  const handlers = new Map<string, Set<(value: never) => void>>();
  const emit = (type: string, value: unknown) => {
    for (const fn of [...(handlers.get(type) ?? [])]) {
      (fn as (v: unknown) => void)(value);
    }
  };

  doc.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin === 'remote') {
      return;
    }
    for (const peer of peers) {
      if (peer !== doc) {
        Y.applyUpdate(peer, update, 'remote');
      }
    }
  });

  return {
    awareness,
    connect: () => {
      // A real provider reports sync once it holds the document.
      queueMicrotask(() => emit('sync', true));
    },
    disconnect: () => {},
    off: (type: string, fn: (value: never) => void) => {
      handlers.get(type)?.delete(fn);
    },
    on: (type: string, fn: (value: never) => void) => {
      const set = handlers.get(type) ?? new Set();
      set.add(fn);
      handlers.set(type, set);
    },
  };
}

function collaborativeEditor(
  doc: Y.Doc,
  peers: Y.Doc[],
  {
    shouldBootstrap,
    editorRef,
    label,
  }: {
    shouldBootstrap: boolean;
    editorRef?: React.RefObject<RichTextEditorRef | null>;
    label: string;
  },
) {
  const provider = makeProvider(doc, peers);
  return (
    <RichTextEditor
      label={label}
      isCollaborative
      ref={editorRef}
      plugins={
        <CollaborationPlugin
          id={DOC_ID}
          providerFactory={(id, yjsDocMap) => {
            yjsDocMap.set(id, doc);
            return provider;
          }}
          shouldBootstrap={shouldBootstrap}
        />
      }
    />
  );
}

/** The document's text, read straight from Yjs. */
function yText(doc: Y.Doc): string {
  return doc.get('root', Y.XmlText).toString();
}

describe('RichTextEditor isCollaborative', () => {
  test('an edit in one editor reaches a second bound to the same document', async () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const peers = [docA, docB];
    const refA = createRef<RichTextEditorRef | null>();

    const a = render(
      collaborativeEditor(docA, peers, {
        editorRef: refA,
        label: 'Editor A',
        shouldBootstrap: true,
      }),
    );
    const b = render(
      collaborativeEditor(docB, peers, {
        label: 'Editor B',
        shouldBootstrap: false,
      }),
    );

    await waitFor(() => expect(refA.current?.getEditor()).toBeTruthy());

    // Type into A the way a person does — through the editor, so Lexical's
    // binding is what writes to the shared document.
    const editorA = refA.current!.getEditor();
    editorA.update(() => {
      const paragraph = $createParagraphNode();
      paragraph.append($createTextNode('hello from A'));
      $getRoot().append(paragraph);
    });

    // It lands in A's own view and in the shared document...
    await waitFor(() =>
      expect(a.container.textContent).toContain('hello from A'),
    );
    await waitFor(() => expect(yText(docB)).toContain('hello from A'));

    // ...and renders in the second editor.
    await waitFor(() =>
      expect(b.container.textContent).toContain('hello from A'),
    );
  });

  test('a non-bootstrapping client seeds nothing into an empty document', async () => {
    const doc = new Y.Doc();
    const r = render(
      collaborativeEditor(doc, [doc], {
        label: 'Lone editor',
        shouldBootstrap: false,
      }),
    );
    await waitFor(() => expect(r.getByRole('textbox')).toBeDefined());
    await waitFor(() => expect(yText(doc)).toBe(''));

    // A client that does not bootstrap contributes nothing of its own: what
    // it shows locally is replaced by the document on sync.
    expect(yText(doc)).toBe('');
  });

  test('a local defaultValue is not written into the shared document', async () => {
    const doc = new Y.Doc();
    const provider = makeProvider(doc, [doc]);
    const r = render(
      <RichTextEditor
        label="Seeded editor"
        isCollaborative
        defaultValue={markdownToEditorStateJSON('local seed text')}
        plugins={
          <CollaborationPlugin
            id={DOC_ID}
            providerFactory={(id, yjsDocMap) => {
              yjsDocMap.set(id, doc);
              return provider;
            }}
            shouldBootstrap={false}
          />
        }
      />,
    );
    await waitFor(() => expect(r.getByRole('textbox')).toBeDefined());
    await waitFor(() => expect(yText(doc)).toBe(''));

    // The content of a collaborative editor comes from the document, so a
    // locally seeded `defaultValue` must stay local.
    expect(yText(doc)).not.toContain('local seed text');
  });
});

/**
 * The v2 binding is a separate root — an `XmlElement` at `'root-v2'` rather
 * than v1's `XmlText` at `'root'` — and a separate plugin, so it is covered
 * on its own.
 */
describe('RichTextEditor isCollaborative, v2 binding', () => {
  test('an edit in one editor reaches a second bound to the same document', async () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const peers = [docA, docB];
    const refA = createRef<RichTextEditorRef | null>();

    const editor = (
      doc: Y.Doc,
      label: string,
      editorRef?: React.RefObject<RichTextEditorRef | null>,
    ) => (
      <RichTextEditor
        label={label}
        isCollaborative
        ref={editorRef}
        plugins={
          <CollaborationPluginV2__EXPERIMENTAL
            id={DOC_ID}
            doc={doc}
            provider={makeProvider(doc, peers)}
          />
        }
      />
    );

    const a = render(editor(docA, 'Editor A', refA));
    const b = render(editor(docB, 'Editor B'));

    await waitFor(() => expect(refA.current?.getEditor()).toBeTruthy());
    refA.current!.getEditor().update(() => {
      const paragraph = $createParagraphNode();
      paragraph.append($createTextNode('hello over v2'));
      $getRoot().append(paragraph);
    });

    await waitFor(() =>
      expect(a.container.textContent).toContain('hello over v2'),
    );
    await waitFor(() =>
      expect(docB.get('root-v2', Y.XmlElement).toString()).toContain(
        'hello over v2',
      ),
    );
    await waitFor(() =>
      expect(b.container.textContent).toContain('hello over v2'),
    );
  });

  test('clients that do not bootstrap seed nothing into an empty document', async () => {
    const docs = [new Y.Doc(), new Y.Doc(), new Y.Doc()];
    for (const doc of docs) {
      render(
        <RichTextEditor
          label={`Editor ${docs.indexOf(doc)}`}
          isCollaborative
          plugins={
            <CollaborationPluginV2__EXPERIMENTAL
              id={DOC_ID}
              doc={doc}
              provider={makeProvider(doc, docs)}
            />
          }
        />,
      );
    }

    await waitFor(() =>
      expect(docs[0].get('root-v2', Y.XmlElement).toString()).toBe(
        '<undefined></undefined>',
      ),
    );
    const shared = docs[0].get('root-v2', Y.XmlElement).toString();
    expect(shared.match(/<paragraph>/g) ?? []).toHaveLength(0);
  });
});
