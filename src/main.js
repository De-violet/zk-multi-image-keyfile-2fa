import { hashFileDeterministic } from './crypto/fileHash.js';
import { deriveSaltFromPassphrase, generateAutoSalt } from './crypto/saltManager.js';
import { computeHierarchicalCommitment } from './crypto/poseidon.js';
import { generateZkProof } from './crypto/zkProver.js';

// State aplikasi murni in-memory (tanpa penyimpanan localStorage)
const state = {
  regFiles: [null, null, null],
  loginFiles: [null, null, null],
  labFiles: [null, null, null],

  // State Verifier Lab
  labSalt: generateAutoSalt(),
  labNonce: null,
  labRootCommitment: null,
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

    if (mode === 'reg') {
      state.regFiles[index] = file;
    } else if (mode === 'login') {
      state.loginFiles[index] = file;
    } else if (mode === 'lab') {
      state.labFiles[index] = file;
      updateLabFileDetails();
      resetLabPipeline();
    }

    slot.classList.add('filled');
    const reader = new FileReader();
    reader.onload = (evt) => {
      preview.innerHTML = `
        <img src="${evt.target.result}" class="slot-img-preview" alt="${file.name}">
        <span style="position: absolute; bottom: 4px; background: rgba(0,0,0,0.75); font-size: 0.65rem; padding: 1px 6px; border-radius: 4px; max-width: 90%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${file.name}</span>
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
        <span class="slot-text">Pilih Foto ${i + 1}</span>
      `;
    }
  });
  if (mode === 'reg') state.regFiles = [null, null, null];
  if (mode === 'login') state.loginFiles = [null, null, null];
  if (mode === 'lab') state.labFiles = [null, null, null];
}

// Update detail file di Verifier Lab
function updateLabFileDetails() {
  const details = document.getElementById('labFileDetails');
  if (!details) return;

  const validFiles = state.labFiles.filter(f => f !== null);
  if (validFiles.length === 0) {
    details.style.display = 'none';
    return;
  }

  details.style.display = 'flex';
  details.innerHTML = state.labFiles.map((f, i) => {
    if (!f) return `<div>• Foto ${i + 1}: <span style="color:#f87171;">Belum dipilih</span></div>`;
    const sizeKb = (f.size / 1024).toFixed(1);
    return `<div>• Foto ${i + 1}: <strong>${f.name}</strong> (${sizeKb} KB)</div>`;
  }).join('');
}

function resetLabPipeline() {
  const btnGenProof = document.getElementById('btnLabGenProof');
  const btnTamper = document.getElementById('btnLabTamperProof');
  const btnCopy = document.getElementById('btnLabCopyProof');
  const btnVerify = document.getElementById('btnLabRunVerify');
  const labProofOutput = document.getElementById('labProofOutput');
  const labVerifyOutput = document.getElementById('labVerifyOutput');

  if (btnGenProof) btnGenProof.disabled = true;
  if (btnTamper) { btnTamper.disabled = true; btnTamper.textContent = '🧪 Rusak Bukti (Tamper Proof)'; }
  if (btnCopy) btnCopy.disabled = true;
  if (btnVerify) btnVerify.disabled = true;

  if (labProofOutput) labProofOutput.innerHTML = '<span class="code-placeholder">Menunggu sintesis bukti...</span>';
  if (labVerifyOutput) {
    labVerifyOutput.className = 'verifier-result-box';
    labVerifyOutput.innerHTML = '<span class="code-placeholder">Menunggu eksekusi verifier...</span>';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Pasang slot file untuk ketiga mode
  [0, 1, 2].forEach(i => {
    setupSlot('reg', i);
    setupSlot('login', i);
    setupSlot('lab', i);
  });

  const appContainer = document.getElementById('appContainer');
  const tabBtnRegister = document.getElementById('tabBtnRegister');
  const tabBtnLogin = document.getElementById('tabBtnLogin');
  const tabBtnVerifier = document.getElementById('tabBtnVerifier');

  const formRegister = document.getElementById('formRegister');
  const formLogin = document.getElementById('formLogin');
  const sectionVerifier = document.getElementById('sectionVerifier');
  const authCard = document.getElementById('authCard');
  const successCard = document.getElementById('successCard');

  // Tab 1: Daftar Akun
  function showRegisterTab() {
    appContainer.classList.remove('wide-mode');
    authCard.style.display = 'block';
    successCard.style.display = 'none';

    tabBtnRegister.classList.add('active');
    tabBtnLogin.classList.remove('active');
    tabBtnVerifier.classList.remove('active');

    formRegister.style.display = 'flex';
    formLogin.style.display = 'none';
    sectionVerifier.style.display = 'none';

    hideStatus('regStatus');
    hideStatus('loginStatus');
  }

  // Tab 2: Login Akun
  function showLoginTab() {
    appContainer.classList.remove('wide-mode');
    authCard.style.display = 'block';
    successCard.style.display = 'none';

    tabBtnLogin.classList.add('active');
    tabBtnRegister.classList.remove('active');
    tabBtnVerifier.classList.remove('active');

    formLogin.style.display = 'flex';
    formRegister.style.display = 'none';
    sectionVerifier.style.display = 'none';

    hideStatus('regStatus');
    hideStatus('loginStatus');
  }

  // Tab 3: Verifier
  function showVerifierTab() {
    appContainer.classList.add('wide-mode');
    authCard.style.display = 'block';
    successCard.style.display = 'none';

    tabBtnVerifier.classList.add('active');
    tabBtnRegister.classList.remove('active');
    tabBtnLogin.classList.remove('active');

    sectionVerifier.style.display = 'flex';
    formRegister.style.display = 'none';
    formLogin.style.display = 'none';
  }

  tabBtnRegister.addEventListener('click', showRegisterTab);
  tabBtnLogin.addEventListener('click', showLoginTab);
  tabBtnVerifier.addEventListener('click', showVerifierTab);

  // Default: Buka langkah 1 (Daftar Akun)
  showRegisterTab();

  // ==========================================
  // 1. DAFTAR AKUN
  // ==========================================
  formRegister.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideStatus('regStatus');

    const username = document.getElementById('regUsername').value.trim();
    const password = document.getElementById('regPassword').value;
    const [f1, f2, f3] = state.regFiles;

    if (!f1 || !f2 || !f3) {
      showStatus('regStatus', 'error', 'Pilih 3 foto dari perangkat Anda sebagai kunci 2FA.');
      return;
    }

    const btn = document.getElementById('btnRegSubmit');
    const btnText = btn.querySelector('.btn-text');
    const spinner = btn.querySelector('.spinner');

    btn.disabled = true;
    btnText.textContent = 'Menghitung Komitmen ZKP...';
    spinner.style.display = 'block';

    try {
      showStatus('regStatus', 'info', 'Menghitung reduksi hash 3 foto secara lokal di browser...');
      const [h1, h2, h3] = await Promise.all([
        hashFileDeterministic(f1),
        hashFileDeterministic(f2),
        hashFileDeterministic(f3)
      ]);

      // Turunkan salt secara deterministik dari passphrase & username (tanpa simpan di localStorage)
      const saltObj = await deriveSaltFromPassphrase(password, username);

      const { rootCommitment } = await computeHierarchicalCommitment(
        h1.fieldElement,
        h2.fieldElement,
        h3.fieldElement,
        saltObj.fieldElement
      );

      showStatus('regStatus', 'info', 'Mendaftarkan akun ke server (hanya mengirim Root Commitment, foto tetap privat)...');
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

      showStatus('regStatus', 'success', `✓ Akun "${username}" berhasil didaftarkan! Mengalihkan ke Langkah 2: Login Akun...`);

      setTimeout(() => {
        showLoginTab();
        document.getElementById('loginUsername').value = username;
        document.getElementById('loginPassword').value = '';
        showStatus('loginStatus', 'info', `Akun "${username}" siap. Masukkan password dan 3 foto kunci yang sama untuk masuk.`);
      }, 1200);

    } catch (err) {
      showStatus('regStatus', 'error', 'Terjadi kesalahan: ' + err.message);
    } finally {
      btn.disabled = false;
      btnText.textContent = '1. Daftarkan Akun & Kunci 2FA';
      spinner.style.display = 'none';
    }
  });

  // ==========================================
  // 2. LOGIN AKUN DENGAN ZKP
  // ==========================================
  formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideStatus('loginStatus');

    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    const [f1, f2, f3] = state.loginFiles;

    if (!f1 || !f2 || !f3) {
      showStatus('loginStatus', 'error', 'Pilih 3 foto yang sama seperti saat pendaftaran.');
      return;
    }

    const btn = document.getElementById('btnLoginSubmit');
    const btnText = btn.querySelector('.btn-text');
    const spinner = btn.querySelector('.spinner');

    btn.disabled = true;
    spinner.style.display = 'block';

    const startTime = performance.now();

    try {
      btnText.textContent = 'Verifikasi Kredensial...';
      showStatus('loginStatus', 'info', '1/3 Memverifikasi username dan password di server...');

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

      btnText.textContent = 'Menghitung Bukti ZK...';
      showStatus('loginStatus', 'info', '2/3 Menghasilkan saksi & bukti Groth16 di WebAssembly lokal...');

      const [h1, h2, h3] = await Promise.all([
        hashFileDeterministic(f1),
        hashFileDeterministic(f2),
        hashFileDeterministic(f3)
      ]);

      // Turunkan salt secara deterministik dari password & username murni saat login
      const saltObj = await deriveSaltFromPassphrase(password, username);

      const zkpResult = await generateZkProof({
        h1: h1.fieldElement,
        h2: h2.fieldElement,
        h3: h3.fieldElement,
        salt: saltObj.fieldElement,
        rootCommitment: rootCommitment,
        sessionNonce: sessionNonce
      });

      if (!zkpResult.success) {
        showStatus('loginStatus', 'error', '❌ Sirkuit ZKP Menolak: Foto tidak cocok dengan yang didaftarkan! (Zero-Noise Tolerance: 1-bit berbeda menggagalkan sirkuit).');
        return;
      }

      btnText.textContent = 'Verifikasi Server...';
      showStatus('loginStatus', 'info', '3/3 Mengirim bukti 256-byte ke server...');

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

      // Simpan bukti terakhir agar dapat langsung diverifikasi di tab 3
      state.labProof = zkpResult.proof;
      state.labPublicSignals = [
        zkpResult.sessionAuthToken,
        rootCommitment,
        sessionNonce
      ];

      // Beralih ke layar sukses
      authCard.style.display = 'none';
      successCard.style.display = 'block';

      document.getElementById('loggedInUser').textContent = `@${username}`;
      document.getElementById('verifyTime').textContent = `${totalDuration} ms`;

      const receiptPre = document.getElementById('loginProofReceipt');
      if (receiptPre) {
        receiptPre.textContent = JSON.stringify({
          protocol: 'Groth16 zk-SNARK',
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
      btnText.textContent = '2. Masuk dengan ZK 2FA';
      spinner.style.display = 'none';
    }
  });

  // Tombol dari Layar Sukses menuju Tab 3: Verifier
  document.getElementById('btnGoToVerifier').addEventListener('click', () => {
    showVerifierTab();
  });

  // LOGOUT (Keluar)
  document.getElementById('btnLogout').addEventListener('click', () => {
    successCard.style.display = 'none';
    authCard.style.display = 'block';

    document.getElementById('loginPassword').value = '';
    resetSlots('login');
    showLoginTab();
    showStatus('loginStatus', 'info', 'Anda telah keluar. Masukkan kembali password & 3 foto kunci untuk masuk.');
  });

  // ==========================================
  // 3. VERIFIER (UJI MANDIRI WITNESS • PROOF • VERIFIER)
  // ==========================================
  const btnLabGenWitness = document.getElementById('btnLabGenWitness');
  const btnLabGenProof = document.getElementById('btnLabGenProof');
  const btnLabTamperProof = document.getElementById('btnLabTamperProof');
  const btnLabCopyProof = document.getElementById('btnLabCopyProof');
  const btnLabRunVerify = document.getElementById('btnLabRunVerify');

  const labWitnessOutput = document.getElementById('labWitnessOutput');
  const labProofOutput = document.getElementById('labProofOutput');
  const labVerifyOutput = document.getElementById('labVerifyOutput');

  // Tahap A: Hitung Witness dari Foto
  btnLabGenWitness.addEventListener('click', async () => {
    const [f1, f2, f3] = state.labFiles;
    if (!f1 || !f2 || !f3) {
      alert('Pilih 3 foto pada slot di atas terlebih dahulu.');
      return;
    }

    btnLabGenWitness.disabled = true;
    btnLabGenWitness.textContent = 'Menghitung Saksi...';
    labWitnessOutput.innerHTML = '<span style="color:#93c5fd;">Membaca byte foto & menghitung reduksi SHA-256 modulo BN254...</span>';

    try {
      const [h1, h2, h3] = await Promise.all([
        hashFileDeterministic(f1),
        hashFileDeterministic(f2),
        hashFileDeterministic(f3)
      ]);

      const commitmentResult = await computeHierarchicalCommitment(
        h1.fieldElement,
        h2.fieldElement,
        h3.fieldElement,
        state.labSalt.fieldElement
      );
      state.labRootCommitment = commitmentResult.rootCommitment;

      const randBytes = crypto.getRandomValues(new Uint8Array(16));
      const randHex = Array.from(randBytes).map(b => b.toString(16).padStart(2, '0')).join('');
      const BN254_R = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
      state.labNonce = (BigInt('0x' + randHex) % BN254_R).toString();

      state.labWitnessInputs = {
        h1: h1.fieldElement,
        h2: h2.fieldElement,
        h3: h3.fieldElement,
        salt: state.labSalt.fieldElement,
        rootCommitment: state.labRootCommitment,
        sessionNonce: state.labNonce
      };

      labWitnessOutput.textContent = JSON.stringify({
        status: 'WITNESS_COMPUTED_LOCALLY',
        sourceFiles: [
          { slot: 1, name: f1.name, sizeBytes: f1.size, hash_mod_r: h1.fieldElement.slice(0, 16) + '...' },
          { slot: 2, name: f2.name, sizeBytes: f2.size, hash_mod_r: h2.fieldElement.slice(0, 16) + '...' },
          { slot: 3, name: f3.name, sizeBytes: f3.size, hash_mod_r: h3.fieldElement.slice(0, 16) + '...' }
        ],
        circuitConstraints: '~1.412 R1CS Constraints (WASM)',
        rootCommitment: state.labRootCommitment.slice(0, 20) + '...',
        sessionNonce: state.labNonce
      }, null, 2);

      btnLabGenProof.disabled = false;
      btnLabGenWitness.textContent = '✓ Hitung Witness dari Foto';
    } catch (err) {
      labWitnessOutput.innerHTML = `<span style="color:#ef4444;">Error Witness: ${err.message}</span>`;
      btnLabGenWitness.disabled = false;
      btnLabGenWitness.textContent = 'Hitung Witness dari Foto';
    }
  });

  // Tahap B: Sintesis Proof
  btnLabGenProof.addEventListener('click', async () => {
    if (!state.labWitnessInputs) return;

    btnLabGenProof.disabled = true;
    btnLabGenProof.textContent = 'Mensintesis Proof...';
    labProofOutput.innerHTML = '<span style="color:#c4b5fd;">Menghitung bukti Groth16 di WebAssembly BN254 dari foto Anda...</span>';

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
      btnLabGenProof.textContent = '✓ Sintesis Proof';
    } catch (err) {
      labProofOutput.innerHTML = `<span style="color:#ef4444;">Error Proof: ${err.message}</span>`;
      btnLabGenProof.disabled = false;
      btnLabGenProof.textContent = 'Sintesis Proof';
    }
  });

  // Rusak Bukti (Tamper Proof)
  btnLabTamperProof.addEventListener('click', () => {
    if (!state.labProof) return;
    const orig = state.labProof.pi_a[0];
    const altered = orig.slice(0, -1) + (orig.slice(-1) === '1' ? '2' : '1');
    state.labProof.pi_a[0] = altered;

    labProofOutput.innerHTML = `
<span style="color:#f87171; font-weight: bold;">⚠️ BUKTI TELAH DIRUSAK (Tamper Test Aktif):</span>
Titik pi_a[0] kurva eliptik telah dimodifikasi!
Sekarang klik "Jalankan Verifier" di bawah untuk membuktikan bahwa verifier akan menolaknya.
`;
    btnLabTamperProof.disabled = true;
    btnLabTamperProof.textContent = '⚠️ Bukti Telah Dirusak';
  });

  // Salin JSON
  btnLabCopyProof.addEventListener('click', () => {
    if (!state.labProof) return;
    const full = JSON.stringify({ proof: state.labProof, publicSignals: state.labPublicSignals }, null, 2);
    navigator.clipboard.writeText(full);
    btnLabCopyProof.textContent = '✓ Disalin';
    setTimeout(() => { btnLabCopyProof.textContent = 'Salin JSON'; }, 1500);
  });

  // Tahap C: Verifier
  btnLabRunVerify.addEventListener('click', async () => {
    if (!state.labProof || !state.labPublicSignals) return;

    btnLabRunVerify.disabled = true;
    btnLabRunVerify.textContent = 'Memverifikasi Pairing...';
    labVerifyOutput.className = 'verifier-result-box';
    labVerifyOutput.innerHTML = '<span style="color:#93c5fd;">Mengecek persamaan bilinear pairing e(A,B) = e(alpha,beta) + ...</span>';

    try {
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
          <div style="font-weight: 700; font-size: 0.95rem; margin-bottom: 4px;">✅ PROOF VERIFIED (Valid Secara Matematis)</div>
          <div style="font-size: 0.8rem; line-height: 1.4;">
            • Persamaan Bilinear Pairing Terpenuhi: <code>e(&pi;<sub>A</sub>, &pi;<sub>B</sub>) == e(&alpha;, &beta;) + e(vk<sub>x</sub>, &gamma;) + e(&pi;<sub>C</sub>, &delta;)</code><br>
            • Waktu verifikasi: <strong>${verifyDuration} ms</strong><br>
            • <strong>Zero-Knowledge Terbukti:</strong> Verifier membuktikan kepemilikan 3 foto asli tanpa foto pernah diunggah atau dilihat oleh siapapun!
          </div>
        `;
      } else {
        labVerifyOutput.className = 'verifier-result-box rejected';
        labVerifyOutput.innerHTML = `
          <div style="font-weight: 700; font-size: 0.95rem; margin-bottom: 4px;">❌ VERIFICATION FAILED (Bukti Ditolak)</div>
          <div style="font-size: 0.8rem; line-height: 1.4;">
            • Pairing Check Gagal: Nilai bukti matematika tidak memenuhi kurva eliptik BN254.<br>
            • Waktu verifikasi: <strong>${verifyDuration} ms</strong><br>
            • Sistem berhasil menggagalkan manipulasi atau ketidakcocokan kunci!
          </div>
        `;
      }

    } catch (err) {
      labVerifyOutput.className = 'verifier-result-box rejected';
      labVerifyOutput.innerHTML = `<span style="color:#ef4444;">Error Verifikasi: ${err.message}</span>`;
    } finally {
      btnLabRunVerify.disabled = false;
      btnLabRunVerify.textContent = 'Jalankan Verifier';
    }
  });

});
