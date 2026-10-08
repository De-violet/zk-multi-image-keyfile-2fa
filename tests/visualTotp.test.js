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
});
