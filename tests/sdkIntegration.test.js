import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { fileURLToPath } from 'url';

import { ZkCanvasSDK } from '../sdk/src/sdk/ZkCanvasSDK.js';
import { NodeWorkerProcessBridge } from './helpers/nodeWorkerBridge.js';
import { verifyVisualTotpProof } from '../server/src/zkVerifier.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WASM_PATH = path.resolve(__dirname, '../circuits/build/VisualTOTP_js/VisualTOTP.wasm');
const ZKEY_PATH = path.resolve(__dirname, '../circuits/build/VisualTOTP_final.zkey');

test('Phase A — SDK Integration Verification & Hardening', async (t) => {
  const masterSecret = '12345678901234567890';

  // Helper mock canvas
  function createMockCanvas() {
    const drawCalls = [];
    const mockCtx = {
      clearRect(x, y, w, h) { drawCalls.push({ type: 'clearRect', x, y, w, h }); },
      fillRect(x, y, w, h) { drawCalls.push({ type: 'fillRect', x, y, w, h }); },
      strokeRect(x, y, w, h) { drawCalls.push({ type: 'strokeRect', x, y, w, h }); },
      scale() {}
    };
    return {
      width: 200,
      height: 200,
      getContext: () => mockCtx,
      getBoundingClientRect: () => ({ width: 200, height: 200 }),
      drawCalls
    };
  }

  // =========================================================================
  // 1. SDK Lifecycle Integration
  // =========================================================================
  await t.test('1. SDK Lifecycle: start() -> running -> stop() -> resume -> destroy()', async () => {
    const mockCanvas = createMockCanvas();
    const workerBridge = new NodeWorkerProcessBridge();

    const sdk = new ZkCanvasSDK({
      secret: masterSecret,
      canvas: mockCanvas,
      rotationIntervalMs: 2000,
      customWorker: workerBridge
    });

    assert.equal(sdk.isRunning(), false);
    assert.equal(sdk.isDestroyed(), false);

    // Start
    await sdk.start();
    assert.equal(sdk.isRunning(), true);
    assert.ok(sdk.getMatrix() !== null);
    assert.equal(sdk.getMatrix().length, 64);

    // Stop
    sdk.stop();
    assert.equal(sdk.isRunning(), false);
    // Contract: Matriks terakhir tetap ada setelah stop
    assert.equal(sdk.getMatrix().length, 64);

    // Resume start setelah stop
    await sdk.start();
    assert.equal(sdk.isRunning(), true);

    // Destroy
    sdk.destroy();
    assert.equal(sdk.isRunning(), false);
    assert.equal(sdk.isDestroyed(), true);
    assert.equal(sdk.getMatrix(), null);
    assert.equal(workerBridge.terminated, true);

    // Contract: start() & generateProof() setelah destroy harus throw error
    await assert.rejects(async () => sdk.start(), /di-destroy/);
    await assert.rejects(async () => sdk.generateProof('123'), /di-destroy/);
  });

  // =========================================================================
  // 2. Tick Integration
  // =========================================================================
  await t.test('2. Tick Integration: timer/window calculation menghasilkan event tick berkala', async () => {
    const workerBridge = new NodeWorkerProcessBridge();
    const sdk = new ZkCanvasSDK({
      secret: masterSecret,
      rotationIntervalMs: 5000,
      customWorker: workerBridge
    });

    let receivedTick = null;
    const unsubscribe = sdk.on('tick', (payload) => {
      receivedTick = payload;
    });

    await sdk.start();

    // Tunggu minimal 1 tick
    await new Promise((r) => setTimeout(r, 1100));

    assert.ok(receivedTick !== null, 'Event tick harus terpancar saat SDK running');
    assert.equal(typeof receivedTick.remainingMs, 'number');
    assert.ok(receivedTick.remainingMs > 0 && receivedTick.remainingMs <= 5000);
    assert.equal(typeof receivedTick.currentWindow, 'number');

    unsubscribe();
    sdk.destroy();
  });

  // =========================================================================
  // 3. Pattern Integration
  // =========================================================================
  await t.test('3. Pattern Integration: pergantian jendela memicu reka ulang matriks 64 sel', async () => {
    const workerBridge = new NodeWorkerProcessBridge();
    const sdk = new ZkCanvasSDK({
      secret: masterSecret,
      rotationIntervalMs: 1000,
      customWorker: workerBridge
    });

    const receivedPatterns = [];
    sdk.on('patternChange', (payload) => {
      receivedPatterns.push(payload);
    });

    await sdk.start();

    // Tunggu rotasi jendela waktu
    const startWait = Date.now();
    while (receivedPatterns.length < 2 && Date.now() - startWait < 4000) {
      await new Promise((r) => setTimeout(r, 100));
    }

    assert.ok(receivedPatterns.length >= 2, 'Minimal 2 pola terpancar saat jendela berganti');

    const p0 = receivedPatterns[0];
    const p1 = receivedPatterns[1];

    assert.equal(p0.matrix.length, 64);
    assert.equal(p1.matrix.length, 64);
    assert.notEqual(p0.window, p1.window, 'Indeks jendela waktu harus berbeda');

    // Matriks untuk jendela yang berbeda harus menghasilkan pola deterministik berbeda
    assert.notDeepEqual(p0.matrix, p1.matrix);

    sdk.destroy();
  });

  // =========================================================================
  // 4. Renderer Integration
  // =========================================================================
  await t.test('4. Renderer Integration: matriks SDK benar-benar diteruskan dan dirender ke Canvas', async () => {
    const mockCanvas = createMockCanvas();
    const workerBridge = new NodeWorkerProcessBridge();

    const sdk = new ZkCanvasSDK({
      secret: masterSecret,
      canvas: mockCanvas,
      rotationIntervalMs: 5000,
      customWorker: workerBridge
    });

    await sdk.start();

    // Verifikasi bahwa Canvas context menerima operasi clear dan 64 fillRect
    const fillRectCalls = mockCanvas.drawCalls.filter((c) => c.type === 'fillRect');
    const clearRectCalls = mockCanvas.drawCalls.filter((c) => c.type === 'clearRect');

    assert.ok(clearRectCalls.length >= 1, 'Canvas harus dibersihkan sebelum menggambar');
    assert.equal(fillRectCalls.length, 64, 'Harus merender tepat 64 sel untuk grid 8x8');

    sdk.destroy();
  });

  // =========================================================================
  // 5. Proof Integration (Real Background Worker -> Groth16 Prover)
  // =========================================================================
  await t.test('5. Proof Integration: sdk.generateProof() -> Worker -> ZK Prover -> Valid Groth16 Proof', async () => {
    const workerBridge = new NodeWorkerProcessBridge();
    const testNonce = '9876543210123456';

    const sdk = new ZkCanvasSDK({
      secret: masterSecret,
      wasmUrl: WASM_PATH,
      zkeyUrl: ZKEY_PATH,
      customWorker: workerBridge
    });

    await sdk.start();

    const startTime = performance.now();
    const result = await sdk.generateProof(testNonce);
    const totalDuration = performance.now() - startTime;

    // 1. Validasi struktur hasil
    assert.ok(result, 'Hasil pembuktian harus tersedia');
    assert.ok(result.proof, 'Objek proof harus tersedia');
    assert.equal(result.proof.protocol, 'groth16');
    assert.equal(result.proof.curve, 'bn128');
    assert.ok(Array.isArray(result.proof.pi_a));
    assert.ok(Array.isArray(result.proof.pi_b));
    assert.ok(Array.isArray(result.proof.pi_c));

    // 2. Validasi public signals: [imageCommitment, sessionAuthToken, timeWindow, serverNonce]
    assert.ok(Array.isArray(result.publicSignals));
    assert.equal(result.publicSignals.length, 4);
    assert.equal(result.publicSignals[2], sdk.getCurrentWindow().toString());
    assert.equal(result.publicSignals[3], testNonce);

    // 3. Validasi durasi
    assert.equal(typeof result.durationMs, 'number');
    assert.ok(result.durationMs > 0);
    assert.ok(totalDuration >= result.durationMs);

    // 4. Verifikasi kriptografi nyata terhadap backend verifier key
    const verification = await verifyVisualTotpProof({
      proof: result.proof,
      publicSignals: result.publicSignals,
      clientTimeWindow: sdk.getCurrentWindow(),
      sessionNonce: testNonce
    });

    assert.equal(verification.valid, true, 'Proof yang dihasilkan oleh worker harus valid secara matematis');

    sdk.destroy();
  });

  // =========================================================================
  // 6. Error Propagation Integration
  // =========================================================================
  await t.test('6. Error Propagation: invalid challenge, worker error, worker timeout, worker termination', async () => {
    const workerBridge = new NodeWorkerProcessBridge();
    const sdk = new ZkCanvasSDK({
      secret: masterSecret,
      wasmUrl: WASM_PATH,
      zkeyUrl: ZKEY_PATH,
      workerTimeoutMs: 5000,
      customWorker: workerBridge
    });

    await sdk.start();

    // 6a. Invalid Challenge (null, kosong, atau whitespace)
    await assert.rejects(
      async () => sdk.generateProof(''),
      /challenge.*wajib/i,
      'Challenge kosong harus langsung ditolak'
    );
    await assert.rejects(
      async () => sdk.generateProof('   '),
      /challenge.*wajib/i,
      'Challenge whitespace harus langsung ditolak'
    );

    // 6b. Worker Error Propagation
    let errorEmitted = false;
    sdk.on('error', (errPayload) => {
      if (errPayload.code === 'PROVER_ERROR') {
        errorEmitted = true;
      }
    });

    await assert.rejects(
      async () => sdk.generateProof('trigger_worker_error'),
      /Simulated worker cryptographic failure/,
      'Error dari worker harus sampai ke public API Promise'
    );
    assert.equal(errorEmitted, true, 'Event error harus dipancarkan saat worker gagal');

    // 6c. Worker Timeout Propagation
    const timeoutWorkerBridge = new NodeWorkerProcessBridge();
    const timeoutSdk = new ZkCanvasSDK({
      secret: masterSecret,
      wasmUrl: WASM_PATH,
      zkeyUrl: ZKEY_PATH,
      workerTimeoutMs: 100,
      customWorker: timeoutWorkerBridge
    });
    await timeoutSdk.start();
    await assert.rejects(
      async () => timeoutSdk.generateProof('trigger_worker_timeout'),
      /timeout/i,
      'Timeout harus membatalkan Promise dan melempar TimeoutError'
    );
    timeoutSdk.destroy();

    // 6d. Worker Termination saat request sedang berjalan
    const pendingPromise = sdk.generateProof('trigger_worker_timeout');
    sdk.destroy(); // Langsung destroy worker saat request masih pending

    await assert.rejects(
      async () => pendingPromise,
      /dihentikan|terminated/i,
      'Promise tidak boleh menggantung saat worker di-terminate'
    );
  });

  // =========================================================================
  // 7. Event Unsubscribe Integration
  // =========================================================================
  await t.test('7. Event Unsubscribe: pelepasan handler menghentikan penerimaan event', async () => {
    const workerBridge = new NodeWorkerProcessBridge();
    const sdk = new ZkCanvasSDK({
      secret: masterSecret,
      rotationIntervalMs: 1000,
      customWorker: workerBridge
    });

    let tickCount = 0;
    const unsubscribe = sdk.on('tick', () => {
      tickCount++;
    });

    await sdk.start();
    await new Promise((r) => setTimeout(r, 1100));
    const countBefore = tickCount;
    assert.ok(countBefore >= 1);

    // Lepas handler
    unsubscribe();

    // Tunggu interval berikutnya
    await new Promise((r) => setTimeout(r, 1200));
    assert.equal(tickCount, countBefore, 'Setelah unsubscribe, handler tidak boleh dipanggil lagi');

    sdk.destroy();
  });

  // =========================================================================
  // 8. No Secret Leakage
  // =========================================================================
  await t.test('8. No Secret Leakage: event, payload, error, dan logging tidak membocorkan secret', async () => {
    const secretTrap = '999888777666555444333222111000';
    const workerBridge = new NodeWorkerProcessBridge();

    const sdk = new ZkCanvasSDK({
      secret: secretTrap,
      rotationIntervalMs: 2000,
      wasmUrl: WASM_PATH,
      zkeyUrl: ZKEY_PATH,
      customWorker: workerBridge
    });

    let capturedTick = null;
    let capturedPattern = null;
    let capturedError = null;

    sdk.on('tick', (p) => { capturedTick = JSON.stringify(p); });
    sdk.on('patternChange', (p) => { capturedPattern = JSON.stringify(p); });
    sdk.on('error', (p) => { capturedError = JSON.stringify(p); });

    await sdk.start();
    await new Promise((r) => setTimeout(r, 100));

    // Validasi Event Tick
    assert.ok(capturedTick && !capturedTick.includes(secretTrap), 'Tick payload tidak boleh memuat secret');

    // Validasi Event Pattern
    assert.ok(capturedPattern && !capturedPattern.includes(secretTrap), 'Pattern payload tidak boleh memuat secret');

    // Validasi Proof Result
    const proofRes = await sdk.generateProof('1234567890123456');
    const proofString = JSON.stringify(proofRes);
    assert.ok(!proofString.includes(secretTrap), 'Proof result tidak boleh memuat secret');

    // Validasi Error Event
    try {
      await sdk.generateProof('trigger_worker_error');
    } catch (e) {
      assert.ok(!e.message.includes(secretTrap), 'Error message tidak boleh memuat secret');
    }
    assert.ok(!capturedError || !capturedError.includes(secretTrap), 'Error payload tidak boleh memuat secret');

    sdk.destroy();
  });
});

test.after(() => {
  setTimeout(() => process.exit(0), 300).unref();
});
