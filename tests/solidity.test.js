import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import solc from 'solc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONTRACTS_DIR = path.join(__dirname, '../contracts');

test('Solidity Smart Contract Tooling & Bytecode Verification', async (t) => {
  const verifierPath = path.join(CONTRACTS_DIR, 'MultiImageVerifier.sol');
  const vaultPath = path.join(CONTRACTS_DIR, 'MultiImage2FAVault.sol');

  assert.ok(fs.existsSync(verifierPath), 'MultiImageVerifier.sol harus ada di direktori contracts/');
  assert.ok(fs.existsSync(vaultPath), 'MultiImage2FAVault.sol harus ada di direktori contracts/');

  const verifierSource = fs.readFileSync(verifierPath, 'utf8');
  const vaultSource = fs.readFileSync(vaultPath, 'utf8');

  await t.test('1. Kompilasi MultiImageVerifier.sol (Groth16 Verifier Contract)', () => {
    const input = {
      language: 'Solidity',
      sources: {
        'MultiImageVerifier.sol': { content: verifierSource }
      },
      settings: {
        outputSelection: {
          '*': {
            '*': ['abi', 'evm.bytecode']
          }
        }
      }
    };

    const output = JSON.parse(solc.compile(JSON.stringify(input)));
    const errors = (output.errors || []).filter(e => e.severity === 'error');
    assert.equal(errors.length, 0, `Kompilasi Verifier harus 0 error: ${JSON.stringify(errors)}`);

    const verifierContract = output.contracts['MultiImageVerifier.sol']['Groth16Verifier'];
    assert.ok(verifierContract, 'Kontrak Groth16Verifier harus berhasil dikompilasi');
    assert.ok(verifierContract.evm.bytecode.object.length > 0, 'Bytecode Groth16Verifier harus terbentuk');

    // Pastikan interface verifyProof tersedia dalam ABI
    const verifyFunc = verifierContract.abi.find(item => item.name === 'verifyProof');
    assert.ok(verifyFunc, 'Fungsi verifyProof harus ada di dalam ABI kontrak verifier');
    assert.equal(verifyFunc.inputs.length, 4, 'verifyProof harus menerima 4 parameter (a, b, c, input)');
  });

  await t.test('2. Kompilasi MultiImage2FAVault.sol (On-chain Keyfile 2FA Vault)', () => {
    const input = {
      language: 'Solidity',
      sources: {
        'MultiImageVerifier.sol': { content: verifierSource },
        'MultiImage2FAVault.sol': { content: vaultSource }
      },
      settings: {
        outputSelection: {
          '*': {
            '*': ['abi', 'evm.bytecode']
          }
        }
      }
    };

    const output = JSON.parse(solc.compile(JSON.stringify(input)));
    const errors = (output.errors || []).filter(e => e.severity === 'error');
    assert.equal(errors.length, 0, `Kompilasi Vault harus 0 error: ${JSON.stringify(errors)}`);

    const vaultContract = output.contracts['MultiImage2FAVault.sol']['MultiImage2FAVault'];
    assert.ok(vaultContract, 'Kontrak MultiImage2FAVault harus berhasil dikompilasi');
    assert.ok(vaultContract.evm.bytecode.object.length > 0, 'Bytecode MultiImage2FAVault harus terbentuk');

    const registerFunc = vaultContract.abi.find(item => item.name === 'registerCommitment');
    assert.ok(registerFunc, 'Fungsi registerCommitment harus ada di dalam ABI vault');

    const challengeFunc = vaultContract.abi.find(item => item.name === 'requestChallengeNonce');
    assert.ok(challengeFunc, 'Fungsi requestChallengeNonce harus ada di dalam ABI vault');

    const verifyFunc = vaultContract.abi.find(item => item.name === 'verify2FA');
    assert.ok(verifyFunc, 'Fungsi verify2FA harus ada di dalam ABI vault');
  });
});
