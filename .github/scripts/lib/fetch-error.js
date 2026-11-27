// Copyright (c) Meta Platforms, Inc. and affiliates.

'use strict';
/* global module */

/**
 * @file Removes Playwright's call log from the error of a failed request.
 * @input An error that `route.fetch()` or an `APIRequestContext` request threw.
 * @output A new error with the first line of the message, the method and
 *   address of the last request in the call log, and the status of the
 *   answer to that request. Each address keeps only its origin and path,
 *   with no credentials or query. The call log lists the headers of the
 *   request and of the response, cookies and authorization included, so it
 *   is not kept.
 * @position Used where a spec makes a request with `route.fetch()` or with
 *   the `request` fixture: the docsite's end-to-end specs, and the browser
 *   specs through `@astryxdesign/a11y-spec/playwright`.
 * SYNC: fetch-error.d.ts declares this export for TypeScript callers.
 */

const MAX_LINE = 300;
const MAX_ADDRESS = 200;
// In a call log, `→ GET https://…` starts a request and `← 503 …` its answer.
// A redirect adds a request, so the last `→` names the one that failed, and
// only a `←` after it is that request's answer.
const REQUEST = /^\s*-\s+→\s+([A-Z]+)\s+(\S+)/gm;
const RESPONSE = /^\s*-\s+←\s+(\d{3})\b/gm;
const ADDRESS = /\bhttps?:\/\/[^\s"']+/g;
// The user name and password before the host: `user:password@`.
const CREDENTIALS = /^(https?:\/\/)[^/@\s]*@/;

function originAndPath(address) {
  try {
    const url = new URL(address);
    return `${url.origin}${url.pathname}`;
  } catch {
    return address.split(/[?#]/)[0].replace(CREDENTIALS, '$1');
  }
}

/**
 * Returns an error that keeps what is necessary to debug a failed request and
 * drops its call log. Throw it in place of the error.
 */
function safeFetchError(error) {
  const message = error instanceof Error ? error.message : String(error);
  const firstLine = message
    .split('\n')[0]
    .replace(ADDRESS, address => originAndPath(address))
    .slice(0, MAX_LINE);
  const facts = [];
  const request = [...message.matchAll(REQUEST)].at(-1);
  if (request) {
    facts.push(
      `${request[1]} ${originAndPath(request[2]).slice(0, MAX_ADDRESS)}`,
    );
  }
  const response = [...message.matchAll(RESPONSE)].at(-1);
  if (response && (request == null || response.index > request.index)) {
    facts.push(`status ${response[1]}`);
  }
  const safe = new Error(
    facts.length === 0 ? firstLine : `${firstLine} (${facts.join(', ')})`,
  );
  if (error instanceof Error && error.name !== 'Error') {
    safe.name = error.name;
  }
  return safe;
}

module.exports = {safeFetchError};
