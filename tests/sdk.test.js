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

test('SDK Test Suite', async (t) => {
  await t.test('1. Pure Logic: Perhitungan Jendela Waktu & Edge Cases', () => {
    // 60 detik = 60000 ms
    const t0 = 120000;
    assert.equal(calculateTimeWindow(t0, 60000), 2);
    assert.equal(calculateRemainingMs(t0, 60000), 60000);

    const t1 = 125000;
    assert.equal(calculateTimeWindow(t1, 60000), 2);
    assert.equal(calculateRemainingMs(t1, 60000), 55000);

    // Edge case: 1 ms sebelum berganti
    const tEdge = 179999;
    assert.equal(calculateTimeWindow(tEdge, 60000), 2);
    assert.equal(calculateRemainingMs(tEdge, 60000), 1);
    assert.equal(calculateNextWindowTimestamp(tEdge, 60000), 180000);

    // Pergantian window tepat
    assert.equal(calculateTimeWindow(180000, 60000), 3);

    // Invalid interval
    assert.throws(() => calculateTimeWindow(100, 0), /positif/);
  });

  await t.test('2. Pure Logic: Dekomposisi Biner 2x8-bit (16-bit words)', () => {
    const hex = '0x123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0';
    const bytes = normalizeToBytes32(hex);
    assert.equal(bytes.length, 32);

    const words = decomposeToWords16(bytes);
    assert.equal(words.length, 16);
    assert.equal(words[0], 0x1234);
    assert.equal(words[1], 0x5678);
  });

  await t.test('3. Pure Logic: Pemetaan Palet 4-bit & Ekstraksi Nibble', () => {
    const word = 0xa3f2;
    const nibbles = extractNibblesFromWord16(word);
    assert.deepEqual(nibbles, [0xa, 0x3, 0xf, 0x2]);

    assert.equal(DEFAULT_PALETTE_16.length, 16);
    assert.equal(mapNibbleToColor(0), DEFAULT_PALETTE_16[0]);
    assert.equal(mapNibbleToColor(15), DEFAULT_PALETTE_16[15]);
    assert.equal(mapNibbleToColor(16), DEFAULT_PALETTE_16[0]); // Modulo wrap
  });

  await t.test('4. Pure Logic: Transformasi Matriks Numerik 8x8', () => {
    const matrix = generateNumericMatrix('secret_seed_test_123');
    assert.equal(matrix.length, 64);

    for (const cell of matrix) {
      assert.ok(cell >= 0 && cell <= 15, `Sel ${cell} harus berada dalam rentang 4-bit (0-15)`);
    }

    const grid2D = matrixToGrid2D(matrix);
    assert.equal(grid2D.length, 8);
    assert.equal(grid2D[0].length, 8);
  });

  await t.test('5. Presentation Layer: Canvas 2D Renderer (Mock Context)', () => {
    const drawCalls = [];
    const mockCtx = {
      clearRect(x, y, w, h) { drawCalls.push({ type: 'clearRect', x, y, w, h }); },
      fillRect(x, y, w, h) { drawCalls.push({ type: 'fillRect', x, y, w, h, fillStyle: this.fillStyle }); },
      strokeRect(x, y, w, h) { drawCalls.push({ type: 'strokeRect', x, y, w, h }); },
      scale(x, y) { drawCalls.push({ type: 'scale', x, y }); }
    };
    const mockCanvas = {
      width: 200,
      height: 200,
      getContext() { return mockCtx; },
      getBoundingClientRect() { return { width: 200, height: 200 }; }
    };

    const renderer = new CanvasMatrixRenderer(mockCanvas, { handleDpr: false });
    const dummyMatrix = new Array(64).fill(5);
    renderer.render(dummyMatrix);

    assert.ok(drawCalls.some(c => c.type === 'clearRect'));
    assert.equal(drawCalls.filter(c => c.type === 'fillRect').length, 64);

    renderer.clear();
    assert.ok(drawCalls.filter(c => c.type === 'clearRect').length >= 2);
  });

  await t.test('6. Event Emitter: Type-Safe Pub/Sub & Unsubscribe', () => {
    const emitter = new SdkEventEmitter();
    let tickCount = 0;

    const unbind = emitter.on('tick', (data) => {
      tickCount += data.remainingMs;
    });

    emitter.emit('tick', { remainingMs: 100, currentWindow: 1 });
    assert.equal(tickCount, 100);

    // Unsubscribe
    unbind();
    emitter.emit('tick', { remainingMs: 200, currentWindow: 1 });
    assert.equal(tickCount, 100, 'Listener yang telah di-unsubscribe tidak boleh dipanggil lagi');
  });

  await t.test('7. Background Layer: WorkerClient Request, Timeout, & Termination', async () => {
    // Mock Worker untuk lingkungan pengujian Node.js
    class MockWorker {
      constructor() {
        this.terminated = false;
        this.onmessage = null;
        this.onerror = null;
      }
      postMessage(msg) {
        if (msg.payload && msg.payload.challenge === 'force_error') {
          setTimeout(() => {
            if (this.onmessage) this.onmessage({ data: { id: msg.id, ok: false, error: 'Simulated worker error' } });
          }, 10);
        } else if (msg.payload && msg.payload.challenge === 'force_timeout') {
          // Tidak membalas untuk menguji timeout
        } else {
          setTimeout(() => {
            if (this.onmessage) {
              this.onmessage({
                data: {
                  id: msg.id,
                  ok: true,
                  payload: { proof: { pi_a: ['1', '2', '3'] }, publicSignals: ['10', '20'], durationMs: 42 }
                }
              });
            }
          }, 10);
        }
      }
      terminate() {
        this.terminated = true;
      }
    }

    const mockWorker = new MockWorker();
    const client = new WorkerClient({ customWorker: mockWorker, timeoutMs: 50 });

    // Sukses
    const res = await client.generateProof({
      secret: '123',
      timeWindow: 1,
      challenge: 'nonce_ok',
      wasmUrl: '/zk.wasm',
      zkeyUrl: '/zk.zkey'
    });
    assert.equal(res.durationMs, 42);
    assert.ok(res.proof);

    // Error handling
    await assert.rejects(
      async () => {
        await client.generateProof({
          secret: '123',
          timeWindow: 1,
          challenge: 'force_error',
          wasmUrl: '/zk.wasm',
          zkeyUrl: '/zk.zkey'
        });
      },
      /Simulated worker error/
    );

    // Timeout handling
    await assert.rejects(
      async () => {
        await client.generateProof({
          secret: '123',
          timeWindow: 1,
          challenge: 'force_timeout',
          wasmUrl: '/zk.wasm',
          zkeyUrl: '/zk.zkey'
        });
      },
      /timeout/i
    );

    // Termination
    client.terminate();
    assert.equal(mockWorker.terminated, true);
  });

  await t.test('8. Facade ZkCanvasSDK: Lifecycle, Events, & Proof Generation', async () => {
    // Config validation
    assert.throws(() => new ZkCanvasSDK({}), /secret/);

    class MockWorkerSdk {
      postMessage(msg) {
        setTimeout(() => {
          if (this.onmessage) {
            this.onmessage({
              data: {
                id: msg.id,
                ok: true,
                payload: { proof: { protocol: 'groth16' }, publicSignals: ['1', '2'], durationMs: 15 }
              }
            });
          }
        }, 10);
      }
      terminate() {}
    }

    const sdk = new ZkCanvasSDK({
      secret: 'master_key_facade',
      rotationIntervalMs: 5000,
      customWorker: new MockWorkerSdk()
    });

    assert.equal(sdk.isRunning(), false);

    let patternChanged = false;
    let ticksReceived = 0;

    const unbindPattern = sdk.on('patternChange', (data) => {
      patternChanged = true;
      assert.equal(data.matrix.length, 64);
    });

    const unbindTick = sdk.on('tick', () => {
      ticksReceived++;
    });

    await sdk.start();
    assert.equal(sdk.isRunning(), true);
    assert.equal(patternChanged, true);
    assert.ok(ticksReceived >= 1);
    assert.equal(sdk.getMatrix().length, 64);

    // Proof generation
    const proofRes = await sdk.generateProof('challenge_nonce_123');
    assert.equal(proofRes.durationMs, 15);
    assert.equal(proofRes.proof.protocol, 'groth16');

    // Stop & Destroy
    unbindPattern();
    unbindTick();
    sdk.stop();
    assert.equal(sdk.isRunning(), false);

    sdk.destroy();
    assert.equal(sdk.getMatrix(), null);
  });
});
