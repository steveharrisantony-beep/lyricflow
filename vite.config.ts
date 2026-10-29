import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'disable-vite-ws-client',
      transform(code, id) {
        if (id.includes('client/client.mjs')) {
          return {
            code: code.replace(
              'transport.connect(createHMRHandler(handleMessage));',
              '/* HMR WebSocket disabled in preview environment */'
            ),
            map: null,
          };
        }
      },
    },
  ],
  server: {
    hmr: false,
  },
});
