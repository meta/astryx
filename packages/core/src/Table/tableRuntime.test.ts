// Copyright (c) Meta Platforms, Inc. and affiliates.
import {afterEach, describe, expect, it, vi} from 'vitest';
import {createTableRuntime as createLeanRuntime} from './tableRuntime';
import {createTableGeometryDriver} from './plugins/virtualization/tableGeometry';

const createTableRuntime = () => createLeanRuntime(createTableGeometryDriver);
import {publishScrollGeometry} from '../hooks/scrollGeometrySubscriptions';
import {focusForLastInputTemporarily} from '../utils/focusReturn';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});
function fixture() {
  const viewport = document.createElement('div');
  const table = document.createElement('table');
  const body = document.createElement('tbody');
  table.append(body);
  viewport.append(table);
  document.body.append(viewport);
  const sizeRead = vi.fn();
  Object.defineProperty(viewport, 'clientHeight', {
    get: () => {
      sizeRead('clientHeight');
      return 200;
    },
  });
  Object.defineProperty(viewport, 'scrollHeight', {
    get: () => {
      sizeRead('scrollHeight');
      return 1000;
    },
  });
  const rect = {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    bottom: 200,
    right: 200,
    height: 200,
    width: 200,
    toJSON: () => ({}),
  };
  const viewportRead = vi
    .spyOn(viewport, 'getBoundingClientRect')
    .mockReturnValue(rect);
  const bodyRead = vi
    .spyOn(body, 'getBoundingClientRect')
    .mockReturnValue(rect);
  return {viewport, table, body, viewportRead, bodyRead, sizeRead};
}
describe('Table optional geometry resources', () => {
  it('releases a shared temporary focus stop after the viewport is removed', async () => {
    const f = fixture();
    const runtime = createTableRuntime();
    const detach = runtime.setViewport(f.viewport);
    focusForLastInputTemporarily(f.viewport, {preventScroll: true});
    expect(f.viewport).toHaveFocus();
    f.viewport.remove();
    detach?.();
    await Promise.resolve();
    expect(f.viewport).not.toHaveAttribute('tabindex');
  });
  it('keeps a connected focused viewport through same-commit ref succession', async () => {
    const f = fixture();
    const runtime = createTableRuntime();
    runtime.setViewport(f.viewport);
    focusForLastInputTemporarily(f.viewport, {preventScroll: true});
    runtime.setViewport(null);
    runtime.setViewport(f.viewport);
    await Promise.resolve();
    expect(f.viewport).toHaveFocus();
    expect(f.viewport).toHaveAttribute('tabindex', '-1');
    f.viewport.blur();
    expect(f.viewport).not.toHaveAttribute('tabindex');
  });
  it('tracks viewport refs without measuring or subscribing before a geometry consumer exists', () => {
    const f = fixture();
    const runtime = createTableRuntime();
    runtime.setBody(f.body);
    runtime.setTable(f.table);
    runtime.setViewport(f.viewport);
    publishScrollGeometry(f.viewport, true);
    runtime.refresh(true);
    expect(f.viewportRead).not.toHaveBeenCalled();
    expect(f.bodyRead).not.toHaveBeenCalled();
    expect(runtime.viewport.current).toBe(f.viewport);
    expect(runtime.geometry.getSnapshot().isMeasured).toBe(false);
  });
  it('acquires once for the first listener, reads no rectangles on scroll, and releases when the final listener leaves', () => {
    const f = fixture();
    const runtime = createTableRuntime();
    runtime.setBody(f.body);
    runtime.setViewport(f.viewport);
    const first = vi.fn();
    const second = vi.fn();
    const releaseFirst = runtime.geometry.subscribe(first);
    const releaseSecond = runtime.geometry.subscribe(second);
    expect(runtime.geometry.getSnapshot().isMeasured).toBe(true);
    f.viewportRead.mockClear();
    f.bodyRead.mockClear();
    f.sizeRead.mockClear();
    f.viewport.scrollTop = 40;
    publishScrollGeometry(f.viewport);
    expect(f.viewportRead).not.toHaveBeenCalled();
    expect(f.bodyRead).not.toHaveBeenCalled();
    expect(f.sizeRead).not.toHaveBeenCalled();
    expect(runtime.geometry.getSnapshot().scrollTop).toBe(40);
    const before = runtime.geometry.getSnapshot();
    publishScrollGeometry(f.viewport, true);
    expect(f.viewportRead).toHaveBeenCalledTimes(1);
    expect(f.bodyRead).toHaveBeenCalledTimes(1);
    expect(runtime.geometry.getSnapshot().revision).toBe(before.revision + 1);
    expect(runtime.geometry.getSnapshot().layoutRevision).toBe(
      before.layoutRevision,
    );
    publishScrollGeometry(f.viewport, false, true);
    expect(runtime.geometry.getSnapshot().revision).toBe(before.revision + 2);
    expect(runtime.geometry.getSnapshot().layoutRevision).toBe(
      before.layoutRevision + 1,
    );
    releaseFirst();
    releaseSecond();
    f.viewportRead.mockClear();
    f.bodyRead.mockClear();
    f.viewport.scrollTop = 80;
    publishScrollGeometry(f.viewport, true);
    runtime.setBody(f.body);
    expect(f.viewportRead).not.toHaveBeenCalled();
    expect(f.bodyRead).not.toHaveBeenCalled();
    const releaseAgain = runtime.geometry.subscribe(first);
    expect(runtime.geometry.getSnapshot().scrollTop).toBe(80);
    releaseAgain();
  });
  it('never receives publications from a viewport after its ref is replaced or detached', () => {
    const old = fixture();
    const next = fixture();
    const runtime = createTableRuntime();
    runtime.setBody(old.body);
    runtime.setViewport(old.viewport);
    const release = runtime.geometry.subscribe(vi.fn());
    runtime.setViewport(next.viewport);
    runtime.setBody(next.body);
    next.viewportRead.mockClear();
    publishScrollGeometry(old.viewport, true);
    expect(next.viewportRead).not.toHaveBeenCalled();
    runtime.setViewport(null);
    publishScrollGeometry(next.viewport, true);
    expect(next.viewportRead).not.toHaveBeenCalled();
    release();
  });
});
