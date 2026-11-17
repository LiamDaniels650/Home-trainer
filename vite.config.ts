/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  base: '/Home-trainer/',
  plugins: [preact()],
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
