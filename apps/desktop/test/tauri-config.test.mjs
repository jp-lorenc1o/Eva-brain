import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const configUrl = new URL('../src-tauri/tauri.conf.json', import.meta.url);
const config = JSON.parse(await readFile(configUrl, 'utf8'));

const productionCsp = {
  'default-src': ["'self'"],
  'connect-src': ['ipc:', 'http://ipc.localhost'],
  'font-src': ["'self'"],
  'img-src': ["'self'", 'data:'],
  // Eva writes graph colors and movable panel geometry through element.style.
  'style-src': ["'self'", "'unsafe-inline'"],
  'script-src': ["'self'"],
  'object-src': ["'none'"],
  'frame-src': ["'none'"],
  'base-uri': ["'none'"],
  'form-action': ["'none'"],
};

test('production CSP permits only Eva bundled assets and Tauri IPC', () => {
  assert.deepEqual(config.app.security.csp, productionCsp);
});

test('development CSP adds only Vite reporting and HMR connections', () => {
  assert.deepEqual(config.app.security.devCsp, {
    ...productionCsp,
    'connect-src': [
      "'self'",
      'ipc:',
      'http://ipc.localhost',
      'ws://localhost:1420',
    ],
  });
});
