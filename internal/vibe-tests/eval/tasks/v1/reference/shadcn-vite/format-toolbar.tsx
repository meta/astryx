// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import {Toggle} from '@/components/ui/toggle';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const FORMATS = [
  {name: 'Bold', shortcut: 'Ctrl+B'},
  {name: 'Italic', shortcut: 'Ctrl+I'},
  {name: 'Underline', shortcut: 'Ctrl+U'},
];

export default function App() {
  const [active, setActive] = useState<string[]>([]);
  const ordered = FORMATS.map(format => format.name).filter(name =>
    active.includes(name),
  );
  return (
    <TooltipProvider>
      <div className="flex flex-col gap-3 p-6">
        <div role="toolbar" aria-label="Formatting" className="flex gap-1">
          {FORMATS.map(format => (
            <Tooltip key={format.name}>
              <TooltipTrigger asChild>
                <Toggle
                  variant="outline"
                  pressed={active.includes(format.name)}
                  onPressedChange={isPressed =>
                    setActive(current =>
                      isPressed
                        ? [...current, format.name]
                        : current.filter(name => name !== format.name),
                    )
                  }>
                  {format.name}
                </Toggle>
              </TooltipTrigger>
              <TooltipContent>
                {format.name} ({format.shortcut})
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
        <p>Active: {ordered.length > 0 ? ordered.join(', ') : 'none'}</p>
      </div>
    </TooltipProvider>
  );
}
