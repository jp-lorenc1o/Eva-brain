import { defineConfig, type Plugin } from 'vite';

// Dev-only verification channel: the app running inside the Tauri webview can
// POST a render report here and it gets printed to the terminal, so a
// `tauri dev` run can be checked end to end without clicking around.
function devReport(): Plugin {
  return {
    name: 'eva-dev-report',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__dev-report', (req, res) => {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          console.log(`\n[eva dev-report] ${body}\n`);
          res.statusCode = 204;
          res.end();
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [devReport()],
  // Tauri expects a fixed dev server address and manages its own output.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
});
