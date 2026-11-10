// An app with source written against older Astryx (and legacy XDS) APIs, for
// `upgrade` runs that change files.
import * as path from 'node:path';

export default function (dir, {makeApp, writeFile}) {
  makeApp(dir, {name: 'legacy-app'});
  const w = (rel, text) => writeFile(path.join(dir, rel), text);
  w('src/App.tsx', `'use client';

// The main screen.
import {XDSDialog, XDSSelector, XDSBanner, XDSStack} from '@xds/core';
import {XDSSkeleton} from '@xds/core/Skeleton';
import {useXDSIcon} from '@xds/core/IconRegistry';

export default function App({open, items}: {open: boolean; items: string[]}) {
  const Icon = useXDSIcon('close');
  const css = \`color: var(--color-divider); box-shadow: var(--shadow-1);\`;
  return (
    <XDSStack gap="space2" rowGap={'space1.5'}>
      {/* keep this comment */}
      <XDSDialog isShown={open} onHide={() => {}} title="Hello">
        <XDSSelector items={items} />
      </XDSDialog>
      <XDSBanner endButton={<Icon />} variant="card" initialIsExpanded />
      <XDSSkeleton radius="content" style={{boxShadow: 'var(--elevation-menu)'}} />
    </XDSStack>
  );
}
`);
  w('src/legacy.jsx', `import {XDSTopNav, XDSTopNavTitle} from '@xds/core';
import {XDSStatusDot} from '@xds/core';

export function Header() {
  return (
    <XDSTopNav title="Shop" endSlot={<span>cart</span>}>
      <XDSTopNavTitle title="Home" />
      <XDSStatusDot size="small" variant="positive" />
    </XDSTopNav>
  );
}
`);
  w('src/modern.tsx', `import {Text, Switch, Avatar, TabList, Dialog, Table} from '@astryxdesign/core';

export function Panel({data}: {data: unknown[]}) {
  return (
    <>
      <Text color="active">Hi</Text>
      <Switch labelSpacing="default" label="On" />
      <Avatar size="small" name="A" />
      <TabList orientation="vertical" />
      <Dialog position={{left: 0, top: 8}} />
      <Table data={data} tableProps={{'aria-label': 'Rows', role: 'grid'}} />
    </>
  );
}
`);
  w('src/theme.css', `@import '@xds/core/xds.css';
@layer xds-theme, xds-base;

.xds-button.primary {
  color: red;
}
[data-xds-theme] .xds-card {
  padding: 4px;
}
`);
  w('src/nested/deep/Badge.tsx', `import {XDSBadge} from '@xds/core';

export const Dot = () => <XDSBadge shape="dot" variant="success" />;
`);
}
