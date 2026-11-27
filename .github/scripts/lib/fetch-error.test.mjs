// Copyright (c) Meta Platforms, Inc. and affiliates.

import http from 'node:http';
import {createRequire} from 'node:module';
import {describe, expect, it} from 'vitest';

const require = createRequire(import.meta.url);
const {request} = require('@playwright/test');
const {safeFetchError} = require('./fetch-error.js');

// Fake values only, so a failing case prints no real header either.
const HEADERS = {
  cookie: 'session=FAKE-COOKIE',
  authorization: 'Bearer FAKE-TOKEN',
  'user-agent': 'FAKE-AGENT/1.0',
};
const SECRETS = [
  'FAKE-COOKIE',
  'FAKE-TOKEN',
  'FAKE-AGENT',
  'FAKE-QUERY',
  'FAKE-SET-COOKIE',
  'FAKE-BODY',
];
const ADDRESS = 'http://docs.example.com/guide/page?token=FAKE-QUERY';

/**
 * A proxy on the loopback host that gives each tunnel to `answer`. The
 * request names a documentation host and never leaves the machine.
 */
async function startProxy(answer) {
  const target = http.createServer(answer);
  const proxy = http.createServer();
  proxy.on('connect', (_request, socket) => {
    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    target.emit('connection', socket);
  });
  await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
  return {
    server: `http://127.0.0.1:${proxy.address().port}`,
    close: () =>
      new Promise(resolve => {
        target.closeAllConnections();
        proxy.close(resolve);
        proxy.closeAllConnections();
      }),
  };
}

/** The error that Playwright throws for a request that `answer` fails. */
async function failedRequest(answer, options = {}) {
  const proxy = await startProxy(answer);
  const context = await request.newContext({proxy: {server: proxy.server}});
  try {
    await context.get(ADDRESS, {headers: HEADERS, timeout: 10_000, ...options});
  } catch (error) {
    return error;
  } finally {
    await context.dispose();
    await proxy.close();
  }
  throw new Error('The planted request did not fail');
}

const textOf = error => `${error.message}\n${error.stack}`;

describe('safeFetchError', () => {
  it('keeps no header, cookie or query of a request that gets no answer', async () => {
    const error = await failedRequest(incoming => incoming.socket.destroy());
    // Playwright's own error lists the request's headers in its call log.
    expect(error.message).toContain('Call log:');
    for (const planted of ['FAKE-COOKIE', 'FAKE-TOKEN', 'FAKE-AGENT']) {
      expect(error.message).toContain(planted);
    }

    const safe = safeFetchError(error);
    for (const secret of SECRETS) {
      expect(textOf(safe)).not.toContain(secret);
    }
    expect(textOf(safe)).not.toContain('Call log:');
    expect(safe.message).toContain(error.message.split('\n')[0]);
    expect(safe.message).toContain('GET http://docs.example.com/guide/page');
  });

  it('keeps the first line, the address and the status of a refused request', async () => {
    const error = await failedRequest(
      (_incoming, response) => {
        response.writeHead(503, {
          'set-cookie': 'session=FAKE-SET-COOKIE',
          'content-type': 'text/plain',
        });
        response.end('FAKE-BODY');
      },
      {failOnStatusCode: true},
    );
    expect(error.message).toContain('FAKE-COOKIE');

    const safe = safeFetchError(error);
    for (const secret of SECRETS) {
      expect(textOf(safe)).not.toContain(secret);
    }
    expect(safe.message).toContain(error.message.split('\n')[0]);
    expect(safe.message).toContain('GET http://docs.example.com/guide/page');
    expect(safe.message).toContain('503');
  });

  it('reports the last hop of a redirected request that gets no answer', async () => {
    const error = await failedRequest((incoming, response) => {
      if (incoming.url.startsWith('/guide/page')) {
        response.writeHead(302, {
          location: '/guide/next?token=FAKE-QUERY',
          'set-cookie': 'session=FAKE-SET-COOKIE',
        });
        response.end();
        return;
      }
      incoming.socket.destroy();
    });
    // Playwright's own error lists both hops.
    expect(error.message).toContain('302');
    expect(error.message).toContain('/guide/next');

    const safe = safeFetchError(error);
    for (const secret of SECRETS) {
      expect(textOf(safe)).not.toContain(secret);
    }
    expect(safe.message).toContain('GET http://docs.example.com/guide/next');
    expect(safe.message).not.toContain('/guide/page');
    expect(safe.message).not.toMatch(/status \d{3}/);
  });

  it('reports the last hop and its status of a redirected request that is refused', async () => {
    const error = await failedRequest(
      (incoming, response) => {
        if (incoming.url.startsWith('/guide/page')) {
          response.writeHead(302, {location: '/guide/next?token=FAKE-QUERY'});
          response.end();
          return;
        }
        response.writeHead(503, {'set-cookie': 'session=FAKE-SET-COOKIE'});
        response.end('FAKE-BODY');
      },
      {failOnStatusCode: true},
    );
    expect(error.message).toContain('302');
    expect(error.message).toContain('/guide/next');

    const safe = safeFetchError(error);
    for (const secret of SECRETS) {
      expect(textOf(safe)).not.toContain(secret);
    }
    expect(safe.message).toContain('GET http://docs.example.com/guide/next');
    expect(safe.message).toContain('status 503');
    expect(safe.message).not.toContain('302');
  });

  it('drops the query of an address in the first line', () => {
    const safe = safeFetchError(
      new Error(
        'page.goto: net::ERR_FAILED at http://docs.example.com/guide?token=FAKE-QUERY\n' +
          'Call log:\n  - navigating to "http://docs.example.com/guide?token=FAKE-QUERY"',
      ),
    );
    expect(safe.message).toBe(
      'page.goto: net::ERR_FAILED at http://docs.example.com/guide',
    );
  });

  it('drops the credentials of an address', () => {
    const safe = safeFetchError(
      new Error(
        'page.goto: net::ERR_FAILED at http://user:FAKE-PASS@docs.example.com/guide\n' +
          'Call log:\n  - → GET http://user:FAKE-PASS@docs.example.com/guide',
      ),
    );
    expect(safe.message).toBe(
      'page.goto: net::ERR_FAILED at http://docs.example.com/guide (GET http://docs.example.com/guide)',
    );
  });

  it('drops the credentials of an address that does not parse', () => {
    const safe = safeFetchError(
      new Error(
        'route.fetch: Invalid URL http://user:FAKE-PASS@[docs.example.com/guide?token=FAKE-QUERY',
      ),
    );
    expect(safe.message).toBe(
      'route.fetch: Invalid URL http://[docs.example.com/guide',
    );
  });

  it('keeps the name of a timeout', () => {
    const timeout = new Error(
      'route.fetch: Timeout 100ms exceeded.\nCall log:\n  - → GET http://docs.example.com/guide',
    );
    timeout.name = 'TimeoutError';
    expect(safeFetchError(timeout).name).toBe('TimeoutError');
  });
});
