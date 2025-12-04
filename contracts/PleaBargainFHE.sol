// PleaBargainFHE.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract PleaBargainFHE is SepoliaConfig {
    struct EncryptedCaseData {
        uint256 id;
        euint32 encryptedDefendantInfo;
        euint32 encryptedCharges;
        euint32 encryptedSentence;
        uint256 timestamp;
    }
    
    struct FairnessAnalysis {
        euint32 encryptedBiasScore;
        euint32 encryptedDisparityIndex;
        euint32 encryptedReformImpact;
    }

    struct DecryptedCaseData {
        string defendantInfo;
        string charges;
        string sentence;
        bool isRevealed;
    }

    uint256 public caseCount;
    mapping(uint256 => EncryptedCaseData) public encryptedCases;
    mapping(uint256 => DecryptedCaseData) public decryptedCases;
    mapping(uint256 => FairnessAnalysis) public fairnessAnalyses;
    
    mapping(uint256 => uint256) private requestToCaseId;
    
    event CaseSubmitted(uint256 indexed id, uint256 timestamp);
    event AnalysisRequested(uint256 indexed caseId);
    event AnalysisCompleted(uint256 indexed caseId);
    event DecryptionRequested(uint256 indexed caseId);
    event CaseDecrypted(uint256 indexed caseId);
    
    modifier onlyAuthorized(uint256 caseId) {
        _;
    }
    
    function submitEncryptedCase(
        euint32 encryptedDefendantInfo,
        euint32 encryptedCharges,
        euint32 encryptedSentence
    ) public {
        caseCount += 1;
        uint256 newId = caseCount;
        
        encryptedCases[newId] = EncryptedCaseData({
            id: newId,
            encryptedDefendantInfo: encryptedDefendantInfo,
            encryptedCharges: encryptedCharges,
            encryptedSentence: encryptedSentence,
            timestamp: block.timestamp
        });
        
        decryptedCases[newId] = DecryptedCaseData({
            defendantInfo: "",
            charges: "",
            sentence: "",
            isRevealed: false
        });
        
        emit CaseSubmitted(newId, block.timestamp);
    }
    
    function requestCaseDecryption(uint256 caseId) public onlyAuthorized(caseId) {
        EncryptedCaseData storage caseData = encryptedCases[caseId];
        require(!decryptedCases[caseId].isRevealed, "Already decrypted");
        
        bytes32[] memory ciphertexts = new bytes32[](3);
        ciphertexts[0] = FHE.toBytes32(caseData.encryptedDefendantInfo);
        ciphertexts[1] = FHE.toBytes32(caseData.encryptedCharges);
        ciphertexts[2] = FHE.toBytes32(caseData.encryptedSentence);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptCase.selector);
        requestToCaseId[reqId] = caseId;
        
        emit DecryptionRequested(caseId);
    }
    
    function decryptCase(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 caseId = requestToCaseId[requestId];
        require(caseId != 0, "Invalid request");
        
        EncryptedCaseData storage eCase = encryptedCases[caseId];
        DecryptedCaseData storage dCase = decryptedCases[caseId];
        require(!dCase.isRevealed, "Already decrypted");
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        string[] memory results = abi.decode(cleartexts, (string[]));
        
        dCase.defendantInfo = results[0];
        dCase.charges = results[1];
        dCase.sentence = results[2];
        dCase.isRevealed = true;
        
        emit CaseDecrypted(caseId);
    }
    
    function requestFairnessAnalysis(uint256 caseId) public onlyAuthorized(caseId) {
        require(encryptedCases[caseId].id != 0, "Case not found");
        
        emit AnalysisRequested(caseId);
    }
    
    function submitAnalysisResults(
        uint256 caseId,
        euint32 encryptedBiasScore,
        euint32 encryptedDisparityIndex,
        euint32 encryptedReformImpact
    ) public {
        fairnessAnalyses[caseId] = FairnessAnalysis({
            encryptedBiasScore: encryptedBiasScore,
            encryptedDisparityIndex: encryptedDisparityIndex,
            encryptedReformImpact: encryptedReformImpact
        });
        
        emit AnalysisCompleted(caseId);
    }
    
    function requestResultDecryption(uint256 caseId, uint8 metricType) public onlyAuthorized(caseId) {
        FairnessAnalysis storage analysis = fairnessAnalyses[caseId];
        require(FHE.isInitialized(analysis.encryptedBiasScore), "No analysis available");
        
        bytes32[] memory ciphertexts = new bytes32[](1);
        
        if (metricType == 0) {
            ciphertexts[0] = FHE.toBytes32(analysis.encryptedBiasScore);
        } else if (metricType == 1) {
            ciphertexts[0] = FHE.toBytes32(analysis.encryptedDisparityIndex);
        } else if (metricType == 2) {
            ciphertexts[0] = FHE.toBytes32(analysis.encryptedReformImpact);
        } else {
            revert("Invalid metric type");
        }
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptAnalysisMetric.selector);
        requestToCaseId[reqId] = caseId * 10 + metricType;
    }
    
    function decryptAnalysisMetric(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 compositeId = requestToCaseId[requestId];
        uint256 caseId = compositeId / 10;
        uint8 metricType = uint8(compositeId % 10);
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        string memory result = abi.decode(cleartexts, (string));
    }
    
    function getDecryptedCase(uint256 caseId) public view returns (
        string memory defendantInfo,
        string memory charges,
        string memory sentence,
        bool isRevealed
    ) {
        DecryptedCaseData storage c = decryptedCases[caseId];
        return (c.defendantInfo, c.charges, c.sentence, c.isRevealed);
    }
    
    function hasFairnessAnalysis(uint256 caseId) public view returns (bool) {
        return FHE.isInitialized(fairnessAnalyses[caseId].encryptedBiasScore);
    }
}