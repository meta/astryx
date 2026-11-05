// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {parseGapReportHandler, parseGapReportReceipt} from './parse.mjs';

describe('parseGapReportHandler', () => {
  it('accepts a valid handler with audience and handle', () => {
    const handler = parseGapReportHandler({
      audience: 'internal',
      handle: () => ({status: 'filed', message: 'ok'}),
    });
    expect(handler.audience).toBe('internal');
    expect(typeof handler.handle).toBe('function');
  });

  it('accepts public audience', () => {
    const handler = parseGapReportHandler({
      audience: 'public',
      handle: () => ({status: 'skipped'}),
    });
    expect(handler.audience).toBe('public');
  });

  it('rejects missing audience', () => {
    expect(() => parseGapReportHandler({handle: () => ({})})).toThrow();
  });

  it('rejects invalid audience value', () => {
    expect(() =>
      parseGapReportHandler({audience: 'secret', handle: () => ({})}),
    ).toThrow();
  });

  it('rejects missing handle function', () => {
    expect(() => parseGapReportHandler({audience: 'internal'})).toThrow();
  });

  it('rejects handle that is not a function', () => {
    expect(() =>
      parseGapReportHandler({audience: 'internal', handle: './writer.mjs'}),
    ).toThrow();
  });

  it('rejects unknown fields (strict)', () => {
    expect(() =>
      parseGapReportHandler({
        audience: 'internal',
        handle: () => ({}),
        command: './writer.mjs',
      }),
    ).toThrow();
  });

  it('rejects null input', () => {
    expect(() => parseGapReportHandler(null)).toThrow();
  });

  it('rejects array input', () => {
    expect(() => parseGapReportHandler([])).toThrow();
  });

  it('rejects bare function (not a plain object)', () => {
    const fn = () => ({status: 'filed'});
    fn.audience = 'internal';
    fn.handle = fn;
    expect(() => parseGapReportHandler(fn)).toThrow();
  });
});

describe('parseGapReportReceipt', () => {
  it('accepts valid filed receipt with message', () => {
    const receipt = parseGapReportReceipt({
      status: 'filed',
      message: 'Report created',
    });
    expect(receipt).toEqual({status: 'filed', message: 'Report created'});
  });

  it('accepts valid filed receipt with url', () => {
    const receipt = parseGapReportReceipt({
      status: 'filed',
      url: 'https://example.com/issue/1',
    });
    expect(receipt).toEqual({
      status: 'filed',
      url: 'https://example.com/issue/1',
    });
  });

  it('accepts valid filed receipt with both url and message', () => {
    const receipt = parseGapReportReceipt({
      status: 'filed',
      url: 'https://example.com/issue/1',
      message: 'Created issue #1',
    });
    expect(receipt).not.toBeNull();
    expect(receipt.status).toBe('filed');
  });

  it('accepts valid routed_only with url', () => {
    const receipt = parseGapReportReceipt({
      status: 'routed_only',
      url: 'https://example.com/issues',
    });
    expect(receipt).toEqual({
      status: 'routed_only',
      url: 'https://example.com/issues',
    });
  });

  it('rejects routed_only without url', () => {
    expect(
      parseGapReportReceipt({status: 'routed_only', message: 'no url'}),
    ).toBeNull();
  });

  it('accepts valid skipped without url or message', () => {
    const receipt = parseGapReportReceipt({status: 'skipped'});
    expect(receipt).toEqual({status: 'skipped'});
  });

  it('rejects filed without url or message', () => {
    expect(parseGapReportReceipt({status: 'filed'})).toBeNull();
  });

  it('rejects filed with empty message', () => {
    expect(parseGapReportReceipt({status: 'filed', message: '  '})).toBeNull();
  });

  it('rejects unknown status', () => {
    expect(
      parseGapReportReceipt({status: 'pending', message: 'ok'}),
    ).toBeNull();
  });

  it('rejects unknown fields', () => {
    expect(
      parseGapReportReceipt({status: 'filed', message: 'ok', extra: true}),
    ).toBeNull();
  });

  it('rejects non-http url', () => {
    expect(
      parseGapReportReceipt({status: 'filed', url: 'ftp://example.com'}),
    ).toBeNull();
  });

  it('rejects message over 2000 characters', () => {
    expect(
      parseGapReportReceipt({
        status: 'filed',
        message: 'x'.repeat(2001),
      }),
    ).toBeNull();
  });

  it('accepts message of exactly 2000 characters', () => {
    const receipt = parseGapReportReceipt({
      status: 'filed',
      message: 'x'.repeat(2000),
    });
    expect(receipt).not.toBeNull();
  });

  it('rejects null input', () => {
    expect(parseGapReportReceipt(null)).toBeNull();
  });

  it('rejects string input', () => {
    expect(parseGapReportReceipt('filed')).toBeNull();
  });
});
