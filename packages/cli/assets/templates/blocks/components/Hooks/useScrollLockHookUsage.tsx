// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useEffect, useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Button} from '@astryxdesign/core/Button';
import {useFocusTrap, useScrollLock} from '@astryxdesign/core/hooks';
import {VStack} from '@astryxdesign/core/Layout';
import {Link} from '@astryxdesign/core/Link';
import {colorVars, spacingVars} from '@astryxdesign/core/theme/tokens.stylex';

const styles = stylex.create({
  menu: {
    width: '100%',
    height: '100%',
    maxWidth: 'none',
    maxHeight: 'none',
    margin: 0,
    borderWidth: 0,
    overflowY: 'auto',
    padding: spacingVars['--spacing-4'],
    color: colorVars['--color-text-primary'],
    backgroundColor: colorVars['--color-background-surface'],
  },
});

const MENU_ITEMS = ['Products', 'Pricing', 'Customers', 'Support'];

export default function UseScrollLockHookUsage() {
  const [isOpen, setIsOpen] = useState(false);
  useScrollLock(isOpen);
  const {containerRef, focusFirst} = useFocusTrap<HTMLDialogElement>({
    isActive: isOpen,
    onEscape: close,
  });

  // The dialog leaves the top layer before the state change, so the page is
  // no longer inert when the focus trap hands focus back to Menu.
  function close() {
    containerRef.current?.close();
    setIsOpen(false);
  }

  useEffect(() => {
    const dialog = containerRef.current;
    if (isOpen && dialog != null && !dialog.open) {
      dialog.showModal();
      focusFirst();
    }
  }, [isOpen, containerRef, focusFirst]);

  return (
    <>
      <Button label="Menu" onClick={() => setIsOpen(true)} />
      <dialog
        ref={containerRef}
        aria-label="Menu"
        onCancel={event => {
          event.preventDefault();
          close();
        }}
        {...stylex.props(styles.menu)}>
        <nav aria-label="Site menu">
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
      </dialog>
    </>
  );
}
