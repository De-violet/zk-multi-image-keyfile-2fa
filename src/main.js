import { hashFileDeterministic } from './crypto/fileHash.js';
import { generateAutoSalt } from './crypto/saltManager.js';
import { computeHierarchicalCommitment, computeSessionAuthToken } from './crypto/poseidon.js';
import { generateZkProof } from './crypto/zkProver.js';

// State aplikasi
const state = {
  loginFiles: [null, null, null],
  regFiles: [null, null, null],
  currentSalt: generateAutoSalt(),
  
  // State untuk ZKP Test Lab
  labFiles: [null, null, null],
  labSalt: generateAutoSalt(),
  labNonce: '1234567890abcdef',
  labRootCommitment: null,
  labAuthToken: null,
  labWitnessInputs: null,
  labProof: null,
  labPublicSignals: null,
  labVKey: null
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

function resetSlots(mode) {
  [0, 1, 2].forEach(i => {
    const slot = document.getElementById(`${mode}Slot${index + 1}`);
    const input = document.getElementById(`${mode}File${index + 1}`);
    const preview = document.getElementById(`${mode}Preview${index + 1}`);

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

// Generate in-memory file sampel untuk ZKP Lab
function generateLabSampleFiles() {
  const colors = ['#2563eb', '#059669', '#d97706'];
  return colors.map((color, i) => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#ffffff';
    ctx.font = '10px sans-serif';
    ctx.fillText(`LAB #${i + 1}`, 14, 36);

    const binStr = atob(canvas.toDataURL().split(',')[1]);
    const len = binStr.length;
    const arr = new Uint8Array(len);
    for (let j = 0; j < len; j++) arr[j] = binStr.charCodeAt(j);
    return new File([arr], `lab_sample_${i + 1}.png`, { type: 'image/png' });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  [0, 1, 2].forEach(i => {
    setupSlot('login', i);
    setupSlot('reg', i);
  });

  const appContainer = document.getElementById('appContainer');
  const tabBtnLogin = document.getElementById('tabBtnLogin');
  const tabBtnRegister = document.getElementById('tabBtnRegister');
  const tabBtnZkLab = document.getElementById('tabBtnZkLab');
  const formLogin = document.getElementById('formLogin');
  const formRegister = document.getElementById('formRegister');
  const sectionZkLab = document.getElementById('sectionZkLab');

  function showLoginTab() {
    appContainer.classList.remove('wide-mode');
    tabBtnLogin.classList.add('active');
    tabBtnRegister.classList.remove('active');
    tabBtnZkLab.classList.remove('active');
    formLogin.style.display = 'flex';
    formRegister.style.display = 'none';
    sectionZkLab.style.display = 'none';
    hideStatus('loginStatus');
    hideStatus('regStatus');
  }

  function showRegisterTab() {
    appContainer.classList.remove('wide-mode');
    tabBtnRegister.classList.add('active');
    tabBtnLogin.classList.remove('active');
    tabBtnZkLab.classList.remove('active');
    formRegister.style.display = 'flex';
    formLogin.style.display = 'none';
    sectionZkLab.style.display = 'none';
    hideStatus('loginStatus');
    hideStatus('regStatus');
  }

  function showZkLabTab() {
    appContainer.classList.add('wide-mode');
    tabBtnZkLab.classList.add('active');
    tabBtnLogin.classList.remove('active');
    tabBtnRegister.classList.remove('active');
    sectionZkLab.style.display = 'flex';
    formLogin.style.display = 'none';
    formRegister.style.display = 'none';
  }

  tabBtnLogin.addEventListener('click', showLoginTab);
  tabBtnRegister.addEventListener('click', showRegisterTab);
  tabBtnZkLab.addEventListener('click', showZkLabTab);

  document.getElementById('btnGenSamples').addEventListener('click', createSampleKeys);

  // ==========================================
  // REGISTRASI
  // ==========================================
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

  // ==========================================
  // LOGIN DENGAN 2FA ZKP
  // ==========================================
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
      showStatus('loginStatus', 'info', '1/3 Memverifikasi kredensial pengguna...');

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
      showStatus('loginStatus', 'info', '2/3 Menghasilkan saksi & bukti Zero-Knowledge (Groth16)...');

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
        showStatus('loginStatus', 'error', '❌ Kunci gambar salah atau tidak cocok dengan pendaftaran! (Circom Constraint Mismatch)');
        return;
      }

      btnText.textContent = 'Verifikasi Server...';
      showStatus('loginStatus', 'info', '3/3 Memverifikasi bukti kriptografi di server...');

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

      // Tampilkan Halaman Sukses
      document.getElementById('authCard').style.display = 'none';
      const successCard = document.getElementById('successCard');
      successCard.style.display = 'block';

      document.getElementById('loggedInUser').textContent = `@${username}`;
      document.getElementById('verifyTime').textContent = `${totalDuration} ms`;

      // Simpan receipt bukti kriptografi
      const receiptPre = document.getElementById('loginProofReceipt');
      if (receiptPre) {
        receiptPre.textContent = JSON.stringify({
          protocol: 'Groth16 (zk-SNARK)',
          curve: 'BN254 (alt_bn128)',
          pi_a: zkpResult.proof.pi_a.slice(0, 2),
          pi_b: zkpResult.proof.pi_b.slice(0, 2),
          pi_c: zkpResult.proof.pi_c.slice(0, 2),
          publicSignals: {
            sessionAuthToken: zkpResult.sessionAuthToken,
            rootCommitment: rootCommitment,
            sessionNonce: sessionNonce
          },
          verificationDuration: `${verifyData.verificationDurationMs || 35} ms`,
          verified: true
        }, null, 2);
      }

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

  // ==========================================
  // ZKP TEST LAB (WITNESS • PROOF • VERIFIER)
  // ==========================================
  const btnLabUseSamples = document.getElementById('btnLabUseSamples');
  const btnLabGenWitness = document.getElementById('btnLabGenWitness');
  const btnLabGenProof = document.getElementById('btnLabGenProof');
  const btnLabTamperProof = document.getElementById('btnLabTamperProof');
  const btnLabCopyProof = document.getElementById('btnLabCopyProof');
  const btnLabRunVerify = document.getElementById('btnLabRunVerify');

  const labWitnessOutput = document.getElementById('labWitnessOutput');
  const labProofOutput = document.getElementById('labProofOutput');
  const labVerifyOutput = document.getElementById('labVerifyOutput');

  btnLabUseSamples.addEventListener('click', () => {
    state.labFiles = generateLabSampleFiles();
    btnLabUseSamples.textContent = '✓ 3 Kunci Sampel Siap';
    labWitnessOutput.innerHTML = '<span style="color:#34d399;">✓ 3 Gambar kunci sampel dimuat di memory. Klik "1. Hitung Witness".</span>';
  });

  // TAHAP 1: WITNESS
  btnLabGenWitness.addEventListener('click', async () => {
    btnLabGenWitness.disabled = true;
    btnLabGenWitness.textContent = 'Menghitung Saksi...';
    labWitnessOutput.innerHTML = '<span style="color:#93c5fd;">Menghitung reduksi SHA-256 dan Poseidon commitments...</span>';

    try {
      if (!state.labFiles[0]) {
        state.labFiles = generateLabSampleFiles();
      }

      const [h1, h2, h3] = await Promise.all([
        hashFileDeterministic(state.labFiles[0]),
        hashFileDeterministic(state.labFiles[1]),
        hashFileDeterministic(state.labFiles[2])
      ]);

      state.labRootCommitment = await computeHierarchicalCommitment(
        h1.fieldElement,
        h2.fieldElement,
        h3.fieldElement,
        state.labSalt.fieldElement
      );

      state.labNonce = '0x' + Array.from(crypto.getRandomValues(new Uint8Array(16)))
        .map(b => b.toString(16).padStart(2, '0')).join('');

      state.labWitnessInputs = {
        h1: h1.fieldElement,
        h2: h2.fieldElement,
        h3: h3.fieldElement,
        salt: state.labSalt.fieldElement,
        rootCommitment: state.labRootCommitment,
        sessionNonce: state.labNonce
      };

      labWitnessOutput.textContent = JSON.stringify({
        status: 'WITNESS_COMPUTED',
        circuitConstraints: '~1.412 R1CS Constraints',
        privateWitnessSignals: {
          image_h1_mod_r: h1.fieldElement.slice(0, 18) + '...',
          image_h2_mod_r: h2.fieldElement.slice(0, 18) + '...',
          image_h3_mod_r: h3.fieldElement.slice(0, 18) + '...',
          salt_secret: state.labSalt.fieldElement.slice(0, 18) + '...'
        },
        publicSignalsToProve: {
          rootCommitment: state.labRootCommitment.slice(0, 18) + '...',
          sessionNonce: state.labNonce
        }
      }, null, 2);

      btnLabGenProof.disabled = false;
      btnLabGenWitness.textContent = '✓ 1. Hitung Witness';
    } catch (err) {
      labWitnessOutput.innerHTML = `<span style="color:#ef4444;">Error Witness: ${err.message}</span>`;
      btnLabGenWitness.disabled = false;
      btnLabGenWitness.textContent = '1. Hitung Witness';
    }
  });

  // TAHAP 2: PROOF
  btnLabGenProof.addEventListener('click', async () => {
    if (!state.labWitnessInputs) return;

    btnLabGenProof.disabled = true;
    btnLabGenProof.textContent = 'Mensintesis Proof...';
    labProofOutput.innerHTML = '<span style="color:#c4b5fd;">Mengeksekusi Groth16 Prover di WebAssembly BN254...</span>';

    try {
      const res = await generateZkProof(state.labWitnessInputs);
      if (!res.success) throw new Error(res.error);

      state.labProof = res.proof;
      state.labPublicSignals = [
        res.sessionAuthToken,
        state.labRootCommitment,
        state.labNonce
      ];

      labProofOutput.textContent = JSON.stringify({
        protocol: 'Groth16 zk-SNARK',
        curve: 'BN254 (alt_bn128)',
        proofSynthesisDuration: `${res.durationMs} ms`,
        pi_a: [state.labProof.pi_a[0].slice(0, 14) + '...', state.labProof.pi_a[1].slice(0, 14) + '...'],
        pi_b: [
          [state.labProof.pi_b[0][0].slice(0, 12) + '...', state.labProof.pi_b[0][1].slice(0, 12) + '...'],
          [state.labProof.pi_b[1][0].slice(0, 12) + '...', state.labProof.pi_b[1][1].slice(0, 12) + '...']
        ],
        pi_c: [state.labProof.pi_c[0].slice(0, 14) + '...', state.labProof.pi_c[1].slice(0, 14) + '...'],
        publicSignalsCount: state.labPublicSignals.length
      }, null, 2);

      btnLabRunVerify.disabled = false;
      btnLabTamperProof.disabled = false;
      btnLabCopyProof.disabled = false;
      btnLabGenProof.textContent = '✓ 2. Sintesis Proof';
    } catch (err) {
      labProofOutput.innerHTML = `<span style="color:#ef4444;">Error Proof: ${err.message}</span>`;
      btnLabGenProof.disabled = false;
      btnLabGenProof.textContent = '2. Sintesis Proof';
    }
  });

  // TAMPER PROOF
  btnLabTamperProof.addEventListener('click', () => {
    if (!state.labProof) return;
    // Modifikasi 1 karakter titik pi_a
    const orig = state.labProof.pi_a[0];
    const altered = orig.slice(0, -1) + (orig.slice(-1) === '1' ? '2' : '1');
    state.labProof.pi_a[0] = altered;

    labProofOutput.innerHTML = `
<span style="color:#f87171; font-weight: bold;">⚠️ BUKTI TELAH DIMODIFIKASI (1-Bit Tamper Test):</span>
Titik pi_a[0] diubah nilainya!
Sekarang klik "3. Jalankan Verifier" untuk membuktikan verifier menolak.
`;
    btnLabTamperProof.disabled = true;
    btnLabTamperProof.textContent = '⚠️ Bukti Dirusak';
  });

  // COPY PROOF
  btnLabCopyProof.addEventListener('click', () => {
    if (!state.labProof) return;
    const full = JSON.stringify({ proof: state.labProof, publicSignals: state.labPublicSignals }, null, 2);
    navigator.clipboard.writeText(full);
    btnLabCopyProof.textContent = '✓ Disalin';
    setTimeout(() => { btnLabCopyProof.textContent = 'Salin JSON'; }, 1500);
  });

  // TAHAP 3: VERIFIER
  btnLabRunVerify.addEventListener('click', async () => {
    if (!state.labProof || !state.labPublicSignals) return;

    btnLabRunVerify.disabled = true;
    btnLabRunVerify.textContent = 'Memverifikasi Pairing...';
    labVerifyOutput.className = 'verifier-result-box';
    labVerifyOutput.innerHTML = '<span style="color:#93c5fd;">Menghitung Elliptic Curve Bilinear Pairing e(A,B) = e(alpha,beta) + ...</span>';

    try {
      // Ambil verification key jika belum di-cache
      if (!state.labVKey) {
        const vKeyRes = await fetch('/public/zk/verification_key.json');
        state.labVKey = await vKeyRes.json();
      }

      const verifyStart = performance.now();
      const isValid = await window.snarkjs.groth16.verify(
        state.labVKey,
        state.labPublicSignals,
        state.labProof
      );
      const verifyDuration = Math.round(performance.now() - verifyStart);

      if (isValid) {
        labVerifyOutput.className = 'verifier-result-box verified';
        labVerifyOutput.innerHTML = `
          <div style="font-weight: 700; font-size: 0.95rem; margin-bottom: 4px;">✅ PROOF VERIFIED (Valid Kriptografis)</div>
          <div style="font-size: 0.8rem; line-height: 1.4;">
            • Persamaan Bilinear Pairing Lolos: <code>e(&pi;<sub>A</sub>, &pi;<sub>B</sub>) == e(&alpha;, &beta;) + e(vk<sub>x</sub>, &gamma;) + e(&pi;<sub>C</sub>, &delta;)</code><br>
            • Waktu verifikasi: <strong>${verifyDuration} ms</strong><br>
            • <strong>Zero-Knowledge Terbukti:</strong> Verifier memvalidasi kepemilikan 3 kunci gambar tanpa pernah mengetahui konten/gambar aslinya!
          </div>
        `;
      } else {
        labVerifyOutput.className = 'verifier-result-box rejected';
        labVerifyOutput.innerHTML = `
          <div style="font-weight: 700; font-size: 0.95rem; margin-bottom: 4px;">❌ VERIFICATION FAILED (Bukti Ditolak)</div>
          <div style="font-size: 0.8rem; line-height: 1.4;">
            • Pairing Check Gagal: Nilai bukti atau sinyal publik tidak memenuhi kurva BN254.<br>
            • Waktu verifikasi: <strong>${verifyDuration} ms</strong><br>
            • Sistem berhasil menggagalkan manipulasi data!
          </div>
        `;
      }

    } catch (err) {
      labVerifyOutput.className = 'verifier-result-box rejected';
      labVerifyOutput.innerHTML = `<span style="color:#ef4444;">Error Verifikasi: ${err.message}</span>`;
    } finally {
      btnLabRunVerify.disabled = false;
      btnLabRunVerify.textContent = '3. Jalankan Verifier';
    }
  });

});
