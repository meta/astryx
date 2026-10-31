// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {VStack, HStack} from '@astryxdesign/core/Layout';
import {Button} from '@astryxdesign/core/Button';
import {Text, Heading} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Badge} from '@astryxdesign/core/Badge';
import {Card} from '@astryxdesign/core/Card';
import {Divider} from '@astryxdesign/core';
import {Avatar} from '@astryxdesign/core/Avatar';

/* ─── Shadcn-style Tailwind components ─────────────────── */

function TailwindCard({children}: {children: React.ReactNode}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-950">
      {children}
    </div>
  );
}

function TailwindButton({
  children,
  variant = 'default',
}: {
  children: React.ReactNode;
  variant?: 'default' | 'outline' | 'ghost';
}) {
  const variants = {
    default:
      'bg-gray-900 text-white hover:bg-gray-800 dark:bg-gray-50 dark:text-gray-900',
    outline:
      'border border-gray-200 bg-transparent hover:bg-gray-100 dark:border-gray-700',
    ghost: 'bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800',
  };
  return (
    <button
      className={`inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors ${variants[variant]}`}>
      {children}
    </button>
  );
}

/* ─── Page ─────────────────────────────────────────────── */

export default function Home() {
  const [input1, setInput1] = useState('');
  const [input2, setInput2] = useState('');

  return (
    <main className="min-h-screen bg-body p-8">
      <div className="mx-auto max-w-3xl">
        <VStack gap={8}>
          <VStack gap={2}>
            <Heading level={1}>Astryx + Tailwind</Heading>
            <Text type="body" color="secondary">
              Pre-built dist package. No StyleX plugin needed. Tailwind handles
              layout, Astryx handles components and tokens.
            </Text>
          </VStack>

          <Divider />

          {/* Tailwind utilities on Astryx components */}
          <VStack gap={3}>
            <Heading level={2}>Tailwind on Astryx components</Heading>
            <Card className="border-2 border-blue-500 shadow-lg">
              <Text type="body">
                Card with{' '}
                <code className="rounded bg-gray-100 px-1 py-0.5 text-sm">
                  border-2 border-blue-500 shadow-lg
                </code>
              </Text>
            </Card>
            <HStack gap={3} vAlign="center">
              <Button
                label="Rounded Full"
                variant="primary"
                className="rounded-full"
              />
              <Button
                label="Uppercase"
                variant="ghost"
                className="uppercase tracking-wider"
              />
            </HStack>
            <Text type="body" className="text-blue-600 italic">
              Text with text-blue-600 and italic
            </Text>
          </VStack>

          <Divider />

          {/* Tailwind Bridge — the main demo */}
          <VStack gap={3}>
            <Heading level={2}>Tailwind Bridge</Heading>
            <Text type="supporting" color="secondary">
              With{' '}
              <code className="rounded-sm bg-gray-100 px-1 py-0.5 text-xs">
                @astryxdesign/core/tailwind-theme.css
              </code>
              , Astryx tokens become native Tailwind utilities. No{' '}
              <code className="rounded-sm bg-gray-100 px-1 py-0.5 text-xs">
                var()
              </code>{' '}
              needed.
            </Text>

            {/* Before / After comparison */}
            <div className="grid grid-cols-2 gap-6">
              {/* Before: verbose arbitrary values */}
              <VStack gap={2}>
                <Text type="label">Before (arbitrary values)</Text>
                <div className="rounded-[var(--radius-container)] border border-[var(--color-border)] bg-[var(--color-background-surface)] p-[var(--spacing-4)]">
                  <p className="text-[var(--color-text-primary)] text-[var(--font-size-base)]">
                    35+ chars per token 😬
                  </p>
                  <p className="mt-2 text-[var(--color-text-secondary)] text-[var(--font-size-sm)]">
                    bg-[var(--color-background-surface)]
                  </p>
                </div>
              </VStack>

              {/* After: clean bridge utilities */}
              <VStack gap={2}>
                <Text type="label">After (bridge utilities)</Text>
                <div className="rounded-lg border border-border bg-surface p-4">
                  <p className="text-base text-primary">Short and clean ✨</p>
                  <p className="mt-2 text-sm text-secondary">
                    bg-surface text-primary
                  </p>
                </div>
              </VStack>
            </div>

            {/* Status colors */}
            <Text type="label">Status colors</Text>
            <div className="flex gap-3">
              <div className="flex items-center gap-2 rounded-md bg-success-muted px-3 py-2">
                <div className="h-2 w-2 rounded-full bg-success" />
                <span className="text-sm font-medium text-on-success-muted">
                  Success
                </span>
              </div>
              <div className="flex items-center gap-2 rounded-md bg-error-muted px-3 py-2">
                <div className="h-2 w-2 rounded-full bg-error" />
                <span className="text-sm font-medium text-on-error-muted">
                  Error
                </span>
              </div>
              <div className="flex items-center gap-2 rounded-md bg-warning-muted px-3 py-2">
                <div className="h-2 w-2 rounded-full bg-warning" />
                <span className="text-sm font-medium text-on-warning-muted">
                  Warning
                </span>
              </div>
            </div>

            {/* Hue palette */}
            <Text type="label">Hue palette (subtle / ring / vivid)</Text>
            <div className="grid grid-cols-5 gap-3">
              <div className="rounded-md border border-blue-ring bg-blue-subtle p-3 text-center">
                <span className="text-sm font-medium text-blue-vivid">
                  blue
                </span>
              </div>
              <div className="rounded-md border border-green-ring bg-green-subtle p-3 text-center">
                <span className="text-sm font-medium text-green-vivid">
                  green
                </span>
              </div>
              <div className="rounded-md border border-purple-ring bg-purple-subtle p-3 text-center">
                <span className="text-sm font-medium text-purple-vivid">
                  purple
                </span>
              </div>
              <div className="rounded-md border border-orange-ring bg-orange-subtle p-3 text-center">
                <span className="text-sm font-medium text-orange-vivid">
                  orange
                </span>
              </div>
              <div className="rounded-md border border-red-ring bg-red-subtle p-3 text-center">
                <span className="text-sm font-medium text-red-vivid">red</span>
              </div>
            </div>

            {/* Semantic surfaces */}
            <Text type="label">Semantic surfaces</Text>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-surface p-4 shadow-sm">
                <p className="text-sm font-medium text-primary">bg-surface</p>
                <p className="text-xs text-secondary">Cards, panels</p>
              </div>
              <div className="rounded-lg bg-body p-4 shadow-sm">
                <p className="text-sm font-medium text-primary">bg-body</p>
                <p className="text-xs text-secondary">Page background</p>
              </div>
              <div className="rounded-lg bg-muted p-4 shadow-sm">
                <p className="text-sm font-medium text-primary">bg-muted</p>
                <p className="text-xs text-secondary">Subtle emphasis</p>
              </div>
            </div>

            {/* Spacing + radius */}
            <Text type="label">Spacing &amp; radius</Text>
            <div className="flex items-end gap-3">
              <div className="rounded-xs bg-accent-bg p-1 text-center">
                <span className="text-xs text-on-accent">p-1</span>
              </div>
              <div className="rounded-sm bg-accent-bg p-2 text-center">
                <span className="text-xs text-on-accent">p-2</span>
              </div>
              <div className="rounded-md bg-accent-bg p-3 text-center">
                <span className="text-xs text-on-accent">p-3</span>
              </div>
              <div className="rounded-lg bg-accent-bg p-4 text-center">
                <span className="text-xs text-on-accent">p-4</span>
              </div>
              <div className="rounded-xl bg-accent-bg p-6 text-center">
                <span className="text-xs text-on-accent">p-6</span>
              </div>
            </div>
          </VStack>

          <Divider />

          {/* Shadcn-style components alongside Astryx */}
          <VStack gap={3}>
            <Heading level={2}>Shadcn-style components</Heading>
            <div className="grid grid-cols-2 gap-6">
              <Card>
                <VStack gap={3}>
                  <HStack gap={2} vAlign="center">
                    <Avatar name="Jane Doe" size="md" />
                    <VStack gap={0}>
                      <Text type="label">Jane Doe</Text>
                      <Text type="supporting" color="secondary">
                        Engineer
                      </Text>
                    </VStack>
                  </HStack>
                  <HStack gap={2}>
                    <Badge variant="info" label="React" />
                    <Badge variant="success" label="TS" />
                  </HStack>
                  <Button label="View Profile" variant="secondary" />
                </VStack>
              </Card>

              <TailwindCard>
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 text-sm font-medium text-white">
                      JD
                    </div>
                    <div>
                      <p className="text-sm font-medium">Jane Doe</p>
                      <p className="text-xs text-gray-500">Engineer</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                      React
                    </span>
                    <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      TS
                    </span>
                  </div>
                  <TailwindButton variant="outline">
                    View Profile
                  </TailwindButton>
                </div>
              </TailwindCard>
            </div>
          </VStack>

          <Divider />

          {/* Forms */}
          <VStack gap={3}>
            <Heading level={2}>Form elements</Heading>
            <div className="grid grid-cols-2 gap-6">
              <VStack gap={3}>
                <TextInput
                  label="Astryx Input"
                  placeholder="Enter name"
                  value={input1}
                  onChange={setInput1}
                />
                <TextInput
                  label="Astryx Email"
                  placeholder="you@example.com"
                  value={input2}
                  onChange={setInput2}
                />
              </VStack>
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">Tailwind Input</label>
                  <input
                    type="text"
                    placeholder="Enter name"
                    className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">Tailwind Email</label>
                  <input
                    type="email"
                    placeholder="you@example.com"
                    className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>
            </div>
          </VStack>

          <Divider />

          {/* Typography */}
          <VStack gap={3}>
            <Heading level={2}>Typography</Heading>
            <div className="grid grid-cols-2 gap-6">
              <VStack gap={2}>
                <Heading level={1}>Heading 1</Heading>
                <Heading level={2}>Heading 2</Heading>
                <Heading level={3}>Heading 3</Heading>
                <Text type="body">Body text</Text>
                <Text type="supporting" color="secondary">
                  Supporting text
                </Text>
              </VStack>
              <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold">Heading 1</h1>
                <h2 className="text-2xl font-semibold">Heading 2</h2>
                <h3 className="text-xl font-semibold">Heading 3</h3>
                <p className="text-base">Body text</p>
                <p className="text-sm text-gray-500">Supporting text</p>
                <ul className="list-disc pl-5 text-sm">
                  <li>List item</li>
                  <li>List item</li>
                </ul>
              </div>
            </div>
          </VStack>
        </VStack>
      </div>
    </main>
  );
}
