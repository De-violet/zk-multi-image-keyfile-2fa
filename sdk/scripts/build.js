import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sdkRoot = path.resolve(__dirname, '..');

const distEsm = path.join(sdkRoot, 'dist/esm');
const distBrowser = path.join(sdkRoot, 'dist/browser');

fs.mkdirSync(distEsm, { recursive: true });
fs.mkdirSync(distBrowser, { recursive: true });

// 1. ESM Build
const srcIndex = path.join(sdkRoot, 'src/index.js');
fs.copyFileSync(srcIndex, path.join(distEsm, 'index.js'));

// Salin modul pendukung ke dist/esm
const copyDirRecursive = (src, dest) => {
  fs.mkdirSync(dest, { recursive: true });
  for (const item of fs.readdirSync(src)) {
    const s = path.join(src, item);
    const d = path.join(dest, item);
    if (fs.statSync(s).isDirectory()) {
      copyDirRecursive(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
};
copyDirRecursive(path.join(sdkRoot, 'src'), distEsm);

// 2. Standalone Browser IIFE Bundle
// Menggabungkan modul ke satu file self-contained
const timeWindowCode = fs.readFileSync(path.join(sdkRoot, 'src/core/timeWindow.js'), 'utf8')
  .replace(/export\s+/g, '');
const binaryCode = fs.readFileSync(path.join(sdkRoot, 'src/core/binary.js'), 'utf8')
  .replace(/export\s+/g, '');
const paletteCode = fs.readFileSync(path.join(sdkRoot, 'src/core/palette.js'), 'utf8')
  .replace(/export\s+/g, '');
const matrixCode = fs.readFileSync(path.join(sdkRoot, 'src/core/matrix.js'), 'utf8')
  .replace(/import\s+[^;]+;/g, '')
  .replace(/export\s+/g, '');
const rendererCode = fs.readFileSync(path.join(sdkRoot, 'src/renderer/canvasRenderer.js'), 'utf8')
  .replace(/import\s+[^;]+;/g, '')
  .replace(/export\s+/g, '');
const protocolCode = fs.readFileSync(path.join(sdkRoot, 'src/worker/protocol.js'), 'utf8')
  .replace(/export\s+/g, '');
const workerClientCode = fs.readFileSync(path.join(sdkRoot, 'src/worker/workerClient.js'), 'utf8')
  .replace(/import\s+[^;]+;/g, '')
  .replace(/export\s+/g, '');
const zkAdapterCode = fs.readFileSync(path.join(sdkRoot, 'src/zk/zkAdapter.js'), 'utf8')
  .replace(/import\s+[^;]+;/g, '')
  .replace(/export\s+/g, '');
const eventEmitterCode = fs.readFileSync(path.join(sdkRoot, 'src/events/eventEmitter.js'), 'utf8')
  .replace(/export\s+/g, '');
const sdkFacadeCode = fs.readFileSync(path.join(sdkRoot, 'src/sdk/ZkCanvasSDK.js'), 'utf8')
  .replace(/import\s+[^;]+;/g, '')
  .replace(/export\s+/g, '');

const iifeBundle = `/**
 * zk-canvas-sdk (Standalone Browser Bundle)
 * Zero-Knowledge Visual TOTP Client-Side SDK
 */
(function (global) {
  'use strict';

  ${timeWindowCode}
  ${binaryCode}
  ${paletteCode}
  ${matrixCode}
  ${rendererCode}
  ${protocolCode}
  ${workerClientCode}
  ${zkAdapterCode}
  ${eventEmitterCode}
  ${sdkFacadeCode}

  global.ZkCanvasSDK = ZkCanvasSDK;
  global.zkCanvasSdkCore = {
    calculateTimeWindow,
    calculateRemainingMs,
    generateNumericMatrix,
    DEFAULT_PALETTE_16
  };
})(typeof window !== 'undefined' ? window : globalThis);
`;

fs.writeFileSync(path.join(distBrowser, 'zk-canvas-sdk.js'), iifeBundle, 'utf8');

// Salin workerScript.js ke dist
fs.copyFileSync(
  path.join(sdkRoot, 'src/worker/workerScript.js'),
  path.join(distBrowser, 'workerScript.js')
);

console.log('✓ Build Multi-Target Selesai:');
console.log('  - ESM: sdk/dist/esm/index.js');
console.log('  - Standalone: sdk/dist/browser/zk-canvas-sdk.js');
console.log('  - Worker: sdk/dist/browser/workerScript.js');
