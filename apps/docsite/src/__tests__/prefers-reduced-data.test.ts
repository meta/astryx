// Copyright (c) Meta Platforms, Inc. and affiliates.

// @vitest-environment jsdom

import {afterEach, describe, expect, it} from 'vitest';
import {prefersReducedData} from '../lib/prefersReducedData';

function setConnection(connection: unknown) {
  Object.defineProperty(navigator, 'connection', {
    configurable: true,
    value: connection,
  });
}

describe('prefersReducedData', () => {
  afterEach(() => setConnection(undefined));

  it.each([
    ['a data-saving mode', {saveData: true, effectiveType: '4g'}],
    ['a 2G connection', {saveData: false, effectiveType: '2g'}],
    ['a slow 2G connection', {effectiveType: 'slow-2g'}],
  ])('is true in %s', (_name, connection) => {
    setConnection(connection);
    expect(prefersReducedData()).toBe(true);
  });

  it.each([
    ['a 3G connection', {saveData: false, effectiveType: '3g'}],
    ['a 4G connection', {effectiveType: '4g'}],
    ['a browser that reports no connection', undefined],
  ])('is false on %s', (_name, connection) => {
    setConnection(connection);
    expect(prefersReducedData()).toBe(false);
  });
});
