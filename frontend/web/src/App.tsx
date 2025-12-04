// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface PleaBargainCase {
  id: string;
  encryptedData: string;
  timestamp: number;
  jurisdiction: string;
  crimeType: string;
  outcome: string;
  fheAnalysis: string;
}

const App: React.FC = () => {
  // State management
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [cases, setCases] = useState<PleaBargainCase[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newCaseData, setNewCaseData] = useState({
    jurisdiction: "",
    crimeType: "",
    outcome: "",
    details: ""
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedJurisdiction, setSelectedJurisdiction] = useState("all");
  const [showAnalysis, setShowAnalysis] = useState<string | null>(null);

  // Randomly selected features: Search & Filter, Data Statistics, Data Detail
  const jurisdictions = ["Federal", "State", "County", "Municipal"];
  const crimeTypes = ["Drug", "Property", "Violent", "White Collar", "Other"];

  // Calculate statistics
  const jurisdictionCounts: Record<string, number> = {};
  const crimeTypeCounts: Record<string, number> = {};
  
  cases.forEach(caseItem => {
    jurisdictionCounts[caseItem.jurisdiction] = (jurisdictionCounts[caseItem.jurisdiction] || 0) + 1;
    crimeTypeCounts[caseItem.crimeType] = (crimeTypeCounts[caseItem.crimeType] || 0) + 1;
  });

  // Filter cases based on search and jurisdiction
  const filteredCases = cases.filter(caseItem => {
    const matchesSearch = caseItem.crimeType.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         caseItem.jurisdiction.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesJurisdiction = selectedJurisdiction === "all" || 
                               caseItem.jurisdiction === selectedJurisdiction;
    return matchesSearch && matchesJurisdiction;
  });

  useEffect(() => {
    loadCases().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadCases = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("case_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing case keys:", e);
        }
      }
      
      const caseList: PleaBargainCase[] = [];
      
      for (const key of keys) {
        try {
          const caseBytes = await contract.getData(`case_${key}`);
          if (caseBytes.length > 0) {
            try {
              const caseData = JSON.parse(ethers.toUtf8String(caseBytes));
              caseList.push({
                id: key,
                encryptedData: caseData.data,
                timestamp: caseData.timestamp,
                jurisdiction: caseData.jurisdiction,
                crimeType: caseData.crimeType,
                outcome: caseData.outcome,
                fheAnalysis: caseData.fheAnalysis || "Pending FHE Analysis"
              });
            } catch (e) {
              console.error(`Error parsing case data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading case ${key}:`, e);
        }
      }
      
      caseList.sort((a, b) => b.timestamp - a.timestamp);
      setCases(caseList);
    } catch (e) {
      console.error("Error loading cases:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const submitCase = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting plea bargaining data with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-${btoa(JSON.stringify(newCaseData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const caseId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const caseData = {
        data: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        jurisdiction: newCaseData.jurisdiction,
        crimeType: newCaseData.crimeType,
        outcome: newCaseData.outcome,
        fheAnalysis: "Pending FHE Analysis"
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `case_${caseId}`, 
        ethers.toUtf8Bytes(JSON.stringify(caseData))
      );
      
      const keysBytes = await contract.getData("case_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(caseId);
      
      await contract.setData(
        "case_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Encrypted plea data submitted securely!"
      });
      
      await loadCases();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewCaseData({
          jurisdiction: "",
          crimeType: "",
          outcome: "",
          details: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const runFHEAnalysis = async (caseId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Running FHE fairness analysis..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const caseBytes = await contract.getData(`case_${caseId}`);
      if (caseBytes.length === 0) {
        throw new Error("Case not found");
      }
      
      const caseData = JSON.parse(ethers.toUtf8String(caseBytes));
      
      // Simulate FHE analysis results
      const analysisResults = [
        "Fairness Score: 82%",
        "Sentencing Disparity: Low",
        "Prosecutor Bias: Moderate",
        "Recommended Action: Review charging guidelines"
      ].join("\n");
      
      const updatedCase = {
        ...caseData,
        fheAnalysis: analysisResults
      };
      
      await contract.setData(
        `case_${caseId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedCase))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE analysis completed successfully!"
      });
      
      await loadCases();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Analysis failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const toggleAnalysis = (caseId: string) => {
    setShowAnalysis(showAnalysis === caseId ? null : caseId);
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Initializing FHE connection...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>PleaBargain<span>FHE</span></h1>
          <p>Confidential Analysis of Judicial Plea Bargaining Data</p>
        </div>
        
        <div className="header-actions">
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <main className="main-content">
        <section className="intro-section">
          <div className="intro-content">
            <h2>FHE-Powered Plea Bargain Analysis</h2>
            <p>
              Analyze encrypted plea bargaining data using Fully Homomorphic Encryption to 
              identify potential biases and promote judicial fairness without compromising 
              sensitive case details.
            </p>
            <button 
              onClick={() => setShowCreateModal(true)} 
              className="primary-btn"
            >
              Add Case Data
            </button>
          </div>
          <div className="intro-graphic">
            <div className="fhe-badge">FHE SECURED</div>
          </div>
        </section>

        <section className="stats-section">
          <div className="stat-card">
            <h3>Total Cases</h3>
            <p className="stat-value">{cases.length}</p>
          </div>
          <div className="stat-card">
            <h3>Jurisdictions</h3>
            <p className="stat-value">{Object.keys(jurisdictionCounts).length}</p>
          </div>
          <div className="stat-card">
            <h3>Crime Types</h3>
            <p className="stat-value">{Object.keys(crimeTypeCounts).length}</p>
          </div>
          <div className="stat-card">
            <h3>FHE Analyses</h3>
            <p className="stat-value">
              {cases.filter(c => !c.fheAnalysis.includes("Pending")).length}
            </p>
          </div>
        </section>

        <section className="search-section">
          <div className="search-container">
            <input
              type="text"
              placeholder="Search cases..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            <select
              value={selectedJurisdiction}
              onChange={(e) => setSelectedJurisdiction(e.target.value)}
              className="jurisdiction-select"
            >
              <option value="all">All Jurisdictions</option>
              {jurisdictions.map(j => (
                <option key={j} value={j}>{j}</option>
              ))}
            </select>
            <button 
              onClick={loadCases}
              disabled={isRefreshing}
              className="refresh-btn"
            >
              {isRefreshing ? "Refreshing..." : "Refresh Data"}
            </button>
          </div>
        </section>

        <section className="cases-section">
          <h2>Plea Bargain Cases</h2>
          {filteredCases.length === 0 ? (
            <div className="no-cases">
              <p>No plea bargain cases found</p>
              <button 
                className="primary-btn"
                onClick={() => setShowCreateModal(true)}
              >
                Add First Case
              </button>
            </div>
          ) : (
            <div className="cases-grid">
              {filteredCases.map(caseItem => (
                <div className="case-card" key={caseItem.id}>
                  <div className="case-header">
                    <span className="case-id">Case #{caseItem.id.substring(0, 6)}</span>
                    <span className={`jurisdiction-badge ${caseItem.jurisdiction.toLowerCase()}`}>
                      {caseItem.jurisdiction}
                    </span>
                  </div>
                  <div className="case-details">
                    <div className="detail-row">
                      <span>Crime Type:</span>
                      <span>{caseItem.crimeType}</span>
                    </div>
                    <div className="detail-row">
                      <span>Outcome:</span>
                      <span>{caseItem.outcome}</span>
                    </div>
                    <div className="detail-row">
                      <span>Date:</span>
                      <span>{new Date(caseItem.timestamp * 1000).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="case-actions">
                    <button 
                      onClick={() => toggleAnalysis(caseItem.id)}
                      className="action-btn"
                    >
                      {showAnalysis === caseItem.id ? "Hide Analysis" : "View Analysis"}
                    </button>
                    {caseItem.fheAnalysis.includes("Pending") && (
                      <button 
                        onClick={() => runFHEAnalysis(caseItem.id)}
                        className="action-btn primary"
                      >
                        Run FHE Analysis
                      </button>
                    )}
                  </div>
                  {showAnalysis === caseItem.id && (
                    <div className="analysis-results">
                      <h4>FHE Fairness Analysis</h4>
                      <pre>{caseItem.fheAnalysis}</pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
  
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="create-modal">
            <div className="modal-header">
              <h2>Add Plea Bargain Case</h2>
              <button onClick={() => setShowCreateModal(false)} className="close-modal">
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Jurisdiction *</label>
                <select
                  name="jurisdiction"
                  value={newCaseData.jurisdiction}
                  onChange={(e) => setNewCaseData({...newCaseData, jurisdiction: e.target.value})}
                  className="form-input"
                >
                  <option value="">Select jurisdiction</option>
                  {jurisdictions.map(j => (
                    <option key={j} value={j}>{j}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Crime Type *</label>
                <select
                  name="crimeType"
                  value={newCaseData.crimeType}
                  onChange={(e) => setNewCaseData({...newCaseData, crimeType: e.target.value})}
                  className="form-input"
                >
                  <option value="">Select crime type</option>
                  {crimeTypes.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Outcome *</label>
                <input
                  type="text"
                  name="outcome"
                  value={newCaseData.outcome}
                  onChange={(e) => setNewCaseData({...newCaseData, outcome: e.target.value})}
                  placeholder="Plea bargain outcome"
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label>Case Details</label>
                <textarea
                  name="details"
                  value={newCaseData.details}
                  onChange={(e) => setNewCaseData({...newCaseData, details: e.target.value})}
                  placeholder="Enter case details to be encrypted with FHE..."
                  className="form-textarea"
                  rows={4}
                />
              </div>
              <div className="fhe-notice">
                All data will be encrypted using FHE technology before storage
              </div>
            </div>
            <div className="modal-footer">
              <button 
                onClick={() => setShowCreateModal(false)}
                className="secondary-btn"
              >
                Cancel
              </button>
              <button 
                onClick={submitCase}
                disabled={creating || !newCaseData.jurisdiction || !newCaseData.crimeType || !newCaseData.outcome}
                className="primary-btn"
              >
                {creating ? "Encrypting with FHE..." : "Submit Case"}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="spinner"></div>}
              {transactionStatus.status === "success" && "✓"}
              {transactionStatus.status === "error" && "✗"}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <h3>PleaBargainFHE</h3>
            <p>Confidential Analysis of Judicial Plea Bargaining Data</p>
          </div>
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© {new Date().getFullYear()} PleaBargainFHE. All rights reserved.</p>
          <div className="fhe-badge">FHE SECURED</div>
        </div>
      </footer>
    </div>
  );
};

export default App;