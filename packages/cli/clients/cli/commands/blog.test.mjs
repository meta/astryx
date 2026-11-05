// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CLI wiring for `blog` now that it's a normal, json-enabled command.
 *
 * Drives the real program in-process (runCli) with `fetch` stubbed so nothing
 * hits the network. Asserts the --json envelopes, the unchanged human output,
 * and that blog is no longer rejected by the --json gate. The offline parsing
 * logic is covered by api/blog/blog.test.mjs.
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {SITE_URL} from '../../../api/blog/_site.mjs';

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <item>
      <title>How Astryx works</title>
      <link>${SITE_URL}/blog/how-astryx-works</link>
      <description>Under the hood &amp; more</description>
      <category>engineering</category>
      <author>Ada</author>
      <author>Grace</author>
      <pubDate>Mon, 29 Jun 2026 00:00:00 GMT</pubDate>
      <atom:link rel="alternate" type="text/plain" href="${SITE_URL}/blog/how-astryx-works.txt" />
    </item>
  </channel>
</rss>`;

const FEED_URL = `${SITE_URL}/rss.xml`;
const TXT_URL = `${SITE_URL}/blog/how-astryx-works.txt`;
const POST_TEXT = '# How Astryx works\n\nThe body of the post.';

/** @param {Record<string, {status: number, body: string}>} routes */
function stubFetch(routes) {
  return vi.fn(async url => {
    const r = routes[String(url)];
    if (!r) return {ok: false, status: 404, text: async () => 'not found'};
    return {ok: r.status < 400, status: r.status, text: async () => r.body};
  });
}

/**
 * Every non-empty field prints as a `key: value` line under its JSON key.
 * @param {string} stdout
 * @param {Record<string, unknown>} fields
 */
function expectFields(stdout, fields) {
  const lines = stdout.split('\n');
  for (const [key, value] of Object.entries(fields)) {
    if (value == null || value === '' || (Array.isArray(value) && !value.length)) continue;
    const shown = Array.isArray(value) ? value.join(', ') : String(value);
    expect(
      lines.some(line => line.startsWith(`${key}:`) && line.trimEnd().endsWith(shown)),
      `${key}: ${shown}`,
    ).toBe(true);
  }
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    stubFetch({
      [FEED_URL]: {status: 200, body: FEED},
      [TXT_URL]: {status: 200, body: POST_TEXT},
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('blog CLI — json-enabled', () => {
  it('blog --json emits a valid blog.list envelope', async () => {
    const {status, stdout} = await runCli(['blog', '--json']);
    expect(status).toBe(0);
    const env = JSON.parse(stdout);
    expect(env.apiVersion).toBeDefined();
    expect(env.type).toBe('blog.list');
    expect(Array.isArray(env.data.posts)).toBe(true);
    expect(env.data.posts[0].slug).toBe('how-astryx-works');
  });

  it('blog <slug> --json emits a blog.detail envelope with the post text', async () => {
    const {status, stdout} = await runCli(['blog', 'how-astryx-works', '--json']);
    expect(status).toBe(0);
    const env = JSON.parse(stdout);
    expect(env.type).toBe('blog.detail');
    expect(env.data.text).toBe(POST_TEXT);
  });

  it('is no longer rejected by the --json gate (blog is now supported)', async () => {
    const {status, stdout} = await runCli(['blog', '--json']);
    expect(status).toBe(0);
    // A gated/unsupported command would emit an { error } envelope + exit 1.
    expect(JSON.parse(stdout).error).toBeUndefined();
  });

  it('blog (non-json) still prints the human feed listing', async () => {
    const {status, stdout} = await runCli(['blog']);
    expect(status).toBe(0);
    expect(stdout).toMatch(/Astryx blog/);
    expect(stdout).toMatch(/^feedUrl:/m);
    expect(stdout).toMatch(/how-astryx-works/);
  });

  it('the text list projects every JSON field under its JSON key', async () => {
    const env = JSON.parse((await runCli(['blog', '--json'])).stdout);
    const {status, stdout} = await runCli(['blog']);
    expect(status).toBe(0);
    expectFields(stdout, {feedUrl: env.data.feedUrl});
    for (const post of env.data.posts) expectFields(stdout, post);
    expect(stdout).not.toMatch(/^feed:/m);
  });

  it('the text detail projects every JSON field, then the post body', async () => {
    const env = JSON.parse(
      (await runCli(['blog', 'how-astryx-works', '--json'])).stdout,
    );
    const {status, stdout} = await runCli(['blog', 'how-astryx-works']);
    expect(status).toBe(0);
    const {text, ...fields} = env.data;
    expectFields(stdout, fields);
    expect(stdout).toContain(text);
    expect(stdout).not.toMatch(/^feed:/m);
  });

  it('surfaces the API error code and exits non-zero for an unknown slug (--json)', async () => {
    const {status, stdout} = await runCli(['blog', 'no-such-post', '--json']);
    expect(status).not.toBe(0);
    const env = JSON.parse(stdout);
    expect(env.error).toBeDefined();
    expect(env.code).toBe('ERR_UNKNOWN_POST');
  });
});
