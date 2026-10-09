import { ZkCanvasSDK } from '../sdk/esm/index.js';

/**
 * Controller Antarmuka ZK-OTP Authenticator Demo
 * Skenario: Login -> Lupa Password -> Ambil Kunci Gambar (45s) -> Verifikasi Gambar untuk Login
 */

let sdkInstance = null;
let currentSessionToken = null;
let currentKeyImageData = null;

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
      text.textContent = 'Server Online (Express REST API)';
      return true;
    }
  } catch {}

  dot.style.background = '#eab308';
  text.style.color = '#a1a1aa';
  text.textContent = 'Mode Mandiri (WASM Client / Standalone)';
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

  sdkInstance.on('tick', ({ remainingMs }) => {
    const sec = Math.ceil(remainingMs / 1000);
    if (secondsLeftEl) secondsLeftEl.textContent = `${sec}s`;
  });

  sdkInstance.on('patternChange', ({ window: win }) => {
    if (windowLabel) windowLabel.textContent = win;
  });

  sdkInstance.start();
}

document.addEventListener('DOMContentLoaded', () => {
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

  // Tab switching
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
      recoveryPanel.style.display = recoveryPanel.style.display === 'none' ? 'flex' : 'none';
    });
  }

  // Buka tab generator gambar
  if (btnGoToGenerator) {
    btnGoToGenerator.addEventListener('click', () => {
      switchTab('generator');
    });
  }

  // Pasang preview gambar yang dipilih
  function setKeyImage(dataUrl) {
    currentKeyImageData = dataUrl;
    if (imgPreview && imagePreviewContainer) {
      imgPreview.src = dataUrl;
      imagePreviewContainer.style.display = 'flex';
    }
    showStatus('loginStatus', 'info', 'Gambar kunci 2FA siap diverifikasi (rotasi 45s).');
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
          } catch {
            // Fallback: simpan di memori lokal sesi
            setKeyImage(canvas.toDataURL('image/png'));
            showStatus('genStatus', 'info', 'Gambar disalin ke memori sesi.');
          }
        });
      } catch (e) {
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
              return;
            }
          }
        }
        showStatus('loginStatus', 'error', 'Tidak ada data gambar di clipboard.');
      } catch {
        // Jika pembatasan browser clipboard API, gunakan gambar dari canvas aktif jika ada
        const canvas = document.getElementById('totpCanvas');
        if (canvas) {
          setKeyImage(canvas.toDataURL('image/png'));
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
    });
  }

  // Login Normal
  if (btnLoginNormal) {
    btnLoginNormal.addEventListener('click', () => {
      showStatus('loginStatus', 'error', 'Login password biasa terkunci. Gunakan opsi "Lupa Password? Masuk via Kunci Gambar 2FA".');
      if (recoveryPanel) recoveryPanel.style.display = 'flex';
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
      showStatus('loginStatus', 'info', 'Menyiapkan challenge nonce (siklus 45 detik)...');

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
            }
          }
        } catch {}

        if (!serverNonce) {
          const randBytes = new Uint8Array(16);
          crypto.getRandomValues(randBytes);
          serverNonce = '0x' + Array.from(randBytes).map(b => b.toString(16).padStart(2, '0')).join('');
        }

        showStatus('loginStatus', 'info', 'Menghitung Groth16 Proof di Web Worker...');

        // Menghasilkan ZK Proof melalui antarmuka tingkat tinggi SDK
        const proofResult = await sdkInstance.generateProof(serverNonce);

        let verifyDuration = 0;
        let visualKey = proofResult.publicSignals[0];

        if (isOnline) {
          showStatus('loginStatus', 'info', `Proof selesai (${proofResult.durationMs}ms). Memvalidasi ke server...`);
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
            throw new Error(verifyData.error || 'Verifikasi server gagal.');
          }
          currentSessionToken = verifyData.sessionToken;
          verifyDuration = verifyData.verificationDurationMs || 0;
          if (verifyData.visualKey) visualKey = verifyData.visualKey;
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
      } catch (err) {
        showStatus('loginStatus', 'error', 'Otentikasi gambar gagal: ' + err.message);
      } finally {
        btnVerifyImageLogin.disabled = false;
      }
    });
  }

  // Master secret update
  if (secretInput) {
    secretInput.addEventListener('change', () => initSdk());
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
      } catch (err) {
        vaultBox.style.display = 'block';
        vaultBox.textContent = 'Error: ' + err.message;
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
    });
  }
});
