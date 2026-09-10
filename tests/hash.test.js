import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { SNARK_SCALAR_FIELD } from '../server/src/nonceManager.js';
import { getPoseidon, computeHierarchicalCommitment, computeSessionAuthToken } from '../client/src/crypto/poseidon.js';
import { deriveSaltFromPassphrase, generateAutoSalt, deriveSaltFromUsername, createBackupPayload } from '../client/src/crypto/saltManager.js';
import { sortImageFieldElements, hasDuplicateHashes } from '../client/src/crypto/fileHash.js';

test('1. Determinisme Reduksi SHA-256 ke BN254 Scalar Field', async () => {
  const sampleData = Buffer.from('RAW_PIXEL_DATA_RGB_ENTROPY_SAMPLE_1');
  const sha256Hex = crypto.createHash('sha256').update(sampleData).digest('hex');
  
  const bigIntVal = BigInt('0x' + sha256Hex);
  const fieldElement = bigIntVal % SNARK_SCALAR_FIELD;

  assert.ok(fieldElement >= 0n, 'Field element harus non-negatif');
  assert.ok(fieldElement < SNARK_SCALAR_FIELD, 'Field element harus lebih kecil dari scalar field BN254');
  
  // Memastikan komputasi berulang menghasilkan nilai yang 100% identik
  const repeatFieldElement = BigInt('0x' + crypto.createHash('sha256').update(sampleData).digest('hex')) % SNARK_SCALAR_FIELD;
  assert.equal(fieldElement, repeatFieldElement, 'Reduksi modulo harus 100% deterministik');
});

test('2. Entropi Auto-Salt & KDF Passphrase PBKDF2 (100.000 iterasi)', async () => {
  const autoSalt = generateAutoSalt();
  assert.ok(autoSalt.rawHex.length === 64, 'Panjang hex salt auto-generate harus 64 karakter (32 byte / 256 bit)');
  assert.ok(BigInt(autoSalt.fieldElement) < SNARK_SCALAR_FIELD, 'Salt harus valid dalam domain BN254');

  const username = 'alice_cyber';
  const passphrase = 'UltraSecurePin9876!';
  const kdf1 = await deriveSaltFromPassphrase(passphrase, username);
  const kdf2 = await deriveSaltFromPassphrase(passphrase, username);

  assert.equal(kdf1.fieldElement, kdf2.fieldElement, 'KDF PBKDF2 harus deterministik untuk input dan username yang sama');

  const kdfDifferentUser = await deriveSaltFromPassphrase(passphrase, 'bob_cyber');
  assert.notEqual(kdf1.fieldElement, kdfDifferentUser.fieldElement, 'Salt KDF harus terikat dengan username');
});

test('3. Hierarki Hashing Poseidon (Image Key, Root Commitment, Session Token)', async () => {
  const h1 = (BigInt('0x' + crypto.createHash('sha256').update('image1').digest('hex')) % SNARK_SCALAR_FIELD).toString();
  const h2 = (BigInt('0x' + crypto.createHash('sha256').update('image2').digest('hex')) % SNARK_SCALAR_FIELD).toString();
  const h3 = (BigInt('0x' + crypto.createHash('sha256').update('image3').digest('hex')) % SNARK_SCALAR_FIELD).toString();
  const salt = '12345678901234567890';
  const sessionNonce = '998877665544332211';

  const { masterKey, rootCommitment } = await computeHierarchicalCommitment(h1, h2, h3, salt);
  assert.ok(masterKey, 'Master key harus terhitung');
  assert.ok(rootCommitment, 'Root commitment harus terhitung');

  const sessionAuthToken = await computeSessionAuthToken(masterKey, sessionNonce);
  assert.ok(sessionAuthToken, 'Session Auth Token harus terhitung');

  // Buktikan zero-noise tolerance: 1 bit perubahan pada h1 merubah total root commitment
  const h1Tampered = (BigInt(h1) + 1n).toString();
  const tampered = await computeHierarchicalCommitment(h1Tampered, h2, h3, salt);
  assert.notEqual(rootCommitment, tampered.rootCommitment, '1 bit perubahan pada gambar wajib mengubah total root commitment (Zero-Noise Tolerance)');
});

test('4. Derivasi Salt Deterministik per Username (Zero Network Salt Leakage)', async () => {
  const user1 = 'alexander';
  const user2 = 'ALEXANDER ';
  const user3 = 'bertrand';

  const salt1 = await deriveSaltFromUsername(user1);
  const salt2 = await deriveSaltFromUsername(user2);
  const salt3 = await deriveSaltFromUsername(user3);

  assert.equal(salt1.fieldElement, salt2.fieldElement, 'Derivasi harus case-insensitive dan trimmed');
  assert.notEqual(salt1.fieldElement, salt3.fieldElement, 'Username berbeda harus menghasilkan salt berbeda');
  assert.ok(BigInt(salt1.fieldElement) < SNARK_SCALAR_FIELD, 'Salt harus valid dalam domain BN254');
});

test('5. Validasi Struktur Sertifikat Kunci Cadangan (createBackupPayload)', () => {
  const payload = createBackupPayload('cybernaut', '1234567890', '9876543210');
  assert.equal(payload.standard, 'Zero-Knowledge Multi-Image Keyfile 2FA');
  assert.equal(payload.version, '1.0.0');
  assert.equal(payload.username, 'cybernaut');
  assert.equal(payload.salt, '1234567890');
  assert.equal(payload.rootCommitment, '9876543210');
  assert.ok(payload.notice, 'Notice harus ada');
});

test('6. Penyortiran Deterministik Hash Foto (Order-Independent Keyfile)', () => {
  const hA = '12345678901234567890';
  const hB = '99999999999999999999';
  const hC = '55555555555555555555';

  const perm1 = sortImageFieldElements([hA, hB, hC]);
  const perm2 = sortImageFieldElements([hC, hA, hB]);
  const perm3 = sortImageFieldElements([hB, hC, hA]);

  assert.deepEqual(perm1, perm2, 'Permutasi 1 dan 2 harus menghasilkan urutan yang identik');
  assert.deepEqual(perm2, perm3, 'Permutasi 2 dan 3 harus menghasilkan urutan yang identik');
  assert.equal(perm1[0], hA);
  assert.equal(perm1[1], hC);
  assert.equal(perm1[2], hB);
});

test('7. Deteksi Foto Kunci Duplikat (Anti-Trivial Collision)', () => {
  const h1 = '1234567890';
  const h2 = '9876543210';
  const h3 = '1234567890';

  assert.equal(hasDuplicateHashes([h1, h2, h3]), true, 'Harus mendeteksi duplikat foto');
  assert.equal(hasDuplicateHashes([h1, h2, '555555']), false, 'Tidak boleh mendeteksi duplikat jika semua foto unik');
});
