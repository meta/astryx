// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * Error page: the screen an app shows when a page fails to load. It reloads
 * the page to try again, shows whether the browser is online, keeps the
 * error's reference for support, and offers a way home.
 */

import {useEffect, useState} from 'react';

import {Center} from '@astryxdesign/core/Center';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Button} from '@astryxdesign/core/Button';
import {Collapsible} from '@astryxdesign/core/Collapsible';
import {MetadataList, MetadataListItem} from '@astryxdesign/core/MetadataList';
import {Code} from '@astryxdesign/core/Code';
import {Timestamp} from '@astryxdesign/core/Timestamp';
import {StatusDot} from '@astryxdesign/core/StatusDot';
import {Heading, Text} from '@astryxdesign/core/Text';
import {Icon} from '@astryxdesign/core/Icon';
import {useToast} from '@astryxdesign/core/Toast';

import {ExclamationTriangleIcon} from '@heroicons/react/24/outline';

const ERROR = {
  code: 'ERR_UPSTREAM_TIMEOUT',
  reference: 'req_7f3a9c2e',
  time: '2026-06-30T09:41:12',
};

/** Whether the browser reports a network connection, kept current. */
function useIsOnline() {
  const [isOnline, setIsOnline] = useState(true);
  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return isOnline;
}

export default function ErrorPage() {
  const showToast = useToast();
  const isOnline = useIsOnline();
  const [isConnectionShown, setIsConnectionShown] = useState(false);

  return (
    <Center height="100%" padding={6}>
      <VStack gap={6} width="100%" maxWidth={520}>
        <EmptyState
          icon={<Icon icon={ExclamationTriangleIcon} size="lg" />}
          headingLevel={1}
          title="Something went wrong"
          description="We couldn't load this page. Try again in a moment, or check your connection."
          actions={
            <>
              <Button
                label="Try again"
                variant="primary"
                onClick={() => window.location.reload()}
              />
              <Button
                label="Check connection"
                variant="secondary"
                onClick={() => setIsConnectionShown(true)}
              />
            </>
          }
        />
        <Button label="Go to home" variant="ghost" href="/" />

        {isConnectionShown ? (
          <VStack gap={2}>
            <Heading level={2}>Connection</Heading>
            <HStack gap={2} vAlign="center">
              <StatusDot
                variant={isOnline ? 'success' : 'error'}
                label={isOnline ? 'Online' : 'Offline'}
              />
              <Text type="body">
                {isOnline
                  ? 'Your browser reports a network connection.'
                  : 'Your browser reports no network connection. Reconnect, then try again.'}
              </Text>
            </HStack>
            <Text type="supporting" color="secondary">
              Demo: checks of this app&apos;s own services would run here.
            </Text>
          </VStack>
        ) : null}

        <Collapsible trigger="Error details" defaultIsOpen={false}>
          <VStack gap={3}>
            <MetadataList>
              <MetadataListItem label="Error">
                <Code>{ERROR.code}</Code>
              </MetadataListItem>
              <MetadataListItem label="Reference">
                <Code>{ERROR.reference}</Code>
              </MetadataListItem>
              <MetadataListItem label="Time">
                <Timestamp value={ERROR.time} />
              </MetadataListItem>
            </MetadataList>
            <Button
              label="Contact support"
              variant="secondary"
              onClick={() =>
                // Demo only: replace this toast with the app's support form,
                // prefilled with the reference above.
                showToast({
                  body: `Demo: a support request with ${ERROR.reference} would open here`,
                  uniqueID: 'contact-support',
                })
              }
            />
          </VStack>
        </Collapsible>
      </VStack>
    </Center>
  );
}
