// Copyright (c) Meta Platforms, Inc. and affiliates.

import {AppShell} from '@astryxdesign/core/AppShell';
import {MobileNavToggle} from '@astryxdesign/core/MobileNav';
import {Heading} from '@astryxdesign/core/Text';
import {TopNav, TopNavHeading, TopNavItem} from '@astryxdesign/core/TopNav';

const LINKS = [
  {label: 'Home', href: '#home'},
  {label: 'Projects', href: '#projects'},
  {label: 'Team', href: '#team'},
  {label: 'Settings', href: '#settings'},
];

export default function App() {
  return (
    <AppShell
      height="auto"
      contentPadding={4}
      mobileNav={{hasToggle: false}}
      topNav={
        <TopNav
          label="Main"
          heading={<TopNavHeading heading="Orbit" />}
          startContent={LINKS.map(link => (
            <TopNavItem
              key={link.label}
              label={link.label}
              href={link.href}
              isSelected={link.label === 'Home'}
            />
          ))}
          endContent={<MobileNavToggle label="Open menu" />}
        />
      }>
      <Heading level={1}>Home</Heading>
    </AppShell>
  );
}
