import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { authController } from './authController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Sajikan file statis frontend dari folder client
const clientPath = path.join(__dirname, '../../client');
app.use(express.static(clientPath));

// Sajikan node_modules snarkjs dan circomlibjs agar browser dapat memuatnya
const nodeModulesPath = path.join(__dirname, '../../node_modules');
app.use('/vendor', express.static(nodeModulesPath));

// Sajikan artefak sirkuit ZKP (WASM, zkey, vkey)
const zkArtifactsPath = path.join(__dirname, '../../circuits/build');
app.use('/zk', express.static(zkArtifactsPath));

// API Routes
app.post('/api/auth/register', authController.register);
app.post('/api/auth/challenge', authController.challenge);
app.post('/api/auth/verify-2fa', authController.verify2fa);
app.get('/api/auth/user/:username', authController.getUserStatus);

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
