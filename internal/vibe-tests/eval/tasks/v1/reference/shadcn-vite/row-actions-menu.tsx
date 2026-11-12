// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import {MoreHorizontal} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function App() {
  const [projects, setProjects] = useState(['Apollo', 'Gemini', 'Mercury']);
  return (
    <ul className="flex max-w-sm flex-col gap-2 p-6">
      {projects.map((name, index) => (
        <li key={name} className="flex items-center justify-between">
          <span>{name}</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Actions for ${name}`}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem>Rename</DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  setProjects([
                    ...projects.slice(0, index + 1),
                    `${name} copy`,
                    ...projects.slice(index + 1),
                  ])
                }>
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onSelect={() =>
                  setProjects(projects.filter(other => other !== name))
                }>
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </li>
      ))}
    </ul>
  );
}
