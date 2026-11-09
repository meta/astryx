// Copyright (c) Meta Platforms, Inc. and affiliates.

import {once} from 'node:events';
import {describe, expect, it, vi} from 'vitest';
import {
  PREVIEW_CONNECT,
  PREVIEW_HELLO,
  acceptPreviewConnect,
  announcePreview,
  connectToPreview,
  createPreviewConnector,
  createPreviewNonce,
  previewSrc,
  readPreviewNonce,
} from '../app/playground/previewChannel';

const parent = {} as MessageEventSource;
const other = {} as MessageEventSource;

function connectEvent(overrides: {
  data?: unknown;
  source?: MessageEventSource | null;
  ports?: readonly MessagePort[];
}) {
  const {port1} = new MessageChannel();
  return {
    data: {type: PREVIEW_CONNECT},
    source: parent,
    ports: [port1],
    ...overrides,
  } as Pick<MessageEvent, 'data' | 'source' | 'ports'>;
}

describe('acceptPreviewConnect', () => {
  it('adopts the port from a connect sent by the parent window', () => {
    const event = connectEvent({});
    expect(acceptPreviewConnect(event, parent)).toBe(event.ports[0]);
  });

  it('rejects a connect from a window that is not the parent', () => {
    expect(acceptPreviewConnect(connectEvent({source: other}), parent)).toBe(
      null,
    );
  });

  it('rejects a connect with no source', () => {
    expect(acceptPreviewConnect(connectEvent({source: null}), parent)).toBe(
      null,
    );
  });

  it('rejects everything while there is no parent window', () => {
    expect(acceptPreviewConnect(connectEvent({}), null)).toBe(null);
    expect(acceptPreviewConnect(connectEvent({}), undefined)).toBe(null);
  });

  it('rejects a connect that carries no port', () => {
    expect(acceptPreviewConnect(connectEvent({ports: []}), parent)).toBe(null);
  });

  it('ignores unrelated message types, ports and all', () => {
    expect(
      acceptPreviewConnect(
        connectEvent({data: {type: 'preview-code'}}),
        parent,
      ),
    ).toBe(null);
    expect(acceptPreviewConnect(connectEvent({data: null}), parent)).toBe(null);
    expect(acceptPreviewConnect(connectEvent({data: 'connect'}), parent)).toBe(
      null,
    );
  });
});

describe('connectToPreview', () => {
  it('offers the frame one end of a fresh channel and returns the other', () => {
    const postMessage = vi.fn();
    const port = connectToPreview({postMessage} as Pick<Window, 'postMessage'>);

    expect(postMessage).toHaveBeenCalledTimes(1);
    const [message, targetOrigin, transfer] = postMessage.mock.calls[0] as [
      {type: string},
      string,
      MessagePort[],
    ];
    expect(message).toEqual({type: PREVIEW_CONNECT});
    // An opaque origin cannot be named, so the offer necessarily targets '*';
    // it carries no data and goes only to the window handle of our own iframe.
    expect(targetOrigin).toBe('*');
    expect(transfer).toHaveLength(1);
    expect(transfer[0]).toBeInstanceOf(MessagePort);
    expect(port).toBeInstanceOf(MessagePort);
    expect(port).not.toBe(transfer[0]);
  });

  it('returns entangled ports — a message sent on one arrives on the other', async () => {
    const captured: MessagePort[] = [];
    const postMessage = (
      _msg: unknown,
      _target: string,
      transfer: MessagePort[],
    ) => {
      captured.push(...transfer);
    };
    const local = connectToPreview({
      postMessage,
    } as unknown as Pick<Window, 'postMessage'>);
    const remote = captured[0];

    const received = new Promise<unknown>(resolve => {
      remote.onmessage = event => resolve(event.data);
    });
    local.postMessage({type: 'preview-code', code: 'x'});
    await expect(received).resolves.toEqual({type: 'preview-code', code: 'x'});
    local.close();
    remote.close();
  });
});

describe('nonce plumbing', () => {
  it('issues unguessable, distinct nonces', () => {
    const a = createPreviewNonce();
    const b = createPreviewNonce();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(b).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toBe(b);
  });

  it('round-trips the nonce through the frame URL fragment', () => {
    const nonce = createPreviewNonce();
    const src = previewSrc(nonce);
    // Fragment, not query: the nonce never reaches the server or a cache key.
    expect(src.startsWith('/playground/preview#')).toBe(true);
    expect(src).not.toContain('?');
    expect(readPreviewNonce(new URL(src, 'https://example.test').hash)).toBe(
      nonce,
    );
  });

  it('reads no nonce from a URL the playground did not issue', () => {
    expect(readPreviewNonce('')).toBe(null);
    expect(readPreviewNonce('#')).toBe(null);
    expect(readPreviewNonce('#code=abc')).toBe(null);
  });

  it('announces the nonce to the parent with a wildcard target', () => {
    const postMessage = vi.fn();
    announcePreview({postMessage} as Pick<Window, 'postMessage'>, 'n-1');
    expect(postMessage).toHaveBeenCalledWith(
      {type: PREVIEW_HELLO, nonce: 'n-1'},
      '*',
    );
  });
});

/**
 * A stand-in for one preview document: the frame window the playground sees,
 * plus the port it adopts from a connect message.
 */
function fakeDocument() {
  const inbox: Array<{type?: string; code?: string}> = [];
  let port: MessagePort | null = null;
  const window = {
    postMessage: (
      _message: unknown,
      _target: string,
      transfer: MessagePort[],
    ) => {
      port = transfer[0];
      port.onmessage = event => inbox.push(event.data);
    },
  } as unknown as Window;
  return {
    window,
    inbox,
    get port() {
      return port;
    },
    hello(nonce: unknown, source: MessageEventSource | null = window) {
      return {data: {type: PREVIEW_HELLO, nonce}, source} as MessageEvent;
    },
  };
}

function connectorHarness() {
  let current = fakeDocument();
  const nonces: string[] = [];
  let counter = 0;
  const received: Array<{type?: string}> = [];
  const onAttested = vi.fn();
  const onReplaced = vi.fn();
  const connector = createPreviewConnector({
    onMessage: event => received.push(event.data as {type?: string}),
    onAttested,
    onReplaced,
    nonce: () => {
      const next = `nonce-${(counter += 1)}`;
      nonces.push(next);
      return next;
    },
  });
  return {
    connector,
    nonces,
    received,
    onAttested,
    onReplaced,
    get doc() {
      return current;
    },
    /**
     * What the host does for a generation: issue() a nonce, then mount a fresh
     * iframe element for it, which hands the connector its window on mount.
     */
    mountGeneration() {
      const nonce = connector.issue();
      current = fakeDocument();
      connector.attachFrame(current.window);
      return {nonce, doc: current};
    },
  };
}

describe('createPreviewConnector', () => {
  it('transfers a port only to the current frame window echoing the outstanding nonce, once', () => {
    const h = connectorHarness();
    const stranger = fakeDocument();

    // Nothing is outstanding before issue(): no hello can be accepted.
    h.connector.attachFrame(h.doc.window);
    h.connector.handleWindowMessage(h.doc.hello('nonce-1'));
    expect(h.doc.port).toBe(null);

    const {nonce, doc} = h.mountGeneration();
    expect(nonce).toBe('nonce-1');

    // Wrong nonce, missing nonce, wrong window, no window: all rejected.
    h.connector.handleWindowMessage(doc.hello('nonce-guess'));
    h.connector.handleWindowMessage(doc.hello(null));
    h.connector.handleWindowMessage(doc.hello(undefined));
    h.connector.handleWindowMessage(doc.hello(nonce, stranger.window));
    h.connector.handleWindowMessage(doc.hello(nonce, null));
    h.connector.handleWindowMessage({
      data: {type: 'preview-ready'},
      source: doc.window,
    } as MessageEvent);
    expect(doc.port).toBe(null);
    expect(stranger.port).toBe(null);
    expect(h.connector.isAttested()).toBe(false);
    expect(h.onAttested).not.toHaveBeenCalled();

    // The right hello from the right window earns exactly one port.
    h.connector.handleWindowMessage(doc.hello(nonce));
    expect(doc.port).toBeInstanceOf(MessagePort);
    expect(h.connector.isAttested()).toBe(true);
    expect(h.onAttested).toHaveBeenCalledTimes(1);
    const firstPort = doc.port;
    h.connector.handleWindowMessage(doc.hello(nonce));
    expect(doc.port).toBe(firstPort);
    expect(h.onAttested).toHaveBeenCalledTimes(1);
  });

  it('flows traffic over the adopted pair in both directions', async () => {
    const h = connectorHarness();
    const {nonce, doc} = h.mountGeneration();
    h.connector.handleWindowMessage(doc.hello(nonce));

    h.connector.post({type: 'preview-code', code: 'A'});
    doc.port!.postMessage({type: 'preview-ready'});
    // A timer turn does not guarantee delivery from Node's MessagePort queue.
    await vi.waitFor(() => {
      expect(doc.inbox.map(m => m.code)).toEqual(['A']);
      expect(h.received.map(m => m.type)).toEqual(['preview-ready']);
    });
    h.connector.stop();
    doc.port!.close();
  });

  it('accepts nothing from any window between issue() and the new element attaching', () => {
    const h = connectorHarness();
    const first = h.mountGeneration();
    h.connector.handleWindowMessage(first.doc.hello(first.nonce));
    expect(first.doc.port).toBeInstanceOf(MessagePort);

    // A new generation is issued while the old element — and whatever
    // document it shows — is still alive, until React commits the new one.
    const nonce = h.connector.issue();
    h.connector.handleWindowMessage(first.doc.hello(nonce));
    h.connector.handleWindowMessage(first.doc.hello(first.nonce));
    expect(h.connector.isAttested()).toBe(false);

    // Once the new element attaches, the old window is still worthless and
    // the new one is answered.
    const next = fakeDocument();
    h.connector.attachFrame(next.window);
    h.connector.handleWindowMessage(first.doc.hello(nonce));
    expect(h.connector.isAttested()).toBe(false);
    h.connector.handleWindowMessage(next.hello(nonce));
    expect(next.port).toBeInstanceOf(MessagePort);
  });

  it('treats the first load of a generation as the attested document arriving', () => {
    const h = connectorHarness();
    const {nonce, doc} = h.mountGeneration();

    // Load before hello (subresources were quick) …
    h.connector.handleFrameLoad();
    expect(h.onReplaced).not.toHaveBeenCalled();
    h.connector.handleWindowMessage(doc.hello(nonce));
    expect(doc.port).toBeInstanceOf(MessagePort);

    // … and hello before load (the compiler script was still downloading).
    const second = h.mountGeneration();
    h.connector.handleWindowMessage(second.doc.hello(second.nonce));
    expect(second.doc.port).toBeInstanceOf(MessagePort);
    h.connector.handleFrameLoad();
    expect(h.onReplaced).not.toHaveBeenCalled();
    expect(h.connector.isAttested()).toBe(true);
  });

  it('on a later load, discards the port and nonce before asking for a new generation', async () => {
    const h = connectorHarness();
    const {nonce, doc: oldDoc} = h.mountGeneration();
    h.connector.handleFrameLoad();
    h.connector.handleWindowMessage(oldDoc.hello(nonce));

    // Previewed code navigated the frame: a second load in this generation.
    // Whatever the frame shows now is not the document we attested.
    const closed = once(oldDoc.port!, 'close');
    h.connector.handleFrameLoad();
    await closed;
    expect(h.onReplaced).toHaveBeenCalledTimes(1);
    expect(h.connector.isAttested()).toBe(false);

    // The replacement document learned the old nonce from the document it
    // displaced and posts from the frame window we used to hold; replaying it
    // earns nothing.
    const hijacker = fakeDocument();
    h.connector.handleWindowMessage(hijacker.hello(nonce, oldDoc.window));
    expect(hijacker.port).toBe(null);
    expect(h.connector.isAttested()).toBe(false);

    // Nothing posted now reaches anyone: the old port is closed.
    h.connector.post({type: 'preview-code', code: 'secret'});
    expect(oldDoc.inbox.map(m => m.code)).not.toContain('secret');

    // The host issues a new generation and mounts a fresh frame; only the
    // document that loads there with the NEW nonce is answered.
    const {nonce: fresh, doc: next} = h.mountGeneration();
    expect(fresh).not.toBe(nonce);
    h.connector.handleWindowMessage(next.hello(nonce));
    expect(next.port).toBe(null);
    h.connector.handleWindowMessage(next.hello(fresh));
    expect(next.port).toBeInstanceOf(MessagePort);
    h.connector.handleFrameLoad();
    expect(h.onReplaced).toHaveBeenCalledTimes(1);

    // The reload-then-edit lifecycle end to end: an edit reaches the NEW
    // document and only it.
    h.connector.post({type: 'preview-code', code: 'B'});
    await vi.waitFor(() => {
      expect(next.inbox.map(m => m.code)).toEqual(['B']);
    });
    expect(oldDoc.inbox.map(m => m.code)).toEqual([]);
    h.connector.stop();
    next.port!.close();
  });

  it('stop() closes the port and forgets the nonce and window', async () => {
    const h = connectorHarness();
    const {nonce, doc} = h.mountGeneration();
    h.connector.handleWindowMessage(doc.hello(nonce));
    const closed = once(doc.port!, 'close');
    h.connector.stop();
    await closed;
    expect(h.connector.isAttested()).toBe(false);
    h.connector.post({type: 'preview-code', code: 'late'});
    expect(doc.inbox).toEqual([]);
    h.connector.handleWindowMessage(doc.hello(nonce));
    expect(h.connector.isAttested()).toBe(false);
  });
});
