import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ethers } from 'ethers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');

async function getArtifact(contractPath, contractName) {
  const artifactFile = path.join(ROOT_DIR, 'artifacts/contracts', contractPath, `${contractName}.json`);
  if (fs.existsSync(artifactFile)) {
    const raw = JSON.parse(fs.readFileSync(artifactFile, 'utf8'));
    return { abi: raw.abi, bytecode: raw.bytecode };
  }
  // Fallback: compile on-the-fly with solc
  const solc = (await import('solc')).default;
  const verifierSource = fs.readFileSync(path.join(ROOT_DIR, 'contracts/MultiImageVerifier.sol'), 'utf8');
  const vaultSource = fs.readFileSync(path.join(ROOT_DIR, 'contracts/MultiImage2FAVault.sol'), 'utf8');
  const input = {
    language: 'Solidity',
    sources: {
      'MultiImageVerifier.sol': { content: verifierSource },
      'MultiImage2FAVault.sol': { content: vaultSource }
    },
    settings: {
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } }
    }
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const contract = output.contracts[contractPath]?.[contractName];
  if (!contract) {
    throw new Error(`Gagal mengompilasi ${contractName}: ${JSON.stringify(output.errors || [])}`);
  }
  return { abi: contract.abi, bytecode: '0x' + contract.evm.bytecode.object };
}

async function main() {
  const rpcUrl = process.env.RPC_URL || 'http://127.0.0.1:8545';
  console.log(`Menghubungkan ke EVM provider: ${rpcUrl}`);

  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);

  let signer;
  if (process.env.PRIVATE_KEY) {
    signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  } else {
    try {
      const accounts = await provider.listAccounts();
      if (!accounts.length) {
        throw new Error('Tidak ada akun tersedia di node EVM lokal.');
      }
      signer = provider.getSigner(accounts[0]);
    } catch (err) {
      console.error(`Gagal menghubungkan ke RPC (${rpcUrl}):`, err.message);
      console.error('Pastikan node lokal (Hardhat Network/Anvil) berjalan di port 8545.');
      process.exit(1);
    }
  }

  const signerAddress = await signer.getAddress();
  console.log(`Deployer address: ${signerAddress}`);

  console.log('1. Deploying MultiImageVerifier (Groth16Verifier)...');
  const verifierArtifact = await getArtifact('MultiImageVerifier.sol', 'Groth16Verifier');
  const verifierFactory = new ethers.ContractFactory(verifierArtifact.abi, verifierArtifact.bytecode, signer);
  const verifier = await verifierFactory.deploy();
  await verifier.deployed();
  console.log(`-> MultiImageVerifier deployed at: ${verifier.address}`);

  console.log('2. Deploying MultiImage2FAVault...');
  const vaultArtifact = await getArtifact('MultiImage2FAVault.sol', 'MultiImage2FAVault');
  const vaultFactory = new ethers.ContractFactory(vaultArtifact.abi, vaultArtifact.bytecode, signer);
  const vault = await vaultFactory.deploy(verifier.address);
  await vault.deployed();
  console.log(`-> MultiImage2FAVault deployed at: ${vault.address}`);

  const deployedInfo = {
    network: (await provider.getNetwork()).name,
    chainId: (await provider.getNetwork()).chainId,
    verifierAddress: verifier.address,
    vaultAddress: vault.address,
    deployedAt: new Date().toISOString()
  };

  const outputPath = path.join(ROOT_DIR, 'contracts/deployed-addresses.json');
  fs.writeFileSync(outputPath, JSON.stringify(deployedInfo, null, 2));
  console.log(`Alamat kontrak tersimpan di: ${outputPath}`);

  // Perbarui .env jika ada
  const envPath = path.join(ROOT_DIR, '.env');
  if (fs.existsSync(envPath)) {
    let envContent = fs.readFileSync(envPath, 'utf8');
    envContent = envContent.replace(/VERIFIER_CONTRACT_ADDRESS=.*/g, `VERIFIER_CONTRACT_ADDRESS=${verifier.address}`);
    envContent = envContent.replace(/VAULT_CONTRACT_ADDRESS=.*/g, `VAULT_CONTRACT_ADDRESS=${vault.address}`);
    fs.writeFileSync(envPath, envContent);
    console.log('File .env berhasil diperbarui dengan alamat kontrak baru.');
  }
}

main().catch((err) => {
  console.error('Deployment error:', err);
  process.exit(1);
});
