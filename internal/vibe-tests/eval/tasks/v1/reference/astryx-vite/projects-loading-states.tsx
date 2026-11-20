// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useCallback, useEffect, useRef, useState} from 'react';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {HStack} from '@astryxdesign/core/HStack';
import {List, ListItem} from '@astryxdesign/core/List';
import {Spinner} from '@astryxdesign/core/Spinner';
import {Switch} from '@astryxdesign/core/Switch';
import {VStack} from '@astryxdesign/core/VStack';

const PROJECTS = ['Atlas', 'Borealis', 'Cosmos'];
const LOAD_MS = 1000;

type LoadState = 'loading' | 'ready' | 'error';

function useProjects(shouldFail: boolean) {
  const [state, setState] = useState<LoadState>('loading');
  const timer = useRef<number | undefined>(undefined);
  const load = useCallback((fail: boolean) => {
    window.clearTimeout(timer.current);
    setState('loading');
    timer.current = window.setTimeout(
      () => setState(fail ? 'error' : 'ready'),
      LOAD_MS,
    );
  }, []);
  useEffect(() => {
    load(false);
    return () => window.clearTimeout(timer.current);
  }, [load]);
  return {state, reload: () => load(shouldFail)};
}

export default function App() {
  const [shouldFail, setShouldFail] = useState(false);
  const {state, reload} = useProjects(shouldFail);
  return (
    <VStack gap={4} padding={6} width={420}>
      <HStack gap={4} align="center">
        <Switch
          label="Fail loads"
          value={shouldFail}
          onChange={setShouldFail}
        />
        <Button label="Reload" variant="secondary" onClick={reload} />
      </HStack>
      <div role="status">
        {state === 'loading' && <Spinner label="Loading projects…" />}
      </div>
      {state === 'error' && (
        <Banner
          status="error"
          role="alert"
          title="Could not load projects"
          endContent={<Button label="Try again" onClick={reload} />}
        />
      )}
      {state === 'ready' && (
        <List header="Projects" hasDividers>
          {PROJECTS.map(name => (
            <ListItem key={name} label={name} />
          ))}
        </List>
      )}
    </VStack>
  );
}
