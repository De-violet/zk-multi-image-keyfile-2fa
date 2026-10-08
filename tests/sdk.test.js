import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateTimeWindow,
  calculateRemainingMs,
  calculateNextWindowTimestamp
} from '../sdk/src/core/timeWindow.js';
import { normalizeToBytes32, decomposeToWords16 } from '../sdk/src/core/binary.js';
import {
  DEFAULT_PALETTE_16,
  extractNibblesFromWord16,
  mapNibbleToColor
} from '../sdk/src/core/palette.js';
import { generateNumericMatrix, matrixToGrid2D } from '../sdk/src/core/matrix.js';
import { CanvasMatrixRenderer } from '../sdk/src/renderer/canvasRenderer.js';
import { WorkerClient } from '../sdk/src/worker/workerClient.js';
import { SdkEventEmitter } from '../sdk/src/events/eventEmitter.js';
import { ZkCanvasSDK } from '../sdk/src/sdk/ZkCanvasSDK.js';

test('SDK Test Suite (12 Granular Verification Tests)', async (t) => {
  // --- PURE LOGIC LAYER ---
  await t.test('1. core/timeWindow: calculateTimeWindow() perhitungan indeks waktu', () => {
    assert.equal(calculateTimeWindow(120000, 60000), 2);
    assert.equal(calculateTimeWindow(180000, 60000), 3);
    assert.throws(() => calculateTimeWindow(100, 0), /positif/);
  });

  await t.test('2. core/timeWindow: calculateRemainingMs() & calculateNextWindowTimestamp()', () => {
    assert.equal(calculateRemainingMs(125000, 60000), 55000);
    assert.equal(calculateRemainingMs(179999, 60000), 1);
    assert.equal(calculateNextWindowTimestamp(179999, 60000), 180000);
  });

  await t.test('3. core/binary: normalizeToBytes32() normalisasi seed/commitment ke 32 byte', () => {
    const hex = '0x123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0';
    const bytes = normalizeToBytes32(hex);
    assert.equal(bytes.length, 32);
    assert.equal(bytes[0], 0x12);
  });

  await t.test('4. core/binary: decomposeToWords16() ekstraksi pasangan 2x8-bit (16-bit words)', () => {
    const bytes = normalizeToBytes32('0x1234567800000000000000000000000000000000000000000000000000000000');
    const words = decomposeToWords16(bytes);
    assert.equal(words.length, 16);
    assert.equal(words[0], 0x1234);
    assert.equal(words[1], 0x5678);
  });

  await t.test('5. core/palette: extractNibblesFromWord16() ekstraksi 4 nibble (4-bit)', () => {
    const word = 0xa3f2;
    const nibbles = extractNibblesFromWord16(word);
    assert.deepEqual(nibbles, [0xa, 0x3, 0xf, 0x2]);
  });

  await t.test('6. core/palette: mapNibbleToColor() & DEFAULT_PALETTE_16 (16 warna baku)', () => {
    assert.equal(DEFAULT_PALETTE_16.length, 16);
    assert.equal(mapNibbleToColor(0), DEFAULT_PALETTE_16[0]);
    assert.equal(mapNibbleToColor(15), DEFAULT_PALETTE_16[15]);
    assert.equal(mapNibbleToColor(16), DEFAULT_PALETTE_16[0]); // Modulo
  });

  await t.test('7. core/matrix: generateNumericMatrix() pembentukan matriks 64 sel (8x8)', () => {
    const matrix = generateNumericMatrix('seed_audit_test_999');
    assert.equal(matrix.length, 64);
    for (const cell of matrix) {
      assert.ok(cell >= 0 && cell <= 15, `Sel ${cell} harus berada dalam rentang 4-bit 0-15`);
    }
  });

  await t.test('8. core/matrix: matrixToGrid2D() transformasi ke matriks 2D [8][8]', () => {
    const matrix = generateNumericMatrix('seed_audit_test_999');
    const grid = matrixToGrid2D(matrix);
    assert.equal(grid.length, 8);
    assert.equal(grid[0].length, 8);
  });

  // --- PRESENTATION LAYER ---
  await t.test('9. renderer/canvasRenderer: render() fillRect 64 sel & clear() tanpa DOM leak', () => {
    const drawCalls = [];
    const mockCtx = {
      clearRect(x, y, w, h) { drawCalls.push({ type: 'clearRect', x, y, w, h }); },
      fillRect(x, y, w, h) { drawCalls.push({ type: 'fillRect', x, y, w, h }); },
      strokeRect(x, y, w, h) { drawCalls.push({ type: 'strokeRect', x, y, w, h }); }
    };
    const mockCanvas = {
      width: 200,
      height: 200,
      getContext() { return mockCtx; },
      getBoundingClientRect() { return { width: 200, height: 200 }; }
    };

    const renderer = new CanvasMatrixRenderer(mockCanvas, { handleDpr: false });
    const dummyMatrix = new Array(64).fill(7);
    renderer.render(dummyMatrix);

    assert.ok(drawCalls.some(c => c.type === 'clearRect'));
    assert.equal(drawCalls.filter(c => c.type === 'fillRect').length, 64);

    renderer.clear();
    assert.ok(drawCalls.filter(c => c.type === 'clearRect').length >= 2);
  });

  // --- EVENT EMITTER LAYER ---
  await t.test('10. events/eventEmitter: on(), off(), emit(), & return unsubscribe()', () => {
    const emitter = new SdkEventEmitter();
    let counter = 0;
    const unsubscribe = emitter.on('tick', (data) => { counter += data.val; });

    emitter.emit('tick', { val: 5 });
    assert.equal(counter, 5);

    unsubscribe();
    emitter.emit('tick', { val: 10 });
    assert.equal(counter, 5, 'Unsubscribe harus mematikan event');
  });

  // --- BACKGROUND COMPUTATION LAYER ---
  await t.test('11. worker/workerClient: Request/Response, Timeout Guard, & Termination', async () => {
    class MockWorker {
      constructor() { this.terminated = false; this.onmessage = null; }
      postMessage(msg) {
        if (msg.payload && msg.payload.challenge === 'force_timeout') return;
        setTimeout(() => {
          if (this.onmessage) {
            this.onmessage({
              data: {
                id: msg.id,
                ok: true,
                payload: { proof: { protocol: 'groth16' }, publicSignals: ['1'], durationMs: 25 }
              }
            });
          }
        }, 10);
      }
      terminate() { this.terminated = true; }
    }

    const mockWorker = new MockWorker();
    const client = new WorkerClient({ customWorker: mockWorker, timeoutMs: 40 });

    const res = await client.generateProof({
      secret: 'sec', timeWindow: 1, challenge: 'ch', wasmUrl: '/w.wasm', zkeyUrl: '/z.zkey'
    });
    assert.equal(res.durationMs, 25);

    await assert.rejects(
      async () => client.generateProof({ secret: 'sec', timeWindow: 1, challenge: 'force_timeout' }),
      /timeout/i
    );

    client.terminate();
    assert.equal(mockWorker.terminated, true);
  });

  // --- FACADE SDK LAYER ---
  await t.test('12. sdk/ZkCanvasSDK: Facade Lifecycle (start, stop, destroy, generateProof, getMatrix)', async () => {
    class MockWorkerSdk {
      postMessage(msg) {
        setTimeout(() => {
          if (this.onmessage) {
            this.onmessage({
              data: {
                id: msg.id,
                ok: true,
                payload: { proof: { pi_a: ['1', '2', '3'] }, publicSignals: ['100'], durationMs: 12 }
              }
            });
          }
        }, 5);
      }
      terminate() {}
    }

    const sdk = new ZkCanvasSDK({
      secret: 'master_key_audit',
      rotationIntervalMs: 5000,
      customWorker: new MockWorkerSdk()
    });

    assert.equal(sdk.isRunning(), false);

    let patternTriggered = false;
    const unbind = sdk.on('patternChange', (d) => {
      patternTriggered = true;
      assert.equal(d.matrix.length, 64);
    });

    await sdk.start();
    assert.equal(sdk.isRunning(), true);
    assert.equal(patternTriggered, true);
    assert.equal(sdk.getMatrix().length, 64);

    const proofResult = await sdk.generateProof('audit_nonce');
    assert.equal(proofResult.durationMs, 12);

    unbind();
    sdk.stop();
    assert.equal(sdk.isRunning(), false);

    sdk.destroy();
    assert.equal(sdk.getMatrix(), null);
  });
});
