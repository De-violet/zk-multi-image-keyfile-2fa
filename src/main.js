import { hashFileDeterministic } from './crypto/fileHash.js';
import { generateAutoSalt } from './crypto/saltManager.js';
import { computeHierarchicalCommitment } from './crypto/poseidon.js';
import { generateZkProof } from './crypto/zkProver.js';

// State aplikasi sederhana
const state = {
  loginFiles: [null, null, null],
  regFiles: [null, null, null],
  currentSalt: generateAutoSalt()
};

// Helper status
function showStatus(elementId, type, message) {
  const box = document.getElementById(elementId);
  if (!box) return;
  box.className = `status-box ${type}`;
  box.textContent = message;
  box.style.display = 'block';
}

function hideStatus(elementId) {
  const box = document.getElementById(elementId);
  if (box) box.style.display = 'none';
}

// Setup slot upload file
function setupSlot(mode, index) {
  const slot = document.getElementById(`${mode}Slot${index + 1}`);
  const input = document.getElementById(`${mode}File${index + 1}`);
  const preview = document.getElementById(`${mode}Preview${index + 1}`);

  slot.addEventListener('click', () => input.click());

  input.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (mode === 'login') {
      state.loginFiles[index] = file;
    } else {
      state.regFiles[index] = file;
    }

    slot.classList.add('filled');
    const reader = new FileReader();
    reader.onload = (evt) => {
      preview.innerHTML = `
        <img src="${evt.target.result}" class="slot-img-preview" alt="Key ${index + 1}">
        <span style="position: absolute; bottom: 4px; background: rgba(0,0,0,0.7); font-size: 0.65rem; padding: 1px 6px; border-radius: 4px;">Kunci ${index + 1}</span>
      `;
    };
    reader.readAsDataURL(file);
  });
}

// Reset slot
function resetSlots(mode) {
  [0, 1, 2].forEach(i => {
    const slot = document.getElementById(`${mode}Slot${i + 1}`);
    const input = document.getElementById(`${mode}File${i + 1}`);
    const preview = document.getElementById(`${mode}Preview${i + 1}`);

    if (input) input.value = '';
    if (slot) slot.classList.remove('filled');
    if (preview) {
      preview.innerHTML = `
        <span class="slot-number">${i + 1}</span>
        <span class="slot-text">Pilih Gambar ${i + 1}</span>
      `;
    }
  });
  if (mode === 'login') state.loginFiles = [null, null, null];
  if (mode === 'reg') state.regFiles = [null, null, null];
}

// Unduh berkas contoh dan pasang ke slot pendaftaran
function createSampleKeys() {
  const colors = ['#3b82f6', '#10b981', '#f59e0b'];
  const labels = ['KUNCI_ALPHA', 'KUNCI_BETA', 'KUNCI_GAMMA'];

  [0, 1, 2].forEach(i => {
    const canvas = document.createElement('canvas');
    canvas.width = 120;
    canvas.height = 120;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = colors[i];
    ctx.fillRect(0, 0, 120, 120);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(labels[i], 60, 50);

    ctx.font = '11px sans-serif';
    ctx.fillText(`KEY #${i + 1}`, 60, 75);

    canvas.toBlob((blob) => {
      const filename = `kunci_0${i + 1}.png`;
      const file = new File([blob], filename, { type: 'image/png' });

      state.regFiles[i] = file;

      const slot = document.getElementById(`regSlot${i + 1}`);
      const preview = document.getElementById(`regPreview${i + 1}`);
      if (slot && preview) {
        slot.classList.add('filled');
        preview.innerHTML = `
          <img src="${canvas.toDataURL()}" class="slot-img-preview" alt="${filename}">
          <span style="position: absolute; bottom: 4px; background: rgba(0,0,0,0.7); font-size: 0.65rem; padding: 1px 6px; border-radius: 4px;">${filename}</span>
        `;
      }

      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }, 'image/png');
  });

  showStatus('regStatus', 'info', '✓ 3 File kunci (kunci_01, kunci_02, kunci_03) berhasil diunduh dan dipasang!');
}

document.addEventListener('DOMContentLoaded', () => {
  [0, 1, 2].forEach(i => {
    setupSlot('login', i);
    setupSlot('reg', i);
  });

  const tabBtnLogin = document.getElementById('tabBtnLogin');
  const tabBtnRegister = document.getElementById('tabBtnRegister');
  const formLogin = document.getElementById('formLogin');
  const formRegister = document.getElementById('formRegister');

  function showLoginTab() {
    tabBtnLogin.classList.add('active');
    tabBtnRegister.classList.remove('active');
    formLogin.style.display = 'flex';
    formRegister.style.display = 'none';
    hideStatus('loginStatus');
    hideStatus('regStatus');
  }

  function showRegisterTab() {
    tabBtnRegister.classList.add('active');
    tabBtnLogin.classList.remove('active');
    formRegister.style.display = 'flex';
    formLogin.style.display = 'none';
    hideStatus('loginStatus');
    hideStatus('regStatus');
  }

  tabBtnLogin.addEventListener('click', showLoginTab);
  tabBtnRegister.addEventListener('click', showRegisterTab);

  document.getElementById('btnGenSamples').addEventListener('click', createSampleKeys);

  // REGISTRASI
  formRegister.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideStatus('regStatus');

    const username = document.getElementById('regUsername').value.trim();
    const password = document.getElementById('regPassword').value;
    const [f1, f2, f3] = state.regFiles;

    if (!f1 || !f2 || !f3) {
      showStatus('regStatus', 'error', 'Pilih ketiga file gambar kunci 2FA terlebih dahulu.');
      return;
    }

    const btn = document.getElementById('btnRegSubmit');
    const btnText = btn.querySelector('.btn-text');
    const spinner = btn.querySelector('.spinner');

    btn.disabled = true;
    btnText.textContent = 'Memproses Kunci...';
    spinner.style.display = 'block';

    try {
      showStatus('regStatus', 'info', 'Menghitung hash kriptografi 3 gambar...');
      const [h1, h2, h3] = await Promise.all([
        hashFileDeterministic(f1),
        hashFileDeterministic(f2),
        hashFileDeterministic(f3)
      ]);

      const rootCommitment = await computeHierarchicalCommitment(
        h1.fieldElement,
        h2.fieldElement,
        h3.fieldElement,
        state.currentSalt.fieldElement
      );

      showStatus('regStatus', 'info', 'Mendaftarkan akun ke server...');
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
          rootCommitment
        })
      });

      const data = await res.json();
      if (!res.ok) {
        showStatus('regStatus', 'error', data.error || 'Gagal mendaftar.');
        return;
      }

      try {
        localStorage.setItem(`zk2fa_salt_${username.toLowerCase()}`, JSON.stringify(state.currentSalt));
      } catch (err) {}

      showStatus('regStatus', 'success', `✓ Akun ${username} berhasil didaftarkan! Mengalihkan ke tab Masuk...`);

      setTimeout(() => {
        showLoginTab();
        document.getElementById('loginUsername').value = username;
        document.getElementById('loginPassword').value = '';
        showStatus('loginStatus', 'info', `Silakan masukkan password dan 3 kunci gambar untuk akun "${username}".`);
      }, 1200);

    } catch (err) {
      showStatus('regStatus', 'error', 'Terjadi kesalahan: ' + err.message);
    } finally {
      btn.disabled = false;
      btnText.textContent = 'Daftarkan Akun';
      spinner.style.display = 'none';
    }
  });

  // LOGIN DENGAN 2FA ZKP
  formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideStatus('loginStatus');

    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    const [f1, f2, f3] = state.loginFiles;

    if (!f1 || !f2 || !f3) {
      showStatus('loginStatus', 'error', 'Pilih ketiga file gambar kunci 2FA Anda.');
      return;
    }

    const btn = document.getElementById('btnLoginSubmit');
    const btnText = btn.querySelector('.btn-text');
    const spinner = btn.querySelector('.spinner');

    btn.disabled = true;
    spinner.style.display = 'block';

    const startTime = performance.now();

    try {
      btnText.textContent = 'Verifikasi Akun...';
      showStatus('loginStatus', 'info', '1/3 Memverifikasi username dan password...');

      const challengeRes = await fetch('/api/auth/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const challengeData = await challengeRes.json();
      if (!challengeRes.ok) {
        showStatus('loginStatus', 'error', challengeData.error || 'Username atau password salah.');
        return;
      }

      const { sessionNonce, rootCommitment } = challengeData;

      let userSalt = state.currentSalt;
      try {
        const cached = localStorage.getItem(`zk2fa_salt_${username.toLowerCase()}`);
        if (cached) userSalt = JSON.parse(cached);
      } catch (err) {}

      btnText.textContent = 'Membuat Bukti ZK...';
      showStatus('loginStatus', 'info', '2/3 Menghasilkan bukti Zero-Knowledge (Groth16)...');

      const [h1, h2, h3] = await Promise.all([
        hashFileDeterministic(f1),
        hashFileDeterministic(f2),
        hashFileDeterministic(f3)
      ]);

      const zkpResult = await generateZkProof({
        h1: h1.fieldElement,
        h2: h2.fieldElement,
        h3: h3.fieldElement,
        salt: userSalt.fieldElement,
        rootCommitment: rootCommitment,
        sessionNonce: sessionNonce
      });

      if (!zkpResult.success) {
        showStatus('loginStatus', 'error', '❌ Kunci gambar salah atau tidak cocok dengan yang didaftarkan! (Constraint ZK ditolak)');
        return;
      }

      btnText.textContent = 'Verifikasi Bukti...';
      showStatus('loginStatus', 'info', '3/3 Memverifikasi bukti di server...');

      const verifyRes = await fetch('/api/auth/verify-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          sessionNonce,
          sessionAuthToken: zkpResult.sessionAuthToken,
          proof: zkpResult.proof
        })
      });

      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) {
        showStatus('loginStatus', 'error', 'Verifikasi server gagal: ' + (verifyData.error || 'Ditolak'));
        return;
      }

      const totalDuration = Math.round(performance.now() - startTime);

      document.getElementById('authCard').style.display = 'none';
      const successCard = document.getElementById('successCard');
      successCard.style.display = 'block';

      document.getElementById('loggedInUser').textContent = `@${username}`;
      document.getElementById('verifyTime').textContent = `${totalDuration} ms`;

    } catch (err) {
      showStatus('loginStatus', 'error', 'Koneksi error: ' + err.message);
    } finally {
      btn.disabled = false;
      btnText.textContent = 'Masuk';
      spinner.style.display = 'none';
    }
  });

  // LOGOUT
  document.getElementById('btnLogout').addEventListener('click', () => {
    document.getElementById('successCard').style.display = 'none';
    document.getElementById('authCard').style.display = 'block';

    document.getElementById('loginPassword').value = '';
    resetSlots('login');
    showLoginTab();
    showStatus('loginStatus', 'info', 'Anda telah keluar. Masukkan kembali password & 3 gambar kunci untuk masuk.');
  });
});
