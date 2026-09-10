import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { authController, requireAuth } from './authController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Percayai 1 hop reverse proxy (Nginx / Cloudflare / Docker) untuk akurasi IP rate limiting
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Sajikan file statis frontend dari folder client (vendor browser mandiri sudah ada di client/public/vendor)
const clientPath = path.join(__dirname, '../../client');
app.use(express.static(clientPath));

// Sajikan artefak sirkuit ZKP (WASM, zkey, vkey)
const zkArtifactsPath = path.join(__dirname, '../../circuits/build');
app.use('/zk', express.static(zkArtifactsPath));

import { createRateLimiter } from './rateLimiter.js';

// Rate Limiter untuk melindungi dari brute-force dan offline commitment harvesting
const authLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 15,
  message: 'Terlalu banyak percobaan otentikasi. Silakan tunggu 1 menit.'
});

const recoveryLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 5,
  message: 'Terlalu banyak permintaan sesi pemulihan akun. Silakan tunggu 1 menit.'
});

// API Routes (Publik)
app.post('/api/auth/register', authLimiter, authController.register);
app.post('/api/auth/login', authLimiter, authController.login);
app.post('/api/auth/challenge', authLimiter, authController.challenge);
app.post('/api/auth/verify-2fa', authLimiter, authController.verify2fa);
app.post('/api/auth/recover-challenge', recoveryLimiter, authController.recoverChallenge);
app.post('/api/auth/recover-reset', recoveryLimiter, authController.recoverReset);
app.get('/api/auth/user/:username', authLimiter, authController.getUserStatus);

// API Routes (Terproteksi Bearer Session Token)
app.get('/api/user/vault', requireAuth, authController.getVaultData);
app.post('/api/auth/logout', requireAuth, authController.logout);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'ZK-Multi-Image-Keyfile-2FA',
    uptime: process.uptime()
  });
});

// Jalankan server jika dieksekusi langsung
const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMainModule && process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`🚀 ZK Multi-Image Keyfile 2FA Server running on:`);
    console.log(`   http://localhost:${PORT}`);
    console.log(`=======================================================`);
  });
}

export default app;
