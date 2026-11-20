// Copyright (c) Meta Platforms, Inc. and affiliates.

import {MenuIcon} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

const LINKS = [
  {label: 'Home', href: '#home'},
  {label: 'Projects', href: '#projects'},
  {label: 'Team', href: '#team'},
  {label: 'Settings', href: '#settings'},
];

function NavLink({
  label,
  href,
  ...props
}: React.ComponentProps<'a'> & {label: string; href: string}) {
  const isCurrent = label === 'Home';
  return (
    <a
      {...props}
      href={href}
      aria-current={isCurrent ? 'page' : undefined}
      className="rounded-md px-3 py-2 text-sm font-medium hover:bg-muted aria-[current=page]:bg-muted">
      {label}
    </a>
  );
}

export default function App() {
  return (
    <div className="min-h-svh">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <span className="text-lg font-semibold">Orbit</span>
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {LINKS.map(link => (
            <NavLink key={link.label} {...link} />
          ))}
        </nav>
        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Open menu"
              className="md:hidden">
              <MenuIcon />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" aria-describedby={undefined}>
            <SheetHeader>
              <SheetTitle>Orbit</SheetTitle>
            </SheetHeader>
            <nav aria-label="Main" className="flex flex-col gap-1 px-4">
              {LINKS.map(link => (
                <SheetClose key={link.label} asChild>
                  <NavLink {...link} />
                </SheetClose>
              ))}
            </nav>
          </SheetContent>
        </Sheet>
      </header>
      <main className="p-4">
        <h1 className="text-2xl font-semibold">Home</h1>
      </main>
    </div>
  );
}
