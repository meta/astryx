// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ByokCard.tsx
 * @input Uses React, StyleX, Button, Dialog, TextInput, StatusDot, Text, Heading, VStack, HStack
 * @output Exports ByokCard component, ByokCardProps, ByokProvider types
 * @position Core BYOK provider connection card with integrated API key management
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/ByokCard/ByokCard.doc.mjs (props table, features)
 * - /packages/core/src/ByokCard/ByokCard.test.tsx (tests for new/changed behavior)
 * - /packages/core/src/ByokCard/index.ts (exports if types change)
 */

import {
  useState,
  useCallback,
  type ReactNode,
  type FormEvent,
  type Ref,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {BaseProps} from '../BaseProps';
import {mergeProps} from '../utils/mergeProps';
import {themeProps} from '../utils/themeProps';
import {Button} from '../Button/Button';
import {Dialog} from '../Dialog/Dialog';
import {TextInput} from '../TextInput/TextInput';
import {StatusDot} from '../StatusDot/StatusDot';
import {Text} from '../Text/Text';
import {Heading} from '../Heading/Heading';
import {VStack} from '../VStack/VStack';
import {HStack} from '../HStack/HStack';
import {
  registerEnglishFallback,
  useComponentTranslator,
} from '../i18n/useComponentTranslator';
import english from '../i18n/generated-english/ByokCard/ByokCard.generated';
import {styles} from './ByokCard.stylex';

registerEnglishFallback(english);

export interface ByokProvider {
  /** Unique provider identifier, e.g. 'openai', 'anthropic', 'google' */
  id: string;
  /** Display name of the provider */
  name: string;
  /** Optional logo node or icon */
  logo?: ReactNode;
  /** Optional summary description of the provider's capabilities */
  description?: string;
}

export interface ByokCardProps extends BaseProps {
  /** Ref to the card's root DOM element */
  ref?: Ref<HTMLDivElement>;
  /** Provider metadata including name, id, logo, and optional description */
  provider: ByokProvider;
  /** Connection status: 'connected' displays Rotate & Delete; 'disconnected' displays Connect */
  status?: 'connected' | 'disconnected';
  /** Optional masked account or key label, e.g. 'sk-proj-...8a21' */
  accountLabel?: string;
  /** Callback fired when user submits an API key to connect */
  onConnect?: (apiKey: string) => void | Promise<void>;
  /** Callback fired when user submits a new API key to rotate the existing one */
  onRotate?: (newApiKey: string) => void | Promise<void>;
  /** Callback fired when user confirms key deletion */
  onDelete?: () => void | Promise<void>;
  /** Disables interactive buttons on the card */
  isDisabled?: boolean;
}

export function ByokCard({
  ref,
  provider,
  status = 'disconnected',
  accountLabel,
  onConnect,
  onRotate,
  onDelete,
  isDisabled = false,
  ...rest
}: ByokCardProps) {
  const t = useComponentTranslator();
  const isConnected = status === 'connected';

  // Modal dialog states
  const [isKeyDialogOpen, setIsKeyDialogOpen] = useState(false);
  const [isRotateMode, setIsRotateMode] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showPlainKey, setShowPlainKey] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const openConnectDialog = useCallback(() => {
    setIsRotateMode(false);
    setApiKeyInput('');
    setErrorMessage(null);
    setIsKeyDialogOpen(true);
  }, []);

  const openRotateDialog = useCallback(() => {
    setIsRotateMode(true);
    setApiKeyInput('');
    setErrorMessage(null);
    setIsKeyDialogOpen(true);
  }, []);

  const openDeleteDialog = useCallback(() => {
    setIsDeleteDialogOpen(true);
  }, []);

  const handleKeySubmit = async (event?: FormEvent) => {
    if (event) {
      event.preventDefault();
    }
    const trimmed = apiKeyInput.trim();
    if (!trimmed) {
      setErrorMessage('API key is required');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      if (isRotateMode) {
        await onRotate?.(trimmed);
      } else {
        await onConnect?.(trimmed);
      }
      setIsKeyDialogOpen(false);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to save API key',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    try {
      setIsSubmitting(true);
      await onDelete?.();
      setIsDeleteDialogOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div
        ref={ref}
        {...mergeProps(
          themeProps('byokCard', {status}),
          stylex.props(styles.card),
        )}
        data-component="byok-card"
        data-provider-id={provider.id}
        data-status={status}>
        <div {...stylex.props(styles.header)}>
          <div {...stylex.props(styles.providerInfo)}>
            {provider.logo ? (
              <div {...stylex.props(styles.logoSlot)} aria-hidden="true">
                {provider.logo}
              </div>
            ) : null}
            <div {...stylex.props(styles.textContainer)}>
              <span {...stylex.props(styles.name)}>{provider.name}</span>
              {provider.description ? (
                <span {...stylex.props(styles.description)}>
                  {provider.description}
                </span>
              ) : null}
            </div>
          </div>

          <div {...stylex.props(styles.statusContainer)}>
            {isConnected ? (
              <>
                <StatusDot
                  variant="success"
                  label={accountLabel || t('@astryx.byokCard.connected')}
                />
                <span
                  {...stylex.props(
                    styles.statusText,
                    styles.statusConnectedText,
                  )}>
                  {accountLabel
                    ? accountLabel
                    : t('@astryx.byokCard.connected')}
                </span>
              </>
            ) : (
              <span {...stylex.props(styles.statusText)}>
                {t('@astryx.byokCard.notConnected')}
              </span>
            )}
          </div>
        </div>

        <div {...stylex.props(styles.footer)}>
          {isConnected ? (
            <div {...stylex.props(styles.actionsRow)}>
              <Button
                variant="secondary"
                size="sm"
                label={t('@astryx.byokCard.rotate')}
                isDisabled={isDisabled}
                onClick={openRotateDialog}
              />
              <Button
                variant="destructive"
                size="sm"
                label={t('@astryx.byokCard.delete')}
                isDisabled={isDisabled}
                onClick={openDeleteDialog}
              />
            </div>
          ) : (
            <Button
              variant="primary"
              size="sm"
              label={t('@astryx.byokCard.connect')}
              width="100%"
              isDisabled={isDisabled}
              onClick={openConnectDialog}
            />
          )}
        </div>
      </div>

      {/* Connect / Rotate Dialog */}
      {isKeyDialogOpen ? (
        <Dialog
          isOpen={isKeyDialogOpen}
          onOpenChange={setIsKeyDialogOpen}
          width={420}
          aria-label={
            isRotateMode
              ? `${t('@astryx.byokCard.rotate')} ${provider.name}`
              : `${t('@astryx.byokCard.connect')} ${provider.name}`
          }>
          <form
            onSubmit={e => {
              void handleKeySubmit(e);
            }}>
            <VStack gap={4}>
              <HStack gap={2} align="center">
                {provider.logo ? (
                  <div {...stylex.props(styles.logoSlot)} aria-hidden="true">
                    {provider.logo}
                  </div>
                ) : null}
                <Heading level={4}>
                  {isRotateMode
                    ? `${t('@astryx.byokCard.rotate')} ${provider.name}`
                    : `${t('@astryx.byokCard.connect')} ${provider.name}`}
                </Heading>
              </HStack>

              <Text type="body" color="secondary">
                {isRotateMode
                  ? t('@astryx.byokCard.dialog.rotateDescription', {
                      provider: provider.name,
                    })
                  : t('@astryx.byokCard.dialog.connectDescription', {
                      provider: provider.name,
                    })}
              </Text>

              <VStack gap={1.5} width="100%">
                <TextInput
                  label={t('@astryx.byokCard.dialog.apiKeyInputLabel', {
                    provider: provider.name,
                  })}
                  isLabelHidden={true}
                  placeholder={t('@astryx.byokCard.dialog.apiKeyPlaceholder')}
                  type={showPlainKey ? 'text' : 'password'}
                  value={apiKeyInput}
                  onChange={(val: string) => {
                    setApiKeyInput(val);
                    if (errorMessage) {
                      setErrorMessage(null);
                    }
                  }}
                  isDisabled={isSubmitting}
                  hasAutoFocus={true}
                />
                <HStack justify="end">
                  <Button
                    variant="ghost"
                    size="sm"
                    label={
                      showPlainKey
                        ? t('@astryx.byokCard.hideKey')
                        : t('@astryx.byokCard.showKey')
                    }
                    onClick={() => setShowPlainKey(prev => !prev)}
                  />
                </HStack>
                {errorMessage ? (
                  <Text type="supporting" color="secondary">
                    {errorMessage}
                  </Text>
                ) : null}
              </VStack>

              <HStack gap={2} justify="end" width="100%">
                <Button
                  variant="ghost"
                  size="sm"
                  label={t('@astryx.byokCard.cancel')}
                  isDisabled={isSubmitting}
                  onClick={() => setIsKeyDialogOpen(false)}
                />
                <Button
                  variant="primary"
                  size="sm"
                  label={
                    isRotateMode
                      ? t('@astryx.byokCard.updateKey')
                      : t('@astryx.byokCard.saveKey')
                  }
                  isDisabled={!apiKeyInput.trim() || isSubmitting}
                  isLoading={isSubmitting}
                  onClick={() => {
                    void handleKeySubmit();
                  }}
                />
              </HStack>
            </VStack>
          </form>
        </Dialog>
      ) : null}

      {/* Delete Confirmation Dialog */}
      {isDeleteDialogOpen ? (
        <Dialog
          isOpen={isDeleteDialogOpen}
          onOpenChange={setIsDeleteDialogOpen}
          width={380}
          aria-label={`${t('@astryx.byokCard.remove')} ${provider.name}`}>
          <VStack gap={4}>
            <Heading level={4}>
              {`${t('@astryx.byokCard.remove')} ${provider.name}`}
            </Heading>
            <Text type="body" color="secondary">
              {t('@astryx.byokCard.dialog.deleteDescription', {
                provider: provider.name,
              })}
            </Text>
            <HStack gap={2} justify="end" width="100%">
              <Button
                variant="ghost"
                size="sm"
                label={t('@astryx.byokCard.cancel')}
                isDisabled={isSubmitting}
                onClick={() => setIsDeleteDialogOpen(false)}
              />
              <Button
                variant="destructive"
                size="sm"
                label={t('@astryx.byokCard.remove')}
                isLoading={isSubmitting}
                onClick={() => {
                  void handleDeleteConfirm();
                }}
              />
            </HStack>
          </VStack>
        </Dialog>
      ) : null}
    </>
  );
}
