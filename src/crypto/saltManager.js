import { SNARK_SCALAR_FIELD, bufferToHex } from './fileHash.js';

/**
 * Otomatis generate 256-bit CSPRNG Secret Salt
 */
export function generateAutoSalt() {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  const hex = bufferToHex(randomBytes);
  const fieldElement = (BigInt('0x' + hex) % SNARK_SCALAR_FIELD).toString();

  return {
    rawHex: hex,
    fieldElement
  };
}

/**
 * Derivasi Salt deterministik per username menggunakan SHA-256 modulo BN254
 * Mengunci salt unik per pengguna sehingga server tidak perlu membocorkan salt2fa via network
 */
export async function deriveSaltFromUsername(username) {
  const cleanUser = (username || '').trim().toLowerCase();
  const encoder = new TextEncoder();
  const rawBytes = encoder.encode(`ZK2FA_USER_SALT_ROOT_${cleanUser}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', rawBytes);
  const hex = bufferToHex(hashBuffer);
  const fieldElement = (BigInt('0x' + hex) % SNARK_SCALAR_FIELD).toString();

  return {
    rawHex: hex,
    fieldElement
  };
}

/**
 * Derivasi Salt dari Passphrase / PIN kustom menggunakan PBKDF2-HMAC-SHA256 (100.000 iterasi)
 * Menutup celah entropi rendah terhadap rainbow table / brute force
 */
export async function deriveSaltFromPassphrase(passphrase, username) {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  // Gunakan username + prefix sebagai salt KDF
  const kdfSalt = encoder.encode(`ZK2FA_KEYFILE_SALT_V1_${username.toLowerCase()}`);

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: kdfSalt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    passwordKey,
    256 // 32 byte
  );

  const hex = bufferToHex(derivedBits);
  const fieldElement = (BigInt('0x' + hex) % SNARK_SCALAR_FIELD).toString();

  return {
    rawHex: hex,
    fieldElement
  };
}

/**
 * Menghasilkan struktur payload cadangan otentikasi
 */
export function createBackupPayload(username, saltFieldElement, rootCommitment) {
  return {
    standard: 'Zero-Knowledge Multi-Image Keyfile 2FA',
    version: '1.0.0',
    username,
    salt: saltFieldElement,
    rootCommitment,
    notice: 'Simpan file ini dengan aman. Salt ini diperlukan untuk menghasilkan ZK-Proof saat otentikasi.'
  };
}

/**
 * Mengunduh file backup.key darurat berisi salt pengguna
 */
export function downloadBackupKey(username, saltFieldElement, rootCommitment) {
  const backupPayload = createBackupPayload(username, saltFieldElement, rootCommitment);

  const blob = new Blob([JSON.stringify(backupPayload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${username}_zk2fa_backup.key`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
