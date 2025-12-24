import { useEffect, useState } from "react";
import {
  connect,
  disconnect,
  getLocalStorage,
  isConnected,
  openContractCall,
} from "@stacks/connect";
import {
  AnchorMode,
  PostConditionMode,
  callReadOnlyFunction,
  cvToJSON,
  validateStacksAddress,
  stringAsciiCV,
  uintCV,
  principalCV,
} from "@stacks/transactions-v6";
import { STACKS_TESTNET } from "@stacks/network";
import { createAppKit } from "@reown/appkit";
import { EthersAdapter } from "@reown/appkit-adapter-ethers";
import { sepolia } from "@reown/appkit/networks";
import "./App.css";

const stacksNetwork = STACKS_TESTNET;
const appDetails = {
  name: "Bitcoin Lending Protocol",
  icon: "https://appkit.reown.com/favicon.ico",
};

const reownProjectId = import.meta.env.VITE_REOWN_PROJECT_ID as string | undefined;
const envDeployer = (import.meta.env.VITE_CONTRACT_DEPLOYER as string | undefined) || "";
const envLendingPool = (import.meta.env.VITE_LENDING_POOL_CONTRACT as string | undefined) || "lending-pool-v2";
const envPriceOracle = (import.meta.env.VITE_PRICE_ORACLE_CONTRACT as string | undefined) || "price-oracle-v2";
const envGovernance = (import.meta.env.VITE_GOVERNANCE_CONTRACT as string | undefined) || "protocol-governance-v2";
const envPasskey = (import.meta.env.VITE_PASSKEY_CONTRACT as string | undefined) || "passkey-signer-v2";

const menuItems = ["Lend", "Borrow", "Governance", "Features"] as const;
type MenuItem = (typeof menuItems)[number];

let appKitInitialized = false;

function initAppKit() {
  if (appKitInitialized || !reownProjectId) return;
  createAppKit({
    adapters: [new EthersAdapter()],
    networks: [sepolia],
    projectId: reownProjectId,
    metadata: {
      name: "Bitcoin Lending Protocol",
      description: "Testnet lending for STX collateral",
      url: window.location.origin,
      icons: ["https://appkit.reown.com/favicon.ico"],
    },
  });
  appKitInitialized = true;
}

function App() {
  const [stxAddress, setStxAddress] = useState<string | null>(null);
  const [activeMenu, setActiveMenu] = useState<MenuItem>("Lend");
  const [deployer, setDeployer] = useState(envDeployer);
  const [lendingPool, setLendingPool] = useState(envLendingPool);
  const [priceOracle, setPriceOracle] = useState(envPriceOracle);
  const [governance, setGovernance] = useState(envGovernance);
  const [passkey, setPasskey] = useState(envPasskey);
  const [status, setStatus] = useState("Ready.");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [stats, setStats] = useState({ totalDeposits: "0", totalBorrows: "0" });
  const [position, setPosition] = useState({
    deposit: "0",
    collateral: "0",
    loan: "0",
    health: "0",
  });
  const [forms, setForms] = useState({
    deposit: "0",
    withdraw: "0",
    collateral: "0",
    borrow: "0",
    repay: "0",
  });

  useEffect(() => {
    initAppKit();
  }, []);

  useEffect(() => {
    if (isConnected()) {
      const address = getLocalStorage()?.addresses?.stx?.[0]?.address || null;
      setStxAddress(address);
    }
  }, []);

  const contractAddress = deployer.trim();
  const parseContractInput = (value: string, fallbackAddress: string) => {
    const trimmed = value.trim();
    if (trimmed.includes(".")) {
      const [address, name] = trimmed.split(".");
      return {
        address,
        name,
        isValid: validateStacksAddress(address) && name.trim().length > 0,
      };
    }
    return {
      address: fallbackAddress,
      name: trimmed,
      isValid: validateStacksAddress(fallbackAddress) && trimmed.length > 0,
    };
  };

  const isDeployerValid = contractAddress.length > 0 && validateStacksAddress(contractAddress);
  const lendingPoolConfig = parseContractInput(lendingPool, contractAddress);
  const isLendingPoolValid = lendingPoolConfig.isValid;
  const canCall = isLendingPoolValid;
  const senderAddress =
    stxAddress ||
    lendingPoolConfig.address ||
    contractAddress ||
    "ST000000000000000000002AMW42H";
  const shortAddress = stxAddress
    ? `${stxAddress.slice(0, 6)}...${stxAddress.slice(-4)}`
    : "Not connected";

  const updateForm = (key: keyof typeof forms, value: string) => {
    setForms((prev) => ({ ...prev, [key]: value }));
  };

  const connectWallet = async () => {
    if (!reownProjectId) {
      setStatus("Set VITE_REOWN_PROJECT_ID to enable WalletConnect.");
      return;
    }
    setStatus("Connecting wallet...");
    try {
      await connect({
        network: "testnet",
        walletConnect: {
          projectId: reownProjectId,
          metadata: {
            name: appDetails.name,
            description: "Testnet lending for STX collateral",
            url: window.location.origin,
            icons: [appDetails.icon],
          },
        },
      });
      const address = getLocalStorage()?.addresses?.stx?.[0]?.address || null;
      setStxAddress(address);
      setStatus(address ? "Wallet connected." : "Wallet connected. No STX address found.");
    } catch (error) {
      setStatus("Wallet connection canceled.");
    }
  };

  const disconnectWallet = () => {
    disconnect();
    setStxAddress(null);
    setStatus("Wallet disconnected.");
  };

  const submitCall = async (
    label: string,
    functionName: string,
    functionArgs: Array<ReturnType<typeof uintCV> | ReturnType<typeof stringAsciiCV> | ReturnType<typeof principalCV>>,
  ) => {
    if (!canCall) {
      setStatus("Set a valid deployer address and lending pool contract name.");
      return;
    }
    setBusyAction(label);
    setStatus(`Awaiting wallet signature for ${label}...`);
    try {
      await openContractCall({
        contractAddress: lendingPoolConfig.address,
        contractName: lendingPoolConfig.name,
        functionName,
        functionArgs,
        network: stacksNetwork,
        appDetails,
        stxAddress: stxAddress || undefined,
        anchorMode: AnchorMode.Any,
        postConditionMode: PostConditionMode.Deny,
        onFinish: (data) => {
          setStatus(`Transaction submitted: ${data.txId}`);
          setBusyAction(null);
        },
        onCancel: () => {
          setStatus("Transaction canceled.");
          setBusyAction(null);
        },
      });
    } catch (error) {
      setStatus(`Failed to submit ${label}.`);
      setBusyAction(null);
    }
  };

  const refreshStats = async () => {
    if (!canCall) {
      setStatus("Set a valid deployer address and lending pool contract name.");
      return;
    }
    setStatus("Refreshing pool stats...");
    try {
      const totalDepositsCv = await callReadOnlyFunction({
        contractAddress: lendingPoolConfig.address,
        contractName: lendingPoolConfig.name,
        functionName: "get-total-deposits",
        functionArgs: [],
        network: stacksNetwork,
        senderAddress,
      });
      const totalBorrowsCv = await callReadOnlyFunction({
        contractAddress: lendingPoolConfig.address,
        contractName: lendingPoolConfig.name,
        functionName: "get-total-borrows",
        functionArgs: [],
        network: stacksNetwork,
        senderAddress,
      });

      const depositsJson = cvToJSON(totalDepositsCv);
      const borrowsJson = cvToJSON(totalBorrowsCv);

      setStats({
        totalDeposits: depositsJson.value.value || "0",
        totalBorrows: borrowsJson.value.value || "0",
      });
      setStatus("Pool stats updated.");
    } catch (error) {
      setStatus("Failed to refresh stats.");
    }
  };

  const refreshPosition = async () => {
    if (!stxAddress) {
      setStatus("Connect wallet to load your position.");
      return;
    }
    if (!canCall) {
      setStatus("Set a valid deployer address and lending pool contract name.");
      return;
    }
    setStatus("Refreshing your position...");
    try {
      const depositCv = await callReadOnlyFunction({
        contractAddress: lendingPoolConfig.address,
        contractName: lendingPoolConfig.name,
        functionName: "get-user-deposit",
        functionArgs: [principalCV(stxAddress)],
        network: stacksNetwork,
        senderAddress,
      });
      const collateralCv = await callReadOnlyFunction({
        contractAddress: lendingPoolConfig.address,
        contractName: lendingPoolConfig.name,
        functionName: "get-user-collateral",
        functionArgs: [principalCV(stxAddress)],
        network: stacksNetwork,
        senderAddress,
      });
      const loanCv = await callReadOnlyFunction({
        contractAddress: lendingPoolConfig.address,
        contractName: lendingPoolConfig.name,
        functionName: "get-user-loan",
        functionArgs: [principalCV(stxAddress)],
        network: stacksNetwork,
        senderAddress,
      });
      const healthCv = await callReadOnlyFunction({
        contractAddress: lendingPoolConfig.address,
        contractName: lendingPoolConfig.name,
        functionName: "get-health-factor",
        functionArgs: [principalCV(stxAddress)],
        network: stacksNetwork,
        senderAddress,
      });

      const depositJson = cvToJSON(depositCv);
      const collateralJson = cvToJSON(collateralCv);
      const loanJson = cvToJSON(loanCv);
      const healthJson = cvToJSON(healthCv);

      setPosition({
        deposit: depositJson.value?.value?.value?.amount?.value || "0",
        collateral: collateralJson.value?.value?.value?.amount?.value || "0",
        loan: loanJson.value?.value?.value?.["principal-amount"]?.value || "0",
        health: healthJson.value?.value || "0",
      });
      setStatus("Position updated.");
    } catch (error) {
      setStatus("Failed to refresh position.");
    }
  };

  return (
    <div className="app-shell">
      <div className="bg-orb orb-1" />
      <div className="bg-orb orb-2" />
      <div className="bg-orb orb-3" />

      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">BTCLEND</span>
          <span className="brand-subtitle">Bitcoin Lending Protocol</span>
        </div>
        <nav className="nav">
          {menuItems.map((item) => (
            <button
              key={item}
              className={item === activeMenu ? "nav-link active" : "nav-link"}
              onClick={() => setActiveMenu(item)}
            >
              {item}
            </button>
          ))}
        </nav>
        <div className="header-wallet">
          <span className="wallet-status">{shortAddress}</span>
          <div className="row">
            {!stxAddress && (
              <button className="primary" onClick={connectWallet}>
                Connect
              </button>
            )}
            {stxAddress && (
              <button className="ghost" onClick={disconnectWallet}>
                Disconnect
              </button>
            )}
          </div>
        </div>
      </header>

      <header className="topbar">
        <div>
          <p className="eyebrow">Bitcoin Lending Protocol</p>
          <h1>Stacks Testnet Lending Desk</h1>
          <p className="subhead">
            Deposit STX, post collateral, and borrow against your position. Built for
            protocol operators and early testers.
          </p>
        </div>
        <div className="wallet-summary">
          <div className="summary-card">
            <p className="card-title">Wallet status</p>
            <p className="address">{stxAddress || "Not connected"}</p>
            <p className="summary-note">
              {reownProjectId ? "WalletConnect ready" : "Set VITE_REOWN_PROJECT_ID"}
            </p>
          </div>
        </div>
      </header>

      <section className="status-bar">
        <div>
          <span>Network</span>
          <strong>Stacks Testnet</strong>
        </div>
        <div>
          <span>Contracts</span>
          <strong>
            {canCall
              ? `${lendingPoolConfig.address}.${lendingPoolConfig.name}`
              : isDeployerValid
                ? "Set lending pool name"
                : "Invalid deployer address"}
          </strong>
        </div>
        <div>
          <span>Status</span>
          <strong>{status}</strong>
        </div>
      </section>

      <section className="grid">
        {activeMenu === "Lend" && (
          <>
            <div className="panel">
              <h2>Pool Overview</h2>
              <p className="panel-subtitle">Live read-only data from the lending pool.</p>
              <div className="stats">
                <div>
                  <span>Total deposits</span>
                  <strong>{stats.totalDeposits}</strong>
                </div>
                <div>
                  <span>Total borrows</span>
                  <strong>{stats.totalBorrows}</strong>
                </div>
              </div>
              <button className="secondary" onClick={refreshStats}>
                Refresh pool stats
              </button>
            </div>

            <div className="panel">
              <h2>Your Position</h2>
              <p className="panel-subtitle">Read-only account metrics from the pool.</p>
              <div className="stats">
                <div>
                  <span>Deposited</span>
                  <strong>{position.deposit}</strong>
                </div>
                <div>
                  <span>Collateral</span>
                  <strong>{position.collateral}</strong>
                </div>
                <div>
                  <span>Loan balance</span>
                  <strong>{position.loan}</strong>
                </div>
                <div>
                  <span>Health factor</span>
                  <strong>{position.health}</strong>
                </div>
              </div>
              <button className="secondary" onClick={refreshPosition}>
                Refresh my position
              </button>
            </div>

            <div className="panel wide">
              <h2>Lend Actions</h2>
              <p className="panel-subtitle">Sign transactions with the Stacks wallet.</p>
              <div className="actions">
                <div className="action-card">
                  <h3>Deposit STX</h3>
                  <input
                    type="number"
                    min="0"
                    value={forms.deposit}
                    onChange={(event) => updateForm("deposit", event.target.value)}
                  />
                  <button
                    className="primary"
                    disabled={busyAction === "deposit"}
                    onClick={() =>
                      submitCall("deposit", "deposit", [uintCV(Number(forms.deposit))])
                    }
                  >
                    {busyAction === "deposit" ? "Pending..." : "Deposit"}
                  </button>
                </div>

                <div className="action-card">
                  <h3>Withdraw STX</h3>
                  <input
                    type="number"
                    min="0"
                    value={forms.withdraw}
                    onChange={(event) => updateForm("withdraw", event.target.value)}
                  />
                  <button
                    className="primary"
                    disabled={busyAction === "withdraw"}
                    onClick={() =>
                      submitCall("withdraw", "withdraw", [uintCV(Number(forms.withdraw))])
                    }
                  >
                    {busyAction === "withdraw" ? "Pending..." : "Withdraw"}
                  </button>
                </div>

                <div className="action-card">
                  <h3>Add Collateral</h3>
                  <input
                    type="number"
                    min="0"
                    value={forms.collateral}
                    onChange={(event) => updateForm("collateral", event.target.value)}
                  />
                  <button
                    className="primary"
                    disabled={busyAction === "collateral"}
                    onClick={() =>
                      submitCall("collateral", "add-collateral", [
                        uintCV(Number(forms.collateral)),
                        stringAsciiCV("STX"),
                      ])
                    }
                  >
                    {busyAction === "collateral" ? "Pending..." : "Add collateral"}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {activeMenu === "Borrow" && (
          <>
            <div className="panel">
              <h2>Your Position</h2>
              <p className="panel-subtitle">Read-only account metrics from the pool.</p>
              <div className="stats">
                <div>
                  <span>Deposited</span>
                  <strong>{position.deposit}</strong>
                </div>
                <div>
                  <span>Collateral</span>
                  <strong>{position.collateral}</strong>
                </div>
                <div>
                  <span>Loan balance</span>
                  <strong>{position.loan}</strong>
                </div>
                <div>
                  <span>Health factor</span>
                  <strong>{position.health}</strong>
                </div>
              </div>
              <button className="secondary" onClick={refreshPosition}>
                Refresh my position
              </button>
            </div>

            <div className="panel">
              <h2>Pool Overview</h2>
              <p className="panel-subtitle">Live read-only data from the lending pool.</p>
              <div className="stats">
                <div>
                  <span>Total deposits</span>
                  <strong>{stats.totalDeposits}</strong>
                </div>
                <div>
                  <span>Total borrows</span>
                  <strong>{stats.totalBorrows}</strong>
                </div>
              </div>
              <button className="secondary" onClick={refreshStats}>
                Refresh pool stats
              </button>
            </div>

            <div className="panel wide">
              <h2>Borrow Actions</h2>
              <p className="panel-subtitle">Borrow and repay against your collateral.</p>
              <div className="actions">
                <div className="action-card">
                  <h3>Borrow STX</h3>
                  <input
                    type="number"
                    min="0"
                    value={forms.borrow}
                    onChange={(event) => updateForm("borrow", event.target.value)}
                  />
                  <button
                    className="primary"
                    disabled={busyAction === "borrow"}
                    onClick={() =>
                      submitCall("borrow", "borrow", [uintCV(Number(forms.borrow))])
                    }
                  >
                    {busyAction === "borrow" ? "Pending..." : "Borrow"}
                  </button>
                </div>

                <div className="action-card">
                  <h3>Repay</h3>
                  <input
                    type="number"
                    min="0"
                    value={forms.repay}
                    onChange={(event) => updateForm("repay", event.target.value)}
                  />
                  <button
                    className="primary"
                    disabled={busyAction === "repay"}
                    onClick={() =>
                      submitCall("repay", "repay", [uintCV(Number(forms.repay))])
                    }
                  >
                    {busyAction === "repay" ? "Pending..." : "Repay"}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {activeMenu === "Governance" && (
          <>
            <div className="panel">
              <h2>Governance Console</h2>
              <p className="panel-subtitle">
                Track proposals and coordinate protocol updates.
              </p>
              <div className="stats">
                <div>
                  <span>Governor contract</span>
                  <strong>{governance}</strong>
                </div>
                <div>
                  <span>Quorum status</span>
                  <strong>Awaiting votes</strong>
                </div>
              </div>
              <button className="secondary">View active proposals</button>
            </div>

            <div className="panel">
              <h2>Operator Toolkit</h2>
              <p className="panel-subtitle">
                Prepare upgrades, parameter changes, and safety pauses.
              </p>
              <div className="actions">
                <div className="action-card">
                  <h3>Draft proposal</h3>
                  <p>Stage changes for on-chain voting.</p>
                  <button className="primary">Create draft</button>
                </div>
                <div className="action-card">
                  <h3>Emergency pause</h3>
                  <p>Trigger guardian safety workflows.</p>
                  <button className="ghost">Open checklist</button>
                </div>
              </div>
            </div>
          </>
        )}

        {activeMenu === "Features" && (
          <>
            <div className="panel">
              <h2>Protocol Features</h2>
              <p className="panel-subtitle">
                Explore what BTCLEND ships today and what is coming next.
              </p>
              <div className="stats">
                <div>
                  <span>Collateral assets</span>
                  <strong>STX, sBTC</strong>
                </div>
                <div>
                  <span>Risk engine</span>
                  <strong>Oracle-backed</strong>
                </div>
                <div>
                  <span>Security</span>
                  <strong>Guardian + multisig</strong>
                </div>
              </div>
              <button className="secondary">Read the spec</button>
            </div>

            <div className="panel">
              <h2>Developer Hooks</h2>
              <p className="panel-subtitle">
                Integrate analytics, automation, and custom dashboards.
              </p>
              <div className="actions">
                <div className="action-card">
                  <h3>Real-time feeds</h3>
                  <p>Subscribe to on-chain activity streams.</p>
                  <button className="primary">View endpoints</button>
                </div>
                <div className="action-card">
                  <h3>Risk alerts</h3>
                  <p>Configure liquidation and health thresholds.</p>
                  <button className="ghost">Configure</button>
                </div>
              </div>
            </div>
          </>
        )}

        <div className="panel wide">
          <h2>Contracts</h2>
          <p className="panel-subtitle">Edit for your deployed testnet contracts.</p>
          <div className="contract-grid">
            <label>
              Deployer address
              <input
                value={deployer}
                onChange={(event) => setDeployer(event.target.value)}
                placeholder="ST..."
                className={
                  isDeployerValid || deployer.trim().length === 0 ? "" : "input-error"
                }
              />
            </label>
            <label>
              Lending Pool
              <input
                value={lendingPool}
                onChange={(event) => setLendingPool(event.target.value)}
                className={
                  isLendingPoolValid || lendingPool.trim().length === 0 ? "" : "input-error"
                }
              />
            </label>
            <label>
              Price Oracle
              <input
                value={priceOracle}
                onChange={(event) => setPriceOracle(event.target.value)}
              />
            </label>
            <label>
              Governance
              <input
                value={governance}
                onChange={(event) => setGovernance(event.target.value)}
              />
            </label>
            <label>
              Passkey Signer
              <input
                value={passkey}
                onChange={(event) => setPasskey(event.target.value)}
              />
            </label>
          </div>
        </div>
      </section>
    </div>
  );
}

export default App;

