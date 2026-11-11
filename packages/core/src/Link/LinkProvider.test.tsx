// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file LinkProvider.test.tsx
 * @input Uses vitest, @testing-library/react, LinkProvider, LinkContext
 * @output Unit tests for the element LinkProvider renders and the value it provides
 * @position Testing; validates LinkProvider.tsx
 *
 * SYNC: When LinkProvider.tsx changes, update tests to match new behavior
 */

import {describe, it, expect} from 'vitest';
import {render} from '@testing-library/react';
import {memo, use} from 'react';
import {LinkContext} from './LinkContext';
import {LinkProvider} from './LinkProvider';

function RouterLink(props: React.ComponentPropsWithRef<'a'>) {
  return <a data-router-link {...props} />;
}

function OtherRouterLink(props: React.ComponentPropsWithRef<'a'>) {
  return <a data-other-router-link {...props} />;
}

describe('LinkProvider', () => {
  it('renders only its children', () => {
    const {container} = render(
      <LinkProvider component={RouterLink}>
        <span data-testid="first" />
        <span data-testid="second" />
      </LinkProvider>,
    );
    expect(Array.from(container.childNodes).map(node => node.nodeName)).toEqual(
      ['SPAN', 'SPAN'],
    );
  });

  it('does not re-render context consumers when the component is unchanged', () => {
    let renders = 0;
    const Consumer = memo(function Consumer() {
      use(LinkContext);
      renders += 1;
      return null;
    });
    function App({component}: {component: typeof RouterLink}) {
      return (
        <LinkProvider component={component}>
          <Consumer />
        </LinkProvider>
      );
    }
    const {rerender} = render(<App component={RouterLink} />);
    expect(renders).toBe(1);
    rerender(<App component={RouterLink} />);
    expect(renders).toBe(1);
    rerender(<App component={OtherRouterLink} />);
    expect(renders).toBe(2);
  });
});
