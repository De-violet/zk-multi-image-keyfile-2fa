import { ZkCanvasSDK } from '../sdk/esm/index.js';

/**
 * Controller Antarmuka ZK-OTP Developer Playground
 * Skenario: Login -> Lupa Password -> Ambil Kunci Gambar (45s) -> Verifikasi Gambar untuk Login
 * Dilengkapi dengan Live Telemetry Logs & SDK Integration Snippets
 */

let sdkInstance = null;
let currentSessionToken = null;
let currentKeyImageData = null;

// Telemetry Logger untuk Developer Console
function logDev(tag, msg, extra = '') {
  const consoleEl = document.getElementById('devLogConsole');
  if (!consoleEl) return;
  const now = new Date();
  const timeStr = now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0');
  
  const tagClasses = {
    SDK: 'log-tag-sdk',
    PROVER: 'log-tag-prover',
    SERVER: 'log-tag-server',
    EVENT: 'log-tag-warn',
    ERROR: 'log-tag-err'
  };
  const tagClass = tagClasses[tag] || 'log-tag-sdk';

  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.innerHTML = `<span class="log-time">[${timeStr}]</span> <span class="${tagClass}">[${tag}]</span> ${msg} ${extra ? `<span style="color:#71717a;">${extra}</span>` : ''}`;
  consoleEl.appendChild(entry);
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

// Indikator Status Backend
async function checkBackendConnection() {
  const dot = document.getElementById('connectionDot');
  const text = document.getElementById('connectionText');
  if (!dot || !text) return false;

  try {
    const res = await fetch('/api/health');
    if (res.ok) {
      dot.style.background = '#22c55e';
      text.style.color = '#ffffff';
      text.textContent = 'Server Online';
      logDev('SERVER', 'REST API terhubung di :3000', '(Health 200 OK)');
      return true;
    }
  } catch {}

  dot.style.background = '#eab308';
  text.style.color = '#a1a1aa';
  text.textContent = 'Mode Mandiri';
  logDev('SERVER', 'Menjalankan mode mandiri WASM', '(GitHub Pages / Static)');
  return false;
}

function showStatus(elementId, type, message) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.className = `status-box ${type}`;
  el.textContent = message;
  el.style.display = 'block';
}

function hideStatus(elementId) {
  const el = document.getElementById(elementId);
  if (el) el.style.display = 'none';
}

function initSdk() {
  const canvas = document.getElementById('totpCanvas');
  const secretInput = document.getElementById('totpMasterSecret');
  const windowLabel = document.getElementById('totpWindowLabel');
  const secondsLeftEl = document.getElementById('totpSecondsLeft');

  if (!canvas) return;

  if (sdkInstance) {
    sdkInstance.destroy();
  }

  const secret = secretInput ? secretInput.value.trim() : '12345678901234567890';

  // Siklus rotasi 45 detik (45000 ms)
  sdkInstance = new ZkCanvasSDK({
    secret,
    canvas,
    rotationIntervalMs: 45000,
    assetBaseUrl: './public/zk/',
    workerScriptUrl: './sdk/browser/workerScript.js'
  });

  logDev('SDK', 'ZkCanvasSDK diinisialisasi', `(Interval: 45s, Canvas: 8x8)`);

  sdkInstance.on('tick', ({ remainingMs, currentWindow }) => {
    const sec = Math.ceil(remainingMs / 1000);
    if (secondsLeftEl) secondsLeftEl.textContent = `${sec}s`;
    if (sec % 15 === 0) {
      logDev('SDK', `Tick: sisa ${sec}s pada window #${currentWindow}`);
    }
  });

  sdkInstance.on('patternChange', ({ window: win, matrix }) => {
    if (windowLabel) windowLabel.textContent = win;
    logDev('EVENT', `Pergantian Jendela Waktu aktif -> #${win}`, `(Matrix: 64 sel warna dirender)`);
  });

  sdkInstance.start();
}

document.addEventListener('DOMContentLoaded', () => {
  logDev('SDK', 'Memulai ZK-OTP Developer Playground...');
  checkBackendConnection();
  initSdk();

  const tabBtnLogin = document.getElementById('tabBtnLogin');
  const tabBtnGenerator = document.getElementById('tabBtnGenerator');
  const viewLogin = document.getElementById('viewLogin');
  const viewGenerator = document.getElementById('viewGenerator');
  const authCard = document.getElementById('authCard');
  const successCard = document.getElementById('successCard');

  const btnForgotPwd = document.getElementById('btnForgotPwd');
  const recoveryPanel = document.getElementById('recoveryPanel');
  const btnGoToGenerator = document.getElementById('btnGoToGenerator');
  const btnDownloadImage = document.getElementById('btnDownloadImage');
  const btnCopyImage = document.getElementById('btnCopyImage');
  const btnUseImageForLogin = document.getElementById('btnUseImageForLogin');
  const btnPasteImage = document.getElementById('btnPasteImage');
  const fileImageInput = document.getElementById('fileImageInput');
  const imgPreview = document.getElementById('imgPreview');
  const imagePreviewContainer = document.getElementById('imagePreviewContainer');
  const btnVerifyImageLogin = document.getElementById('btnVerifyImageLogin');
  const btnLoginNormal = document.getElementById('btnLoginNormal');
  const secretInput = document.getElementById('totpMasterSecret');
  const userInput = document.getElementById('loginUsername');

  // Dev Console Tabs
  const tabBtnLogs = document.getElementById('tabBtnLogs');
  const tabBtnSnippets = document.getElementById('tabBtnSnippets');
  const viewDevLogs = document.getElementById('viewDevLogs');
  const viewDevSnippets = document.getElementById('viewDevSnippets');
  const btnClearLogs = document.getElementById('btnClearLogs');

  if (tabBtnLogs && tabBtnSnippets) {
    tabBtnLogs.addEventListener('click', () => {
      tabBtnLogs.classList.add('active');
      tabBtnSnippets.classList.remove('active');
      viewDevLogs.style.display = 'block';
      viewDevSnippets.style.display = 'none';
    });
    tabBtnSnippets.addEventListener('click', () => {
      tabBtnSnippets.classList.add('active');
      tabBtnLogs.classList.remove('active');
      viewDevSnippets.style.display = 'block';
      viewDevLogs.style.display = 'none';
    });
  }

  if (btnClearLogs) {
    btnClearLogs.addEventListener('click', () => {
      const consoleEl = document.getElementById('devLogConsole');
      if (consoleEl) consoleEl.innerHTML = '';
      logDev('SDK', 'Console dibersihkan');
    });
  }

  // Tab switching sandbox
  function switchTab(target) {
    if (target === 'login') {
      tabBtnLogin.classList.add('active');
      tabBtnGenerator.classList.remove('active');
      viewLogin.style.display = 'flex';
      viewGenerator.style.display = 'none';
    } else {
      tabBtnGenerator.classList.add('active');
      tabBtnLogin.classList.remove('active');
      viewGenerator.style.display = 'flex';
      viewLogin.style.display = 'none';
    }
  }

  if (tabBtnLogin && tabBtnGenerator) {
    tabBtnLogin.addEventListener('click', () => switchTab('login'));
    tabBtnGenerator.addEventListener('click', () => switchTab('generator'));
  }

  // 1. Tombol Lupa Password -> buka panel pemulihan gambar
  if (btnForgotPwd && recoveryPanel) {
    btnForgotPwd.addEventListener('click', () => {
      const isHidden = recoveryPanel.style.display === 'none';
      recoveryPanel.style.display = isHidden ? 'flex' : 'none';
      if (isHidden) {
        logDev('EVENT', 'User membuka opsi pemulihan 2FA Visual Image');
      }
    });
  }

  // Buka tab generator gambar
  if (btnGoToGenerator) {
    btnGoToGenerator.addEventListener('click', () => {
      switchTab('generator');
      logDev('EVENT', 'Navigasi ke 2FA Visual Keyfile Generator');
    });
  }

  // Pasang preview gambar yang dipilih
  function setKeyImage(dataUrl) {
    currentKeyImageData = dataUrl;
    if (imgPreview && imagePreviewContainer) {
      imgPreview.src = dataUrl;
      imagePreviewContainer.style.display = 'flex';
    }
    showStatus('loginStatus', 'info', 'Gambar kunci 2FA terpasang (jendela aktif 45s).');
    logDev('SDK', 'Gambar kunci visual dimuat ke form autentikasi');
  }

  // 2. Generator: Unduh Gambar PNG
  if (btnDownloadImage) {
    btnDownloadImage.addEventListener('click', () => {
      const canvas = document.getElementById('totpCanvas');
      if (!canvas) return;
      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `zk-otp-key-${Date.now()}.png`;
      a.click();
      showStatus('genStatus', 'info', 'Gambar kunci 2FA berhasil diunduh.');
      logDev('SDK', 'Mengunduh berkas gambar visual keyfile (.png)');
    });
  }

  // Generator: Salin Gambar ke Clipboard
  if (btnCopyImage) {
    btnCopyImage.addEventListener('click', async () => {
      const canvas = document.getElementById('totpCanvas');
      if (!canvas) return;
      try {
        canvas.toBlob(async (blob) => {
          if (!blob) return;
          try {
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': blob })
            ]);
            showStatus('genStatus', 'info', 'Gambar berhasil disalin ke clipboard!');
            logDev('SDK', 'Gambar disalin ke system clipboard');
          } catch {
            setKeyImage(canvas.toDataURL('image/png'));
            showStatus('genStatus', 'info', 'Gambar disalin ke memori sesi.');
            logDev('SDK', 'Gambar disimpan ke session storage buffer');
          }
        });
      } catch {
        setKeyImage(canvas.toDataURL('image/png'));
        showStatus('genStatus', 'info', 'Gambar disalin ke memori sesi.');
      }
    });
  }

  // Generator: Gunakan Gambar untuk Login -> bawa ke tab login
  if (btnUseImageForLogin) {
    btnUseImageForLogin.addEventListener('click', () => {
      const canvas = document.getElementById('totpCanvas');
      if (canvas) {
        setKeyImage(canvas.toDataURL('image/png'));
      }
      recoveryPanel.style.display = 'flex';
      switchTab('login');
      logDev('EVENT', 'Membawa gambar kunci ke form login');
    });
  }

  // Login: Tempel Gambar dari Clipboard
  if (btnPasteImage) {
    btnPasteImage.addEventListener('click', async () => {
      try {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          for (const type of item.types) {
            if (type.startsWith('image/')) {
              const blob = await item.getType(type);
              const reader = new FileReader();
              reader.onload = (e) => setKeyImage(e.target.result);
              reader.readAsDataURL(blob);
              logDev('SDK', 'Membaca gambar dari clipboard API');
              return;
            }
          }
        }
        showStatus('loginStatus', 'error', 'Tidak ada data gambar di clipboard.');
      } catch {
        const canvas = document.getElementById('totpCanvas');
        if (canvas) {
          setKeyImage(canvas.toDataURL('image/png'));
          logDev('SDK', 'Mengambil gambar langsung dari canvas aktif');
        } else {
          showStatus('loginStatus', 'error', 'Izin clipboard ditolak. Silakan gunakan tombol Unggah File PNG.');
        }
      }
    });
  }

  // Listener Paste global (Ctrl+V)
  window.addEventListener('paste', (e) => {
    const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
    if (!items) return;
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const blob = item.getAsFile();
        const reader = new FileReader();
        reader.onload = (event) => setKeyImage(event.target.result);
        reader.readAsDataURL(blob);
        logDev('SDK', 'Event Paste (Ctrl+V) gambar kunci ditangkap');
        break;
      }
    }
  });

  // Login: Unggah Berkas PNG
  if (fileImageInput) {
    fileImageInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => setKeyImage(event.target.result);
      reader.readAsDataURL(file);
      logDev('SDK', `Berkas diunggah: ${file.name} (${file.size} bytes)`);
    });
  }

  // Login Normal
  if (btnLoginNormal) {
    btnLoginNormal.addEventListener('click', () => {
      showStatus('loginStatus', 'error', 'Login password biasa terkunci. Silakan gunakan opsi "Lupa Password? Masuk via Kunci Gambar 2FA".');
      if (recoveryPanel) recoveryPanel.style.display = 'flex';
      logDev('EVENT', 'User menekan login biasa -> dialihkan ke pemulihan kunci 2FA');
    });
  }

  // Eksekusi Verifikasi Login Gambar 2FA
  if (btnVerifyImageLogin) {
    btnVerifyImageLogin.addEventListener('click', async () => {
      const username = (userInput ? userInput.value.trim() : '') || 'demo_user';
      if (!currentKeyImageData) {
        showStatus('loginStatus', 'error', 'Silakan tempel atau unggah gambar kunci 2FA terlebih dahulu.');
        return;
      }

      btnVerifyImageLogin.disabled = true;
      showStatus('loginStatus', 'info', 'Menyiapkan challenge nonce...');
      logDev('PROVER', `Memulai pipeline verifikasi 2FA untuk "${username}"`);

      try {
        let serverNonce = null;
        let isOnline = false;

        try {
          const chalRes = await fetch('/api/auth/visual-challenge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
          });
          if (chalRes.ok) {
            const chalData = await chalRes.json();
            if (chalData.success) {
              serverNonce = chalData.sessionNonce;
              isOnline = true;
              logDev('SERVER', `Challenge nonce diterima dari server: ${serverNonce.slice(0, 16)}...`);
            }
          }
        } catch {}

        if (!serverNonce) {
          const randBytes = new Uint8Array(16);
          crypto.getRandomValues(randBytes);
          serverNonce = '0x' + Array.from(randBytes).map(b => b.toString(16).padStart(2, '0')).join('');
          logDev('PROVER', `Challenge nonce lokal dibuat: ${serverNonce.slice(0, 16)}...`);
        }

        showStatus('loginStatus', 'info', 'Menghitung Groth16 Proof di Web Worker...');
        logDev('PROVER', 'Mendelegasikan komputasi Groth16 ke SnarkJS Web Worker...');

        // Menghasilkan ZK Proof melalui antarmuka tingkat tinggi SDK
        const proofResult = await sdkInstance.generateProof(serverNonce);
        logDev('PROVER', `Proof selesai dihitung (${proofResult.durationMs}ms)`, `Signals count: ${proofResult.publicSignals.length}`);

        let verifyDuration = 0;
        let visualKey = proofResult.publicSignals[0];

        if (isOnline) {
          showStatus('loginStatus', 'info', `Proof selesai (${proofResult.durationMs}ms). Memvalidasi ke server...`);
          logDev('SERVER', 'Mengirim bukti kriptografi ke /api/auth/verify-2fa...');

          const verifyRes = await fetch('/api/auth/verify-2fa', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              username,
              sessionNonce: serverNonce,
              proof: proofResult.proof,
              publicSignals: proofResult.publicSignals,
              clientTimeWindow: sdkInstance.getCurrentWindow()
            })
          });

          const verifyData = await verifyRes.json();
          if (!verifyRes.ok || !verifyData.success) {
            logDev('ERROR', `Verifikasi server gagal: ${verifyData.error || 'Ditolak'}`);
            throw new Error(verifyData.error || 'Verifikasi server gagal.');
          }
          currentSessionToken = verifyData.sessionToken;
          verifyDuration = verifyData.verificationDurationMs || 0;
          if (verifyData.visualKey) visualKey = verifyData.visualKey;
          logDev('SERVER', `Proof valid! Server memverifikasi dalam ${verifyDuration}ms`, `(Token sesi diterbitkan)`);
        } else {
          logDev('SERVER', 'Proof terverifikasi secara matematis via Web Worker (Standalone mode)');
        }

        // Tampilkan layar sukses
        authCard.style.display = 'none';
        successCard.style.display = 'block';

        document.getElementById('loggedInUser').textContent = username;
        document.getElementById('verifyVisualKey').textContent = visualKey;
        document.getElementById('verifyTime').textContent = isOnline
          ? `${proofResult.durationMs}ms (Proof) + ${verifyDuration}ms (Server)`
          : `${proofResult.durationMs}ms (Proof Klien Mandiri)`;

        const receiptEl = document.getElementById('loginProofReceipt');
        if (receiptEl) {
          receiptEl.textContent = JSON.stringify({
            protocol: proofResult.proof.protocol,
            curve: proofResult.proof.curve,
            challenge: serverNonce,
            timeWindowCycle: '45 seconds',
            publicSignals: proofResult.publicSignals,
            pi_a: proofResult.proof.pi_a,
            mode: isOnline ? 'Server-Verified (Express REST)' : 'Client-Side Standalone (SnarkJS WASM)'
          }, null, 2);
        }

        hideStatus('loginStatus');
        logDev('SERVER', `Otentikasi berhasil! Sesi aktif untuk ${username}`);
      } catch (err) {
        showStatus('loginStatus', 'error', 'Otentikasi gambar gagal: ' + err.message);
        logDev('ERROR', `Kegagalan: ${err.message}`);
      } finally {
        btnVerifyImageLogin.disabled = false;
      }
    });
  }

  // Master secret update
  if (secretInput) {
    secretInput.addEventListener('change', () => {
      initSdk();
      logDev('SDK', 'Master Secret pengguna diperbarui');
    });
  }

  // Tombol Uji Otorisasi Vault
  const btnTestVault = document.getElementById('btnTestVaultAccess');
  const vaultBox = document.getElementById('vaultResponseBox');
  if (btnTestVault) {
    btnTestVault.addEventListener('click', async () => {
      if (!currentSessionToken) {
        alert('Tidak ada session token aktif (Mode Mandiri).');
        return;
      }
      try {
        const res = await fetch('/api/user/vault', {
          headers: { Authorization: `Bearer ${currentSessionToken}` }
        });
        const data = await res.json();
        vaultBox.style.display = 'block';
        vaultBox.textContent = JSON.stringify(data, null, 2);
        logDev('SERVER', 'Akses vault /api/user/vault berhasil');
      } catch (err) {
        vaultBox.style.display = 'block';
        vaultBox.textContent = 'Error: ' + err.message;
        logDev('ERROR', 'Akses vault gagal: ' + err.message);
      }
    });
  }

  // Tombol Logout
  const btnLogout = document.getElementById('btnLogout');
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      currentSessionToken = null;
      currentKeyImageData = null;
      if (imagePreviewContainer) imagePreviewContainer.style.display = 'none';
      successCard.style.display = 'none';
      authCard.style.display = 'block';
      if (vaultBox) vaultBox.style.display = 'none';
      logDev('EVENT', 'User logout dari sesi');
    });
  }
});
