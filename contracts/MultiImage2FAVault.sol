// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @dev Interface untuk MultiImageVerifier yang digenerate oleh snarkjs
 */
interface IMultiImageVerifier {
    function verifyProof(
        uint[2] calldata a,
        uint[2][2] calldata b,
        uint[2] calldata c,
        uint[3] calldata input
    ) external view returns (bool r);
}

/**
 * @title MultiImage2FAVault
 * @notice Smart contract percontohan untuk otentikasi on-chain berbasis Zero-Knowledge Multi-Image Keyfile 2FA.
 * Membuktikan kesiapan arsitektur sistem untuk domain Web3 / EVM.
 */
contract MultiImage2FAVault {
    IMultiImageVerifier public immutable verifier;

    // Mapping user address => registered rootCommitment
    mapping(address => uint256) public userCommitments;
    
    // Mapping user address => current session nonce
    mapping(address => uint256) public userNonces;

    // Mapping user address => timestamp saat nonce diterbitkan
    mapping(address => uint256) public userNonceTimestamps;

    // Masa berlaku nonce on-chain (5 menit)
    uint256 public constant NONCE_TTL = 300;

    // Mapping nonce hash => status hangus (single-use anti-replay)
    mapping(bytes32 => bool) public burnedNonces;

    event CommitmentRegistered(address indexed user, uint256 commitment);
    event NonceIssued(address indexed user, uint256 nonce, uint256 expiresAt);
    event TwoFactorVerified(address indexed user, uint256 sessionAuthToken, uint256 nonce);

    constructor(address _verifierAddress) {
        verifier = IMultiImageVerifier(_verifierAddress);
    }

    /**
     * @notice Registrasi Root Commitment (Faktor 2) pengguna
     */
    function registerCommitment(uint256 _commitment) external {
        require(_commitment != 0, "Commitment cannot be zero");
        userCommitments[msg.sender] = _commitment;
        emit CommitmentRegistered(msg.sender, _commitment);
    }

    /**
     * @notice Terbitkan challenge nonce on-chain untuk user
     */
    function requestChallengeNonce() external returns (uint256) {
        uint256 newNonce = uint256(keccak256(abi.encodePacked(msg.sender, block.timestamp, block.prevrandao, userNonces[msg.sender])));
        // Reduksi modulo BN254 scalar field
        newNonce = newNonce % 21888242871839275222246405745257275088548364400416034343698204186575808495617;
        userNonces[msg.sender] = newNonce;
        userNonceTimestamps[msg.sender] = block.timestamp;
        emit NonceIssued(msg.sender, newNonce, block.timestamp + NONCE_TTL);
        return newNonce;
    }

    /**
     * @notice Verifikasi Zero-Knowledge Proof untuk otentikasi faktor kedua
     * @param a Proof Groth16 parameter A
     * @param b Proof Groth16 parameter B
     * @param c Proof Groth16 parameter C
     * @param sessionAuthToken Token otentikasi sesi yang terikat Poseidon(masterKey, sessionNonce)
     */
    function verify2FA(
        uint[2] calldata a,
        uint[2][2] calldata b,
        uint[2] calldata c,
        uint256 sessionAuthToken
    ) external returns (bool) {
        uint256 commitment = userCommitments[msg.sender];
        require(commitment != 0, "User commitment not registered");

        uint256 currentNonce = userNonces[msg.sender];
        require(currentNonce != 0, "No active challenge nonce");

        // Cek kedaluwarsa nonce
        require(block.timestamp <= userNonceTimestamps[msg.sender] + NONCE_TTL, "Challenge nonce expired (> 5 minutes)");

        bytes32 nonceKey = keccak256(abi.encodePacked(msg.sender, currentNonce));
        require(!burnedNonces[nonceKey], "Nonce already burned (anti-replay)");

        // Tandai nonce sebagai hangus seketika
        burnedNonces[nonceKey] = true;
        userNonces[msg.sender] = 0;
        userNonceTimestamps[msg.sender] = 0;

        // Susun sinyal publik sesuai urutan sirkuit Circom:
        // [sessionAuthToken, rootCommitment, sessionNonce]
        uint[3] memory publicSignals;
        publicSignals[0] = sessionAuthToken;
        publicSignals[1] = commitment;
        publicSignals[2] = currentNonce;

        bool isValid = verifier.verifyProof(a, b, c, publicSignals);
        require(isValid, "Invalid Zero-Knowledge Proof");

        emit TwoFactorVerified(msg.sender, sessionAuthToken, currentNonce);
        return true;
    }
}
