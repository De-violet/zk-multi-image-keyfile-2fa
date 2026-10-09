/**
 * Controller Antarmuka ZK-OTP Authenticator
 * Menggunakan ZkCanvasSDK untuk rendering canvas dan kalkulasi proof di Web Worker.
 */

let sdkInstance = null;
let currentSessionToken = null;

// Indikator Status Backend
async function checkBackendConnection() {
  const dot = document.getElementById('connectionDot');
  const text = document.getElementById('connectionText');
  if (!dot || !text) return;

  try {
    const res = await fetch('/api/health');
    if (res.ok) {
      dot.style.background = '#22c55e';
      text.style.color = '#ffffff';
      text.textContent = 'Server Online (Express REST API)';
    } else {
      throw new Error();
    }
  } catch {
    dot.style.background = '#eab308';
    text.style.color = '#a1a1aa';
    text.textContent = 'Mode Mandiri (WASM Client / Standalone)';
  }
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
  const inspectorWindow = document.getElementById('inspectorWindow');
  const inspectorMatrix = document.getElementById('inspectorMatrix');

  if (!canvas || typeof window === 'undefined' || !window.ZkCanvasSDK) return;

  if (sdkInstance) {
    sdkInstance.destroy();
  }

  const secret = secretInput ? secretInput.value.trim() : '12345678901234567890';

  sdkInstance = new window.ZkCanvasSDK({
    secret,
    canvas,
    rotationIntervalMs: 60000,
    workerScriptUrl: '/sdk/workerScript.js'
  });

  sdkInstance.on('tick', ({ remainingMs }) => {
    const sec = Math.ceil(remainingMs / 1000);
    if (secondsLeftEl) secondsLeftEl.textContent = `${sec}s`;
  });

  sdkInstance.on('patternChange', ({ window: win, matrix }) => {
    if (windowLabel) windowLabel.textContent = win;
    if (inspectorWindow) inspectorWindow.textContent = win;
    if (inspectorMatrix && matrix) {
      inspectorMatrix.textContent = matrix.slice(0, 16).join(', ') + '... (64 sel)';
    }
  });

  sdkInstance.start();
}

document.addEventListener('DOMContentLoaded', () => {
  checkBackendConnection();
  initSdk();

  const secretInput = document.getElementById('totpMasterSecret');
  const userInput = document.getElementById('totpUsername');
  const btnAuth = document.getElementById('btnAuthVisualTotp');
  const authCard = document.getElementById('authCard');
  const successCard = document.getElementById('successCard');

  // Tab Navigasi
  const tabBtnAuthenticator = document.getElementById('tabBtnAuthenticator');
  const tabBtnInspector = document.getElementById('tabBtnInspector');
  const viewAuthenticator = document.getElementById('viewAuthenticator');
  const viewInspector = document.getElementById('viewInspector');

  if (tabBtnAuthenticator && tabBtnInspector) {
    tabBtnAuthenticator.addEventListener('click', () => {
      tabBtnAuthenticator.classList.add('active');
      tabBtnInspector.classList.remove('active');
      viewAuthenticator.style.display = 'flex';
      viewInspector.style.display = 'none';
    });

    tabBtnInspector.addEventListener('click', () => {
      tabBtnInspector.classList.add('active');
      tabBtnAuthenticator.classList.remove('active');
      viewInspector.style.display = 'flex';
      viewAuthenticator.style.display = 'none';
    });
  }

  // Update SDK saat master secret diubah
  if (secretInput) {
    secretInput.addEventListener('change', () => {
      initSdk();
    });
  }

  // Tombol Autentikasi Visual TOTP
  if (btnAuth) {
    btnAuth.addEventListener('click', async () => {
      const username = (userInput ? userInput.value.trim() : '') || 'demo_user';
      btnAuth.disabled = true;
      showStatus('totpStatus', 'info', 'Meminta challenge nonce dari server...');

      try {
        // 1. Dapatkan Nonce Ephemeral
        const chalRes = await fetch('/api/auth/visual-challenge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username })
        });
        const chalData = await chalRes.json();
        if (!chalRes.ok || !chalData.success) {
          throw new Error(chalData.error || 'Gagal memperoleh challenge nonce.');
        }

        const serverNonce = chalData.sessionNonce;
        showStatus('totpStatus', 'info', 'Menghitung Groth16 Proof di Web Worker...');

        // 2. Kalkulasi ZK Proof via SDK
        const proofResult = await sdkInstance.generateProof(serverNonce);

        showStatus('totpStatus', 'info', `Proof selesai (${proofResult.durationMs}ms). Mengirim verifikasi ke server...`);

        // 3. Verifikasi ke Server
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

        // Simpan sesi dan tampilkan layar sukses
        currentSessionToken = verifyData.sessionToken;
        authCard.style.display = 'none';
        successCard.style.display = 'block';

        document.getElementById('loggedInUser').textContent = username;
        document.getElementById('verifyVisualKey').textContent = verifyData.visualKey || proofResult.publicSignals[0];
        document.getElementById('verifyTime').textContent = `${proofResult.durationMs}ms (Proof) + ${verifyData.verificationDurationMs || 0}ms (Server)`;

        const receiptEl = document.getElementById('loginProofReceipt');
        if (receiptEl) {
          receiptEl.textContent = JSON.stringify({
            protocol: proofResult.proof.protocol,
            curve: proofResult.proof.curve,
            publicSignals: proofResult.publicSignals,
            pi_a: proofResult.proof.pi_a,
            serverVerified: true
          }, null, 2);
        }

        hideStatus('totpStatus');
      } catch (err) {
        showStatus('totpStatus', 'error', 'Otentikasi gagal: ' + err.message);
      } finally {
        btnAuth.disabled = false;
      }
    });
  }

  // Tombol Uji Otorisasi Vault
  const btnTestVault = document.getElementById('btnTestVaultAccess');
  const vaultBox = document.getElementById('vaultResponseBox');
  if (btnTestVault) {
    btnTestVault.addEventListener('click', async () => {
      if (!currentSessionToken) {
        alert('Tidak ada session token aktif.');
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
      successCard.style.display = 'none';
      authCard.style.display = 'block';
      if (vaultBox) vaultBox.style.display = 'none';
    });
  }
});
