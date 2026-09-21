// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title EvidenceAnchor
 * @notice Tamper-evident integrity anchoring for forensic evidence hashes.
 *
 * SECURITY MODEL — READ BEFORE USE:
 * ---------------------------------------------------------------
 * This contract is an INTEGRITY MECHANISM, NOT EVIDENCE STORAGE.
 * It stores ONLY:
 *   - a deterministic evidence id (keccak256 of the internal evidence id)
 *   - a SHA-256 integrity digest (32 bytes) of the canonical evidence payload
 *   - the anchor timestamp (block.timestamp)
 *   - the submitter wallet address (msg.sender)
 *
 * It NEVER stores email contents, attachments, PII, passwords, private keys,
 * or any sensitive forensic evidence. Anchoring a hash is NOT encryption and
 * does NOT grant access to the original evidence.
 *
 * Re-anchoring the SAME evidence id with a DIFFERENT digest is allowed and
 * emits a new event (this is used when the custody chain legitimately grows);
 * the original commitment is never silently overwritten in a way that hides
 * history — a new event records every on-chain update.
 */
contract EvidenceAnchor {
    /// Emitted whenever an evidence hash is anchored (first time or updated).
    event EvidenceAnchored(
        bytes32 indexed evidenceId,
        bytes32 indexed digest,
        uint256 timestamp,
        address indexed submitter
    );

    struct Anchor {
        bytes32 digest;
        uint256 timestamp;
        address submitter;
    }

    /// witnessSupplierCommitment -> anchor record. Public mapping (read-only)
    /// exposes only the integrity metadata, never the evidence itself.
    mapping(bytes32 => Anchor) public anchors;

    /// Reject an empty digest (prevents garbage/zero commitments).
    error EmptyDigest();

    /// @notice Anchor (or update) an evidence integrity hash.
    /// @param evidenceId keccak256 hash of the internal evidence id (NOT the
    ///        evidence content; never include content here).
    /// @param digest SHA-256 digest of the canonical evidence payload.
    function anchorEvidence(bytes32 evidenceId, bytes32 digest) external returns (bool) {
        if (digest == bytes32(0)) revert EmptyDigest();

        anchors[evidenceId] = Anchor({
            digest: digest,
            timestamp: block.timestamp,
            submitter: msg.sender
        });

        emit EvidenceAnchored(evidenceId, digest, block.timestamp, msg.sender);
        return true;
    }

    /// @notice Read an evidence anchor (integrity metadata only).
    function getAnchor(bytes32 evidenceId) external view returns (Anchor memory) {
        return anchors[evidenceId];
    }

    /// @notice Convenience check — has this evidence ever been anchored?
    function isAnchored(bytes32 evidenceId) external view returns (bool) {
        return anchors[evidenceId].digest != bytes32(0);
    }
}