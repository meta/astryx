// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Button} from '@astryxdesign/core/Button';
import {useScrollLock} from '@astryxdesign/core/hooks';
import {VStack} from '@astryxdesign/core/Layout';
import {Link} from '@astryxdesign/core/Link';
import {colorVars, spacingVars} from '@astryxdesign/core/theme/tokens.stylex';

const styles = stylex.create({
  menu: {
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
    overflowY: 'auto',
    padding: spacingVars['--spacing-4'],
    backgroundColor: colorVars['--color-background-surface'],
  },
});

const MENU_ITEMS = ['Products', 'Pricing', 'Customers', 'Support'];

export default function UseScrollLockHookUsage() {
  const [isOpen, setIsOpen] = useState(false);
  const close = () => setIsOpen(false);
  useScrollLock(isOpen);

  return (
    <>
      <Button label="Menu" onClick={() => setIsOpen(true)} />
      {isOpen && (
        <nav aria-label="Site menu" {...stylex.props(styles.menu)}>
          <VStack gap={4} hAlign="start">
            <Button label="Close menu" variant="secondary" onClick={close} />
            {MENU_ITEMS.map(item => (
              <Link
                key={item}
                href={`#menu-${item.toLowerCase()}`}
                onClick={close}>
                {item}
              </Link>
            ))}
          </VStack>
        </nav>
      )}
    </>
  );
}
