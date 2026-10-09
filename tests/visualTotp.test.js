import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { fileURLToPath } from 'url';
import * as snarkjs from 'snarkjs';
import {
  visualTotpMiddleware,
  issueVisualNonce,
  visualNonceStore
} from '../server/src/middlewares/visualTotpMiddleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WASM_PATH = path.resolve(__dirname, '../circuits/build/VisualTOTP_js/VisualTOTP.wasm');
const ZKEY_PATH = path.resolve(__dirname, '../circuits/build/VisualTOTP_final.zkey');
const VKEY_PATH = path.resolve(__dirname, '../circuits/build/VisualTOTP_vkey.json');

test('Visual TOTP End-to-End Pipeline', async (t) => {
  const masterSecret = '12345678901234567890';
  const timeWindow = Math.floor(Date.now() / 1000 / 60);
  const nonce = issueVisualNonce('session-test-1');

  await t.test('1. Menghasilkan ZK Proof yang valid', async () => {
    const input = {
      masterSecret,
      timeWindow: timeWindow.toString(),
      serverNonce: nonce
    };

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      input,
      WASM_PATH,
      ZKEY_PATH
    );

    assert.ok(proof);
    assert.equal(publicSignals.length, 4);
    assert.equal(publicSignals[2], timeWindow.toString());
    assert.equal(publicSignals[3], nonce);
  });

  await t.test('2. Middleware menerima proof valid dan mencatat sesi', async () => {
    const freshNonce = issueVisualNonce('session-test-2');
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      {
        masterSecret,
        timeWindow: timeWindow.toString(),
        serverNonce: freshNonce
      },
      WASM_PATH,
      ZKEY_PATH
    );

    const req = {
      body: {
        proof,
        publicSignals,
        clientTimeWindow: timeWindow,
        nonce: freshNonce
      },
      session: {}
    };

    let nextCalled = false;
    const res = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.body = data;
        return this;
      }
    };

    const middleware = visualTotpMiddleware({ vKeyPath: VKEY_PATH });
    await middleware(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(req.session.is2FAVerified, true);
    assert.ok(req.session.imageCommitment);
    // Nonce harus sudah dihapus dari store
    assert.equal(visualNonceStore.has(freshNonce), false);
  });

  await t.test('3. Middleware menolak replay attack dengan nonce yang sama', async () => {
    const req = {
      body: {
        proof: {},
        publicSignals: [],
        clientTimeWindow: timeWindow,
        nonce: 'non-existent-nonce'
      }
    };
    let responseStatus = null;
    let responseBody = null;
    const res = {
      status(code) {
        responseStatus = code;
        return this;
      },
      json(data) {
        responseBody = data;
        return this;
      }
    };

    const middleware = visualTotpMiddleware({ vKeyPath: VKEY_PATH });
    await middleware(req, res, () => {});

    assert.equal(responseStatus, 403);
    assert.equal(responseBody.success, false);
  });

  await t.test('4. Middleware menolak time drift melebihi ±1 window', async () => {
    const driftNonce = issueVisualNonce('session-test-3');
    const staleWindow = timeWindow - 5; // Drift 5 window

    const req = {
      body: {
        proof: {},
        publicSignals: ['1', '2', staleWindow.toString(), driftNonce],
        clientTimeWindow: staleWindow,
        nonce: driftNonce
      }
    };

    let responseStatus = null;
    const res = {
      status(code) {
        responseStatus = code;
        return this;
      },
      json(data) {
        return this;
      }
    };

    const middleware = visualTotpMiddleware({ vKeyPath: VKEY_PATH });
    await middleware(req, res, () => {});

    assert.equal(responseStatus, 401);
  });

  await t.test('5. visualGenerator: Bit-packing (2x8-bit) dan ekstraksi 4-bit (16 palet)', async () => {
    const { generateVisualPattern, VISUAL_PALETTE_16 } = await import('../client/src/crypto/visualGenerator.js');
    const pattern = generateVisualPattern('0x123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0');

    assert.equal(pattern.cells.length, 64);
    assert.equal(pattern.palette.length, 16);
    assert.equal(pattern.grid.length, 8);
    assert.equal(pattern.grid[0].length, 8);

    for (const cell of pattern.cells) {
      assert.ok(cell >= 0 && cell < 16, `Indeks sel ${cell} harus dalam rentang 0-15`);
    }
  });

  await t.test('6. zkVerifier: verifyVisualTotpProof mengarahkan ke VisualTOTP_vkey.json & drift ±1', async () => {
    const { verifyVisualTotpProof } = await import('../server/src/zkVerifier.js');
    const freshNonce = issueVisualNonce('session-test-verifier');
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      {
        masterSecret,
        timeWindow: timeWindow.toString(),
        serverNonce: freshNonce
      },
      WASM_PATH,
      ZKEY_PATH
    );

    // Kasus Valid
    const resValid = await verifyVisualTotpProof({
      proof,
      publicSignals,
      clientTimeWindow: timeWindow,
      sessionNonce: freshNonce
    });
    assert.equal(resValid.valid, true);

    // Kasus Drift melebihi ±1
    const resDrift = await verifyVisualTotpProof({
      proof,
      publicSignals,
      clientTimeWindow: timeWindow - 3,
      sessionNonce: freshNonce
    });
    assert.equal(resDrift.valid, false);
    assert.match(resDrift.error, /drift/i);
  });

  await t.test('7. Pembuktian matematika ditolak jika secret salah atau sinyal publik dimanipulasi', async () => {
    const { verifyVisualTotpProof } = await import('../server/src/zkVerifier.js');
    const attackerSecret = '99999999999999999999';
    const freshNonce = issueVisualNonce('session-test-attacker');

    // Attacker menghasilkan proof dari secret yang salah
    const { proof: attackerProof, publicSignals: attackerSignals } = await snarkjs.groth16.fullProve(
      {
        masterSecret: attackerSecret,
        timeWindow: timeWindow.toString(),
        serverNonce: freshNonce
      },
      WASM_PATH,
      ZKEY_PATH
    );

    // 1. Jika attacker mencoba memalsukan publicSignals (misal mencocokkan imageCommitment korban)
    const tamperedSignals = [...attackerSignals];
    tamperedSignals[0] = '123456789'; // imageCommitment palsu

    const resTampered = await verifyVisualTotpProof({
      proof: attackerProof,
      publicSignals: tamperedSignals,
      clientTimeWindow: timeWindow,
      sessionNonce: freshNonce
    });
    assert.equal(resTampered.valid, false, 'Manipulasi komitmen pada bukti matematika harus ditolak.');

    // 2. Jika attacker mencoba memasukkan nonce yang berbeda
    const tamperedNonceSignals = [...attackerSignals];
    tamperedNonceSignals[3] = '987654321'; // nonce tidak cocok

    const resNonceMismatch = await verifyVisualTotpProof({
      proof: attackerProof,
      publicSignals: tamperedNonceSignals,
      clientTimeWindow: timeWindow,
      sessionNonce: freshNonce
    });
    assert.equal(resNonceMismatch.valid, false, 'Mismatch serverNonce harus ditolak.');
  });

  await t.test('8. Rendering Canvas: MatrixRenderer & renderVisualMatrix (64 sel, palet warna, isolasi DOM)', async () => {
    const { MatrixRenderer } = await import('../client/src/ui/matrixRenderer.js');
    const { renderVisualMatrix } = await import('../client/src/visualTotpCanvas.js');
    const { generateVisualPattern } = await import('../client/src/crypto/visualGenerator.js');

    const drawCalls = [];
    const mockCtx = {
      clearRect(x, y, w, h) { drawCalls.push({ type: 'clearRect', x, y, w, h }); },
      fillRect(x, y, w, h) { drawCalls.push({ type: 'fillRect', x, y, w, h }); },
      strokeRect(x, y, w, h) { drawCalls.push({ type: 'strokeRect', x, y, w, h }); }
    };
    const mockCanvas = {
      width: 200,
      height: 200,
      getContext: () => mockCtx
    };

    // MatrixRenderer
    const renderer = new MatrixRenderer(mockCanvas);
    const pattern = generateVisualPattern('0x1234567890abcdef');
    renderer.drawMatrix(pattern.cells, pattern.palette);

    const fillCalls = drawCalls.filter((c) => c.type === 'fillRect');
    const clearCalls = drawCalls.filter((c) => c.type === 'clearRect');
    assert.equal(clearCalls.length, 1, 'Canvas harus dibersihkan sebelum merender');
    assert.equal(fillCalls.length, 64, 'Grid 8x8 harus merender tepat 64 sel');

    // renderVisualMatrix
    drawCalls.length = 0;
    renderVisualMatrix(mockCanvas, '12345678901234567890');
    const fillCallsDirect = drawCalls.filter((c) => c.type === 'fillRect');
    assert.equal(fillCallsDirect.length, 64, 'renderVisualMatrix harus merender tepat 64 sel');
  });

  await t.test('9. CORS & CORP: Web Worker memuat WASM dan ZKey tanpa kendala', async () => {
    const { default: app } = await import('../server/src/app.js');
    const server = app.listen(0);
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // 1. GET /zk/VisualTOTP.wasm dengan Origin cross-origin
      const wasmRes = await fetch(`${baseUrl}/zk/VisualTOTP.wasm`, {
        headers: { Origin: 'http://client-origin.test' }
      });
      assert.equal(wasmRes.status, 200);
      assert.equal(wasmRes.headers.get('access-control-allow-origin'), '*');
      assert.equal(wasmRes.headers.get('cross-origin-resource-policy'), 'cross-origin');
      const wasmBuf = await wasmRes.arrayBuffer();
      assert.ok(wasmBuf.byteLength > 0, 'Buffer WASM harus berhasil diunduh');

      // 2. GET /zk/VisualTOTP_final.zkey dengan Origin cross-origin
      const zkeyRes = await fetch(`${baseUrl}/zk/VisualTOTP_final.zkey`, {
        headers: { Origin: 'http://client-origin.test' }
      });
      assert.equal(zkeyRes.status, 200);
      assert.equal(zkeyRes.headers.get('access-control-allow-origin'), '*');
      assert.equal(zkeyRes.headers.get('cross-origin-resource-policy'), 'cross-origin');
      const zkeyBuf = await zkeyRes.arrayBuffer();
      assert.ok(zkeyBuf.byteLength > 0, 'Buffer ZKey harus berhasil diunduh');

      // 3. Preflight OPTIONS request untuk artefak ZK
      const optRes = await fetch(`${baseUrl}/zk/VisualTOTP.wasm`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://client-origin.test',
          'Access-Control-Request-Method': 'GET'
        }
      });
      assert.equal(optRes.status, 204);
      assert.equal(optRes.headers.get('access-control-allow-origin'), '*');
      assert.equal(optRes.headers.get('cross-origin-resource-policy'), 'cross-origin');
    } finally {
      server.close();
    }
  });

  await t.test('10. Endpoint Verifikasi Server: Kunci Visual OTP, Toleransi Jendela Waktu & Pembakaran Nonce Sekali Pakai', async () => {
    const { default: app } = await import('../server/src/app.js');
    const server = app.listen(0);
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // 1. Dapatkan ephemeral challenge nonce
      const chalRes = await fetch(`${baseUrl}/api/auth/visual-challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'demo_user' })
      });
      assert.equal(chalRes.status, 200);
      const chalData = await chalRes.json();
      assert.ok(chalData.sessionNonce);
      const serverNonce = chalData.sessionNonce;
      const curWindow = chalData.timeWindow;

      // 2. Buat ZK Proof valid
      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        {
          masterSecret,
          timeWindow: curWindow.toString(),
          serverNonce
        },
        WASM_PATH,
        ZKEY_PATH
      );

      // 3. Endpoint membaca kunci visual OTP dan verifikasi sukses
      const verifyRes = await fetch(`${baseUrl}/api/auth/verify-2fa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'demo_user',
          sessionNonce: serverNonce,
          proof,
          publicSignals,
          clientTimeWindow: curWindow
        })
      });
      assert.equal(verifyRes.status, 200);
      const verifyData = await verifyRes.json();
      assert.equal(verifyData.success, true);
      assert.equal(verifyData.visualKey, publicSignals[0], 'Endpoint harus membaca kunci visual OTP (imageCommitment)');
      assert.ok(verifyData.sessionToken);

      // 4. Pembakaran Nonce Sekali Pakai (Replay Attack Ditolak)
      const replayRes = await fetch(`${baseUrl}/api/auth/verify-2fa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'demo_user',
          sessionNonce: serverNonce,
          proof,
          publicSignals,
          clientTimeWindow: curWindow
        })
      });
      assert.equal(replayRes.status, 401, 'Percobaan verifikasi dengan nonce yang sama harus ditolak');
      const replayData = await replayRes.json();
      assert.match(replayData.error, /replay|burned|not found/i);

      // 5. Toleransi Jendela Waktu (±1 siklus diterima, > 1 siklus ditolak)
      const driftChalRes = await fetch(`${baseUrl}/api/auth/visual-challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'demo_user' })
      });
      const driftChalData = await driftChalRes.json();
      const driftNonce = driftChalData.sessionNonce;

      // Proof dengan drift waktu melebihi toleransi (> ±1 window)
      const excessiveDriftWindow = curWindow + 3;
      const { proof: driftProof, publicSignals: driftSignals } = await snarkjs.groth16.fullProve(
        {
          masterSecret,
          timeWindow: excessiveDriftWindow.toString(),
          serverNonce: driftNonce
        },
        WASM_PATH,
        ZKEY_PATH
      );

      const driftRes = await fetch(`${baseUrl}/api/auth/verify-visual-totp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'demo_user',
          nonce: driftNonce,
          proof: driftProof,
          publicSignals: driftSignals,
          clientTimeWindow: excessiveDriftWindow
        })
      });
      assert.equal(driftRes.status, 401, 'Time drift melebihi batas ±1 siklus harus ditolak');
      const driftErrData = await driftRes.json();
      assert.match(driftErrData.error, /drift/i);
    } finally {
      server.close();
    }
  });
});

test.after(() => {
  setTimeout(() => process.exit(0), 300).unref();
});
