// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useCallback, useEffect, useRef, useState} from 'react';
import {Alert, AlertAction, AlertTitle} from '@/components/ui/alert';
import {Button} from '@/components/ui/button';
import {Label} from '@/components/ui/label';
import {Switch} from '@/components/ui/switch';

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
    <div className="flex w-[420px] flex-col gap-4 p-6">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Switch
            id="fail-loads"
            checked={shouldFail}
            onCheckedChange={setShouldFail}
          />
          <Label htmlFor="fail-loads">Fail loads</Label>
        </div>
        <Button variant="outline" onClick={reload}>
          Reload
        </Button>
      </div>
      <div role="status" className="text-muted-foreground text-sm">
        {state === 'loading' && 'Loading projects…'}
      </div>
      {state === 'error' && (
        <Alert variant="destructive">
          <AlertTitle>Could not load projects</AlertTitle>
          <AlertAction>
            <Button size="sm" variant="outline" onClick={reload}>
              Try again
            </Button>
          </AlertAction>
        </Alert>
      )}
      {state === 'ready' && (
        <ul className="flex flex-col divide-y rounded-lg border">
          {PROJECTS.map(name => (
            <li key={name} className="px-4 py-2">
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
