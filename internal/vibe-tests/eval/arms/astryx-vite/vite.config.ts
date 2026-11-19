import react from '@vitejs/plugin-react';
import {unplugin as stylex} from '@stylexjs/unplugin';
import {defineConfig} from 'vite';

export default defineConfig({
  plugins: [stylex.vite(), react()],
});
