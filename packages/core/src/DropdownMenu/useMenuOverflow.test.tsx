// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, describe, expect, it, vi} from 'vitest';
import {render} from '@testing-library/react';
import {useRef} from 'react';
import {useMenuOverflow} from './useMenuOverflow';

/** A menu whose list remounts when a footer comes or goes, as DropdownMenu's does. */
function Menu({hasFooter}: {hasFooter: boolean}) {
  const listRef = useRef<HTMLDivElement>(null);
  useMenuOverflow(listRef, 'rows', true);
  const list = <div ref={listRef} data-testid="list" />;
  return hasFooter ? (
    <section>
      {list}
      <footer>Footer</footer>
    </section>
  ) : (
    list
  );
}

describe('useMenuOverflow', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('observes the list element that is mounted now, after it remounts', () => {
    const observed: Element[] = [];
    const disconnected: Element[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        private targets: Element[] = [];
        observe(target: Element) {
          this.targets.push(target);
          observed.push(target);
        }
        disconnect() {
          disconnected.push(...this.targets);
        }
        unobserve() {}
      },
    );
    const {rerender, getByTestId} = render(<Menu hasFooter={false} />);
    const first = getByTestId('list');
    expect(observed.at(-1)).toBe(first);

    rerender(<Menu hasFooter />);
    const second = getByTestId('list');
    expect(second).not.toBe(first);
    expect(observed.at(-1)).toBe(second);
    expect(disconnected).toContain(first);
  });
});
