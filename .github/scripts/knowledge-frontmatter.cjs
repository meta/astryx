// Copyright (c) Meta Platforms, Inc. and affiliates.

'use strict';
/* global module */

function parseSingleField(content, field, filePath = '<knowledge record>') {
  if (content == null) return null;
  const escapedField = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `^${escapedField}:\\s*['"]?([a-z-]+)['"]?\\s*$`,
    'gm',
  );
  const matches = [...content.matchAll(pattern)];
  if (matches.length > 1) {
    throw new Error(`${filePath}: duplicate ${field} fields are not allowed.`);
  }
  return matches[0]?.[1] ?? null;
}

function parseAuthority(content, filePath) {
  return parseSingleField(content, 'authority', filePath);
}

function parseKind(content, filePath) {
  return parseSingleField(content, 'kind', filePath);
}

function parseOwnerFile(content) {
  return [
    ...new Set(
      content
        .split(/\r?\n/)
        .map(line => line.replace(/#.*/, ''))
        .flatMap(line => [...line.matchAll(/@([a-z0-9-]+)/gi)])
        .map(match => match[1].toLowerCase()),
    ),
  ];
}

module.exports = {parseAuthority, parseKind, parseOwnerFile, parseSingleField};
