// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useRef, type ComponentPropsWithRef} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {Link, LinkProvider, useLinkComponent} from '@astryxdesign/core/Link';
import {ClickableCard} from '@astryxdesign/core/ClickableCard';
import {Citation} from '@astryxdesign/core/Citation';
import {Markdown} from '@astryxdesign/core/Markdown';
import {useClickableContainer} from '@astryxdesign/core/hooks';

type Destination = string | {protocol?: string; pathname: string};

function RouterLink({
  href,
  to,
  ...props
}: Omit<ComponentPropsWithRef<'a'>, 'href'> & {
  href?: Destination;
  to?: Destination;
}) {
  const destination = to ?? href;
  if (destination == null) {
    throw new Error('Router requires a destination');
  }
  const url =
    typeof destination === 'string'
      ? destination
      : `${destination.protocol ?? ''}${destination.pathname}`;
  return <a {...props} href={url} data-router="true" />;
}

function StructuredLink({href}: {href: string}) {
  const Component = useLinkComponent(RouterLink);
  const colon = href.indexOf(':');
  const to =
    colon === -1
      ? {pathname: href}
      : {protocol: href.slice(0, colon + 1), pathname: href.slice(colon + 1)};
  return (
    <Component to={to} data-testid="structured">
      Structured router
    </Component>
  );
}

function ImperativeSurface({href, target}: {href: string; target?: string}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const handlers = useClickableContainer({containerRef, href, target});
  return (
    <div
      ref={containerRef}
      {...handlers}
      role="presentation"
      data-testid={target ? 'imperative-blank' : 'imperative'}>
      Imperative navigation surface
    </div>
  );
}

function NavigationFixture({href}: {href: string}) {
  return (
    <div data-testid="navigation-fixture" data-destination={href}>
      <div>
        <Link href={href} data-testid="native">
          Native anchor
        </Link>
      </div>
      <LinkProvider component={RouterLink}>
        <div>
          <Link href={href} data-testid="provider">
            Provider router
          </Link>
        </div>
        <ClickableCard
          href={href}
          label="Delegated card surface"
          data-testid="delegated">
          <span>Delegated card surface</span>
        </ClickableCard>
      </LinkProvider>
      <div>
        <Link as={RouterLink} href={href} data-testid="as">
          Per-link router
        </Link>
      </div>
      <div>
        <StructuredLink href={href} />
      </div>
      <div>
        <Citation
          source={{title: 'Citation', url: href}}
          number={1}
          data-testid="citation"
        />
      </div>
      <div data-testid="markdown">
        <Markdown>{`[Markdown link](${href})`}</Markdown>
      </div>
      <div>
        <Link href={href} download="note.txt" data-testid="download">
          Download
        </Link>
      </div>
      <ImperativeSurface href={href} />
      <ImperativeSurface href={href} target="_blank" />
    </div>
  );
}

const meta = {
  title: 'Core/Link Navigation',
  component: NavigationFixture,
  args: {href: '#destination'},
} satisfies Meta<typeof NavigationFixture>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Destinations: Story = {};
