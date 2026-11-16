// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file page.tsx
 * @input A finger on a phone: the buttons that push two history entries and
 *   go back, and the platform's own back gesture (Safari's edge swipe, an
 *   iOS Home Screen app's edge swipe)
 * @output A bare page that logs, on screen, each popstate and Navigation API
 *   navigate event with its hasUAVisualTransition, and the display mode the
 *   page runs in. Below the log, a NavigationStack pushes one history entry
 *   per push and pops when the history goes back, so the platform's back
 *   swipe has history to run on
 * @position A raw page, with no sandbox chrome, for checking on a real phone
 *   whether the platform animated a history back (NavigationStack skips its
 *   own pop animation after one)
 */

import {useEffect, useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {List, ListItem} from '@astryxdesign/core/List';
import {
  NavigationScreen,
  NavigationStack,
  useNavigationStack,
} from '@astryxdesign/lab';
import {Heading, Text} from '@astryxdesign/core/Text';

interface LogEntry {
  time: string;
  event: string;
  detail: string;
}

/** The Navigation API's navigate event fields this page reads. */
interface NavigateEventLike extends Event {
  navigationType?: string;
  hasUAVisualTransition?: boolean;
  destination?: {url: string};
}

function now(): string {
  return new Date().toISOString().slice(11, 23);
}

const ROWS = ['General', 'About', 'Storage'];

function Rows() {
  const nav = useNavigationStack<string>();
  return (
    <List>
      {ROWS.map(row => (
        <ListItem key={row} label={row} onClick={() => nav.push(row)} />
      ))}
    </List>
  );
}

/**
 * A NavigationStack whose every push adds a history entry, and whose path
 * follows the history back and forward.
 */
function HistoryStack() {
  const [path, setPath] = useState<string[]>([]);
  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      // The probe's own two entries leave the stack alone. Any other entry
      // without a path (the page's first, which the router marks) is the root.
      const state = event.state as {path?: string[]; step?: number} | null;
      if (state?.step != null) {
        return;
      }
      setPath(state?.path ?? []);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  return (
    <div style={{height: 420}}>
      <NavigationStack
        label="Probe"
        root={
          <NavigationScreen title="Probe">
            <Rows />
          </NavigationScreen>
        }
        path={path}
        onPathChange={(next: string[]) => {
          if (next.length > path.length) {
            history.pushState({path: next}, '', `?depth=${next.length}`);
            setPath(next);
          } else {
            // The stack's swipe checks the path a frame after its release, so
            // the pop is set now; the popstate that follows sets an equal path.
            setPath(next);
            history.go(next.length - path.length);
          }
        }}
        getKey={(entry: string, index: number) => `${index}-${entry}`}
        renderScreen={(entry: string) => (
          <NavigationScreen title={entry}>
            <Rows />
          </NavigationScreen>
        )}
        data-testid="navigation-stack"
      />
    </div>
  );
}

export default function HistoryBackProbePage() {
  const [log, setLog] = useState<LogEntry[]>([]);
  const [mode, setMode] = useState('');

  useEffect(() => {
    const add = (event: string, detail: string) =>
      setLog(current =>
        [{time: now(), event, detail}, ...current].slice(0, 40),
      );
    const standalone =
      (navigator as Navigator & {standalone?: boolean}).standalone === true;
    setMode(
      `standalone=${standalone} display-mode:standalone=${matchMedia('(display-mode: standalone)').matches} ` +
        `navigation=${'navigation' in window} ${navigator.userAgent}`,
    );
    const onPopState = (event: PopStateEvent) =>
      add(
        'popstate',
        `hasUAVisualTransition=${String((event as PopStateEvent & {hasUAVisualTransition?: boolean}).hasUAVisualTransition)} ` +
          `state=${JSON.stringify(event.state)} url=${location.search || '/'}`,
      );
    window.addEventListener('popstate', onPopState);
    const navigation = (window as Window & {navigation?: EventTarget})
      .navigation;
    const onNavigate = (event: Event) => {
      const navigate = event as NavigateEventLike;
      add(
        'navigate',
        `type=${navigate.navigationType} hasUAVisualTransition=${String(navigate.hasUAVisualTransition)} ` +
          `to=${navigate.destination?.url.split('?')[1] ?? '/'}`,
      );
    };
    navigation?.addEventListener('navigate', onNavigate);
    return () => {
      window.removeEventListener('popstate', onPopState);
      navigation?.removeEventListener('navigate', onNavigate);
    };
  }, []);

  const pushTwo = () => {
    history.pushState({step: 1}, '', '?step=1');
    history.pushState({step: 2}, '', '?step=2');
    setLog(current => [
      {time: now(), event: 'pushState', detail: 'step=1, step=2'},
      ...current,
    ]);
  };

  return (
    <VStack gap={3} padding={4}>
      <Heading level={1}>History back probe</Heading>
      <Text color="secondary" data-testid="probe-mode">
        {mode}
      </Text>
      <HStack gap={2}>
        <Button label="Push two entries" onClick={pushTwo} />
        <Button label="history.back()" onClick={() => history.back()} />
      </HStack>
      <List data-testid="probe-log">
        {log.map((entry, index) => (
          <ListItem
            key={`${entry.time}-${index}`}
            label={`${entry.event} ${entry.time}`}
            description={entry.detail}
          />
        ))}
      </List>
      <HistoryStack />
    </VStack>
  );
}
