// Copyright (c) Meta Platforms, Inc. and affiliates.

import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {Label} from '@/components/ui/label';
import {Switch} from '@/components/ui/switch';
import {useTheme} from '@/components/theme-provider';

export default function App() {
  const {theme, setTheme} = useTheme();
  const isDark =
    theme === 'dark' ||
    (theme === 'system' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);
  return (
    <main className="min-h-svh p-6">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>
            <h2>Appearance</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Switch
            id="dark-mode"
            checked={isDark}
            onCheckedChange={checked => setTheme(checked ? 'dark' : 'light')}
          />
          <Label htmlFor="dark-mode">Dark mode</Label>
        </CardContent>
      </Card>
    </main>
  );
}
