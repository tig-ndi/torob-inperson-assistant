import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  build: {
    rolldownOptions: {
      input: {
        index: fileURLToPath(new URL('./index.html', import.meta.url)),
        design: fileURLToPath(new URL('./design.html', import.meta.url)),
      },
    },
  },
  server: {
    proxy: { '/api': { target: `http://127.0.0.1:${process.env.TOROB_API_PORT ?? '8000'}` } },
  },
});
