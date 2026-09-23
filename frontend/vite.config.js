import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Vite configuration for Water UI.
 *
 * Why Vite and not CRA: create-react-app is unmaintained, and Vite is the
 * documented stack's practical replacement (React + Tailwind + PostCSS all
 * work unchanged). The one structural consequence is that `index.html` lives
 * at the project root instead of `public/` - see docs/project-structure.md.
 */
export default defineConfig({
    plugins: [react()],

    server: {
        host: true, // reachable from outside the container
        port: 5173,
        // In development the API and the socket live on the backend service,
        // so proxy them instead of dealing with CORS.
        proxy: {
            '/api': {
                target: process.env.VITE_PROXY_TARGET ?? 'http://localhost:5000',
                changeOrigin: true,
            },
            '/socket.io': {
                target: process.env.VITE_PROXY_TARGET ?? 'http://localhost:5000',
                changeOrigin: true,
                ws: true,
            },
        },
    },

    build: {
        outDir: 'dist',
        sourcemap: true,
    },
});
