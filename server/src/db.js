import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.DB_PATH || (process.env.NODE_ENV === 'test' ? null : path.join(__dirname, '../data/users.json'));

// Pastikan direktori data ada jika menyimpan ke disk
if (DB_PATH) {
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

let users = {};

// Muat database jika file sudah ada dan bukan mode test in-memory
if (DB_PATH && fs.existsSync(DB_PATH)) {
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    users = JSON.parse(raw);
  } catch (err) {
    console.warn('[DB] Gagal memuat database file, menginisialisasi database kosong baru:', err.message);
    users = {};
  }
}

function persist() {
  if (!DB_PATH) return; // Pengujian otomatis berjalan murni in-memory tanpa memutasi file disk
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(users, null, 2), 'utf-8');
  } catch (err) {
    console.error('[DB] Gagal menyimpan ke database file:', err.message);
  }
}

export const db = {
  getUser(username) {
    return users[username.toLowerCase()] || null;
  },

  userExists(username) {
    return !!users[username.toLowerCase()];
  },

  saveUser({ username, passwordHash, passwordSalt, rootCommitment, salt2fa }) {
    const key = username.toLowerCase();
    users[key] = {
      username: key,
      passwordHash,
      passwordSalt: passwordSalt || null,
      rootCommitment: rootCommitment.toString(),
      salt2fa: salt2fa ? salt2fa.toString() : (users[key]?.salt2fa || "0"),
      createdAt: new Date().toISOString()
    };
    persist();
    return users[key];
  },

  clear() {
    users = {};
    persist();
  }
};
