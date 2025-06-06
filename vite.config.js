import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig(({ command, mode }) => {
  // Load environment variables based on mode
  const isDevelopment = command === 'serve' || mode === 'development';
  const isProduction = command === 'build' && mode === 'production';
  
  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      port: 3001,
      proxy: {
        "/api": {
          target: "http://localhost:3000",
          changeOrigin: true,
          configure: (proxy, options) => {
            proxy.on('error', (err, req, res) => {
              console.error('Proxy error:', err);
              res.writeHead(500, {
                'Content-Type': 'application/json',
              });
              res.end(JSON.stringify({
                error: 'Proxy Error',
                message: 'Failed to connect to consolidated backend server',
                timestamp: new Date().toISOString()
              }));
            });
          }
        }
      }
    },
    define: {
      // Make environment variables available at build time
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '1.0.0'),
      __BUILD_MODE__: JSON.stringify(mode),
    },
    build: {
      // Different build configurations for different environments
      outDir: 'dist',
      sourcemap: isDevelopment,
      minify: isProduction ? 'terser' : false,
      rollupOptions: {
        output: {
          manualChunks: isProduction ? {
            vendor: ['react', 'react-dom'],
            gemini: ['@google/generative-ai']
          } : undefined
        }
      }
    }
  };
});
