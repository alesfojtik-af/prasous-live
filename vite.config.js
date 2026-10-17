import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Číslo sestavení: aplikace podle něj pozná, že je na serveru novější verze (version.json), a nabídne obnovení.
const BUILD_ID = String(Date.now());

export default defineConfig({
  plugins: [react(), { name: 'version-file', generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) }); } }],
  base: './',
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  build: { chunkSizeWarningLimit: 1500 },
  test: { environment: 'node', include: ['tests/**/*.test.js'] },
});
