const WEB3_IIFE_URL = "https://cdn.jsdelivr.net/npm/@solana/web3.js@1.98.4/lib/index.iife.min.js";
const CLUSTER_KEY = "hedgey_solana_cluster_v1";
const LAST_WALLET_KEY = "hedgey_solana_last_wallet_v1";

const TOKEN_PROGRAM_ID_TEXT = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const ASSOCIATED_TOKEN_PROGRAM_ID_TEXT = "ATokenGPvbdGVxr1kcxMqs3dS2k4aGLtJmzQzFhvv3";

const CLUSTERS = {
  "mainnet-beta": {
    label: "Mainnet Beta",
    endpoint: "https://api.mainnet-beta.solana.com",
    usdcMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    usdcDecimals: 6,
  },
  devnet: {
    label: "Devnet",
    endpoint: "https://api.devnet.solana.com",
    usdcMint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
    usdcDecimals: 6,
  },
};

let web3Promise = null;

function normalizeCluster(value){
  const raw = String(value || "").trim();
  return CLUSTERS[raw] ? raw : "devnet";
}

function clusterInfo(cluster){
  return CLUSTERS[normalizeCluster(cluster)];
}

function shortAddress(value){
  const text = String(value || "");
  if (text.length <= 14) return text || "not connected";
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
}

function safeText(value){
  return String(value == null ? "" : value);
}

function formatSol(lamports){
  if (lamports == null || Number.isNaN(Number(lamports))) return "unknown";
  return `${(Number(lamports) / 1_000_000_000).toLocaleString("en-US", {
    maximumFractionDigits: 6,
  })} SOL`;
}

function decimalToBaseUnits(value, decimals){
  const raw = String(value || "").trim();
  if (!/^\d+(\.\d+)?$/.test(raw)) throw new Error("Enter a positive decimal amount.");
  const [wholeRaw, fracRaw = ""] = raw.split(".");
  if (fracRaw.length > decimals) throw new Error(`Amount has more than ${decimals} decimals.`);
  const whole = BigInt(wholeRaw || "0");
  const frac = BigInt((fracRaw + "0".repeat(decimals)).slice(0, decimals) || "0");
  const unit = 10n ** BigInt(decimals);
  const out = whole * unit + frac;
  if (out <= 0n) throw new Error("Amount must be greater than zero.");
  return out;
}

function u64LeBytes(value){
  let n = BigInt(value);
  const bytes = new Uint8Array(8);
  for (let i = 0; i < 8; i += 1) {
    bytes[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return bytes;
}

function walletName(provider, fallback = "Solana Wallet"){
  if (!provider) return fallback;
  if (provider.isPhantom) return "Phantom";
  if (provider.isSolflare) return "Solflare";
  if (provider.isBackpack) return "Backpack";
  if (provider.isGlow) return "Glow";
  if (provider.isSlope) return "Slope";
  return provider.name || fallback;
}

function uniqueProviders(list){
  const seen = new Set();
  return list.filter(item => {
    if (!item?.provider) return false;
    if (seen.has(item.provider)) return false;
    seen.add(item.provider);
    return true;
  });
}

function discoverProviders(){
  const w = window;
  const candidates = [];
  const add = (name, provider, priority) => {
    if (!provider || typeof provider.connect !== "function") return;
    candidates.push({ name: walletName(provider, name), provider, priority });
  };

  add("Phantom", w.phantom?.solana, 10);
  add("Solflare", w.solflare, 20);
  add("Backpack", w.backpack?.solana, 30);
  add("Glow", w.glowSolana, 40);

  if (Array.isArray(w.solana?.providers)) {
    w.solana.providers.forEach((provider, index) => add(walletName(provider, `Wallet ${index + 1}`), provider, 50 + index));
  }
  add("Injected Solana Wallet", w.solana, 80);

  const last = localStorage.getItem(LAST_WALLET_KEY) || "";
  return uniqueProviders(candidates).sort((a, b) => {
    const ac = a.provider?.isConnected ? 0 : 1;
    const bc = b.provider?.isConnected ? 0 : 1;
    if (ac !== bc) return ac - bc;
    const al = a.name === last ? 0 : 1;
    const bl = b.name === last ? 0 : 1;
    if (al !== bl) return al - bl;
    return a.priority - b.priority;
  });
}

function loadWeb3(){
  if (window.solanaWeb3) return Promise.resolve(window.solanaWeb3);
  if (web3Promise) return web3Promise;
  web3Promise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${WEB3_IIFE_URL}"]`);
    const script = existing || document.createElement("script");
    const done = () => {
      if (window.solanaWeb3) resolve(window.solanaWeb3);
      else reject(new Error("Solana web3 library did not initialize."));
    };
    script.addEventListener("load", done, { once: true });
    script.addEventListener("error", () => reject(new Error("Could not load Solana web3 library.")), { once: true });
    if (!existing) {
      script.src = WEB3_IIFE_URL;
      script.async = true;
      script.crossOrigin = "anonymous";
      document.head.appendChild(script);
    } else if (window.solanaWeb3) {
      done();
    }
  });
  return web3Promise;
}

export function initSolanaIntegration({ wm, button } = {}){
  const state = {
    provider: null,
    providerName: "",
    providers: [],
    connected: false,
    publicKey: "",
    balanceLamports: null,
    cluster: normalizeCluster(localStorage.getItem(CLUSTER_KEY) || "devnet"),
    lastError: "",
    lastSignature: "",
    tokenAccounts: [],
    autoConnectAttempted: false,
  };

  let boundProvider = null;

  function snapshot(){
    return {
      connected: state.connected,
      providerName: state.providerName,
      providers: state.providers.map(item => item.name),
      publicKey: state.publicKey,
      balanceLamports: state.balanceLamports,
      balanceLabel: formatSol(state.balanceLamports),
      cluster: state.cluster,
      clusterLabel: clusterInfo(state.cluster).label,
      endpoint: clusterInfo(state.cluster).endpoint,
      lastError: state.lastError,
      lastSignature: state.lastSignature,
      tokenAccounts: state.tokenAccounts.slice(),
    };
  }

  function updateButton(){
    if (!button) return;
    button.classList.toggle("solana-connected", state.connected);
    button.classList.toggle("solana-disconnected", !state.connected);
    button.title = state.connected
      ? `Solana connected: ${shortAddress(state.publicKey)} on ${clusterInfo(state.cluster).label}`
      : (state.providerName ? `Connect ${state.providerName}` : "Solana wallet not detected");
    button.setAttribute("aria-label", button.title);
  }

  function emit(){
    updateButton();
    refreshSolanaPanels();
    window.dispatchEvent(new CustomEvent("hedgey:solana-state", { detail: snapshot() }));
  }

  function chooseProvider(){
    state.providers = discoverProviders();
    const selected = state.providers[0] || null;
    state.provider = selected?.provider || null;
    state.providerName = selected?.name || "";
    bindProviderEvents(state.provider);
    emit();
    return state.provider;
  }

  function bindProviderEvents(provider){
    if (!provider || provider === boundProvider || typeof provider.on !== "function") return;
    boundProvider = provider;
    try {
      provider.on("connect", publicKey => {
        state.connected = true;
        state.publicKey = String(publicKey?.toString?.() || provider.publicKey?.toString?.() || state.publicKey || "");
        state.lastError = "";
        if (state.providerName) localStorage.setItem(LAST_WALLET_KEY, state.providerName);
        refreshBalance().catch(err => {
          state.lastError = err instanceof Error ? err.message : "Could not refresh balance.";
          emit();
        });
        emit();
      });
      provider.on("disconnect", () => {
        state.connected = false;
        state.publicKey = "";
        state.balanceLamports = null;
        emit();
      });
      provider.on("accountChanged", publicKey => {
        state.publicKey = String(publicKey?.toString?.() || provider.publicKey?.toString?.() || "");
        state.connected = Boolean(state.publicKey);
        refreshBalance().catch(() => {});
        emit();
      });
    } catch {
      // Wallet event APIs are not fully uniform.
    }
  }

  async function rpc(method, params = []){
    const response = await fetch(clusterInfo(state.cluster).endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method,
        params,
      }),
    });
    const json = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`Solana RPC failed (${response.status})`);
    if (json?.error) throw new Error(json.error.message || `Solana RPC error ${json.error.code || ""}`.trim());
    return json?.result;
  }

  function ensureProvider(){
    const provider = state.provider || chooseProvider();
    if (!provider) throw new Error("No Solana wallet extension detected.");
    return provider;
  }

  function ensureConnected(){
    const provider = ensureProvider();
    const key = String(state.publicKey || provider.publicKey?.toString?.() || "");
    if (!state.connected || !key) throw new Error("Connect a Solana wallet first.");
    state.publicKey = key;
    return { provider, publicKeyText: key };
  }

  async function connect({ silent = false } = {}){
    const provider = ensureProvider();
    state.lastError = "";
    try {
      let result = null;
      if (silent) {
        try {
          result = await provider.connect({ onlyIfTrusted: true });
        } catch (err) {
          state.lastError = "";
          emit();
          return snapshot();
        }
      } else {
        result = await provider.connect();
      }
      const key = result?.publicKey?.toString?.() || provider.publicKey?.toString?.() || "";
      state.publicKey = key;
      state.connected = Boolean(key || provider.isConnected);
      if (state.providerName) localStorage.setItem(LAST_WALLET_KEY, state.providerName);
      if (state.connected) await refreshBalance();
      emit();
      return snapshot();
    } catch (err) {
      state.lastError = err instanceof Error ? err.message : "Wallet connection failed.";
      emit();
      throw err;
    }
  }

  async function disconnect(){
    if (state.provider && typeof state.provider.disconnect === "function") {
      await state.provider.disconnect();
    }
    state.connected = false;
    state.publicKey = "";
    state.balanceLamports = null;
    emit();
    return snapshot();
  }

  async function refreshBalance(){
    const { publicKeyText } = ensureConnected();
    const result = await rpc("getBalance", [publicKeyText, { commitment: "confirmed" }]);
    state.balanceLamports = Number(result?.value || 0);
    state.lastError = "";
    emit();
    return state.balanceLamports;
  }

  async function inspectTokenAccounts(){
    const { publicKeyText } = ensureConnected();
    const result = await rpc("getTokenAccountsByOwner", [
      publicKeyText,
      { programId: TOKEN_PROGRAM_ID_TEXT },
      { encoding: "jsonParsed", commitment: "confirmed" },
    ]);
    const accounts = (result?.value || []).map(item => {
      const info = item?.account?.data?.parsed?.info || {};
      const amount = info?.tokenAmount || {};
      return {
        address: String(item?.pubkey || ""),
        mint: String(info?.mint || ""),
        owner: String(info?.owner || ""),
        amount: String(amount?.uiAmountString || amount?.uiAmount || "0"),
        decimals: Number(amount?.decimals || 0),
      };
    });
    state.tokenAccounts = accounts;
    state.lastError = "";
    emit();
    return accounts;
  }

  async function requestAirdrop(amountSol = "1"){
    if (state.cluster === "mainnet-beta") throw new Error("Airdrop is available on devnet, not mainnet.");
    const { publicKeyText } = ensureConnected();
    const lamports = Number(decimalToBaseUnits(amountSol, 9));
    const signature = await rpc("requestAirdrop", [publicKeyText, lamports]);
    state.lastSignature = String(signature || "");
    await refreshBalance().catch(() => {});
    emit();
    return signature;
  }

  async function connection(){
    const web3 = await loadWeb3();
    return new web3.Connection(clusterInfo(state.cluster).endpoint, "confirmed");
  }

  async function sendTransaction(tx){
    const web3 = await loadWeb3();
    const { provider, publicKeyText } = ensureConnected();
    const conn = await connection();
    const publicKey = new web3.PublicKey(publicKeyText);
    const latest = await conn.getLatestBlockhash("confirmed");
    tx.feePayer = publicKey;
    tx.recentBlockhash = latest.blockhash;

    let signature = "";
    if (typeof provider.signAndSendTransaction === "function") {
      const result = await provider.signAndSendTransaction(tx);
      signature = String(result?.signature || result || "");
    } else if (typeof provider.signTransaction === "function") {
      const signed = await provider.signTransaction(tx);
      signature = await conn.sendRawTransaction(signed.serialize());
    } else {
      throw new Error(`${state.providerName || "Wallet"} cannot sign Solana transactions.`);
    }
    if (!signature) throw new Error("Wallet did not return a transaction signature.");
    try {
      await conn.confirmTransaction({ signature, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight }, "confirmed");
    } catch {
      await conn.confirmTransaction(signature, "confirmed").catch(() => {});
    }
    state.lastSignature = signature;
    await refreshBalance().catch(() => {});
    emit();
    return signature;
  }

  async function sendSol({ to, amountSol } = {}){
    const web3 = await loadWeb3();
    const { publicKeyText } = ensureConnected();
    const recipient = new web3.PublicKey(String(to || "").trim());
    const lamports = Number(decimalToBaseUnits(amountSol, 9));
    const tx = new web3.Transaction().add(web3.SystemProgram.transfer({
      fromPubkey: new web3.PublicKey(publicKeyText),
      toPubkey: recipient,
      lamports,
    }));
    return sendTransaction(tx);
  }

  function associatedTokenAddress(owner, mint){
    const web3 = window.solanaWeb3;
    return web3.PublicKey.findProgramAddressSync(
      [
        owner.toBuffer(),
        new web3.PublicKey(TOKEN_PROGRAM_ID_TEXT).toBuffer(),
        mint.toBuffer(),
      ],
      new web3.PublicKey(ASSOCIATED_TOKEN_PROGRAM_ID_TEXT),
    )[0];
  }

  function createAtaIdempotentInstruction({ payer, ata, owner, mint }){
    const web3 = window.solanaWeb3;
    return new web3.TransactionInstruction({
      programId: new web3.PublicKey(ASSOCIATED_TOKEN_PROGRAM_ID_TEXT),
      keys: [
        { pubkey: payer, isSigner: true, isWritable: true },
        { pubkey: ata, isSigner: false, isWritable: true },
        { pubkey: owner, isSigner: false, isWritable: false },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: web3.SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: new web3.PublicKey(TOKEN_PROGRAM_ID_TEXT), isSigner: false, isWritable: false },
      ],
      data: new Uint8Array([1]),
    });
  }

  function createTransferCheckedInstruction({ source, mint, destination, owner, amount, decimals }){
    const web3 = window.solanaWeb3;
    const data = new Uint8Array(10);
    data[0] = 12;
    data.set(u64LeBytes(amount), 1);
    data[9] = Number(decimals);
    return new web3.TransactionInstruction({
      programId: new web3.PublicKey(TOKEN_PROGRAM_ID_TEXT),
      keys: [
        { pubkey: source, isSigner: false, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: destination, isSigner: false, isWritable: true },
        { pubkey: owner, isSigner: true, isWritable: false },
      ],
      data,
    });
  }

  async function sendUsdc({ to, amountUsdc } = {}){
    const web3 = await loadWeb3();
    const { publicKeyText } = ensureConnected();
    const cfg = clusterInfo(state.cluster);
    const owner = new web3.PublicKey(publicKeyText);
    const destinationOwner = new web3.PublicKey(String(to || "").trim());
    const mint = new web3.PublicKey(cfg.usdcMint);
    const sourceAta = associatedTokenAddress(owner, mint);
    const destinationAta = associatedTokenAddress(destinationOwner, mint);
    const amount = decimalToBaseUnits(amountUsdc, cfg.usdcDecimals);

    const conn = await connection();
    const sourceBalance = await conn.getTokenAccountBalance(sourceAta).catch(() => null);
    const sourceAmount = BigInt(sourceBalance?.value?.amount || "0");
    if (sourceAmount < amount) throw new Error(`Not enough USDC in ${shortAddress(sourceAta.toString())}.`);

    const tx = new web3.Transaction()
      .add(createAtaIdempotentInstruction({ payer: owner, ata: destinationAta, owner: destinationOwner, mint }))
      .add(createTransferCheckedInstruction({
        source: sourceAta,
        mint,
        destination: destinationAta,
        owner,
        amount,
        decimals: cfg.usdcDecimals,
      }));
    return sendTransaction(tx);
  }

  function setCluster(cluster){
    state.cluster = normalizeCluster(cluster);
    localStorage.setItem(CLUSTER_KEY, state.cluster);
    state.balanceLamports = null;
    state.tokenAccounts = [];
    state.lastError = "";
    emit();
    if (state.connected) refreshBalance().catch(() => {});
    return snapshot();
  }

  function explorerTxUrl(signature){
    const cluster = state.cluster === "mainnet-beta" ? "" : `?cluster=${encodeURIComponent(state.cluster)}`;
    return `https://explorer.solana.com/tx/${encodeURIComponent(signature)}${cluster}`;
  }

  function solanaPanelHeader(title){
    return `
      <div class="solana-panel-head">
        <div>
          <div class="solana-panel-title">${title}</div>
          <div class="agent-note">Auto-detected wallet: <strong data-solana-field="providerName">none</strong></div>
        </div>
        <span data-solana-field="badge" class="agent-badge warn">Disconnected</span>
      </div>
    `;
  }

  function walletWindowHtml(){
    return `
      <div class="agent-stack solana-panel" data-solana-panel="wallet">
        ${solanaPanelHeader("Solana Wallet")}
        <div class="agent-pane agent-pane-chrome solana-wallet-card">
          <div class="agent-grid2">
            <label class="agent-form-label">
              <span>Cluster</span>
              <select class="field" data-solana-action="cluster">
                <option value="devnet">Devnet</option>
                <option value="mainnet-beta">Mainnet Beta</option>
              </select>
            </label>
            <label class="agent-form-label">
              <span>Balance</span>
              <input class="field" data-solana-field="balance" readonly />
            </label>
          </div>
          <label class="agent-form-label">
            <span>Address</span>
            <input class="field solana-address-field" data-solana-field="publicKey" readonly />
          </label>
          <div class="agent-row agent-wrap-row">
            <button class="btn" type="button" data-solana-action="connect">Connect</button>
            <button class="btn" type="button" data-solana-action="refresh">Refresh</button>
            <button class="btn" type="button" data-solana-action="disconnect">Disconnect</button>
            <button class="btn" type="button" data-solana-action="tools">Open Tools</button>
          </div>
        </div>
        <div class="agent-note" data-solana-field="status">Solana wallet detection runs on page load without blocking Agent1c setup.</div>
        <pre class="agent-terminal-output solana-output" data-solana-field="output"></pre>
      </div>
    `;
  }

  function toolsWindowHtml(){
    return `
      <div class="agent-stack solana-panel" data-solana-panel="tools">
        ${solanaPanelHeader("Agent1c Solana Tools")}
        <div class="agent-pane agent-pane-chrome">
          <div class="agent-row agent-wrap-row">
            <button class="btn" type="button" data-solana-action="balance">Read Balance</button>
            <button class="btn" type="button" data-solana-action="tokens">Inspect Token Accounts</button>
            <button class="btn" type="button" data-solana-action="wallet">Open Wallet</button>
          </div>
        </div>
        <div class="agent-pane">
          <div class="agent-setup-title">Devnet Airdrop</div>
          <div class="agent-row">
            <input class="field" data-solana-input="airdropAmount" value="1" />
            <button class="btn" type="button" data-solana-action="airdrop">Request SOL</button>
          </div>
        </div>
        <div class="agent-pane">
          <div class="agent-setup-title">Send SOL Demo Transaction</div>
          <label class="agent-form-label">
            <span>Recipient address</span>
            <input class="field" data-solana-input="sendSolTo" placeholder="Recipient public key" />
          </label>
          <div class="agent-row">
            <input class="field" data-solana-input="sendSolAmount" placeholder="0.01" />
            <button class="btn" type="button" data-solana-action="sendSol">Send SOL</button>
          </div>
        </div>
        <div class="agent-pane">
          <div class="agent-setup-title">Send USDC Demo Transaction</div>
          <label class="agent-form-label">
            <span>Recipient owner address</span>
            <input class="field" data-solana-input="sendUsdcTo" placeholder="Recipient public key" />
          </label>
          <div class="agent-row">
            <input class="field" data-solana-input="sendUsdcAmount" placeholder="1.00" />
            <button class="btn" type="button" data-solana-action="sendUsdc">Send USDC</button>
          </div>
          <div class="agent-note">USDC mint is cluster-aware. Destination associated token account is created idempotently.</div>
        </div>
        <pre class="agent-terminal-output solana-output" data-solana-field="output"></pre>
      </div>
    `;
  }

  function field(root, name){
    return root.querySelector(`[data-solana-field="${name}"]`);
  }

  function setOutput(root, text){
    const out = field(root, "output");
    if (out) out.textContent = safeText(text);
  }

  function transactionResultText(signature){
    return `Signature: ${signature}\nExplorer: ${explorerTxUrl(signature)}`;
  }

  function refreshPanel(root){
    const snap = snapshot();
    const badge = field(root, "badge");
    const clusterSelect = root.querySelector('[data-solana-action="cluster"]');
    const publicKey = field(root, "publicKey");
    const balance = field(root, "balance");
    const status = field(root, "status");
    const provider = field(root, "providerName");

    if (provider) provider.textContent = snap.providerName || "none";
    if (badge) {
      badge.className = `agent-badge ${snap.connected ? "ok" : "warn"}`;
      badge.textContent = snap.connected ? "Connected" : "Disconnected";
    }
    if (clusterSelect) clusterSelect.value = snap.cluster;
    if (publicKey) publicKey.value = snap.publicKey || "";
    if (balance) balance.value = snap.balanceLabel;
    if (status) {
      status.textContent = snap.connected
        ? `${snap.providerName} connected to ${shortAddress(snap.publicKey)} on ${snap.clusterLabel}.`
        : (snap.lastError || "Wallet detection runs on page load. Click Connect if your wallet did not prompt automatically.");
    }
  }

  function refreshSolanaPanels(){
    document.querySelectorAll("[data-solana-panel]").forEach(refreshPanel);
  }

  function openExisting(title){
    const existing = wm?.findWindowByTitle?.(title);
    if (!existing?.id) return false;
    wm.restore?.(existing.id);
    wm.focus?.(existing.id);
    return true;
  }

  function openWalletWindow(){
    if (openExisting("Solana Wallet")) return;
    const win = wm?.createAgentPanelWindow?.("Solana Wallet", {
      panelId: "solana-wallet",
      left: 84,
      top: 132,
      width: 500,
      height: 320,
      closeAsMinimize: true,
    });
    if (!win?.panelRoot) return;
    win.panelRoot.innerHTML = walletWindowHtml();
    wirePanel(win.panelRoot);
    refreshPanel(win.panelRoot);
  }

  function openToolsWindow(){
    if (openExisting("Agent1c Solana Tools")) return;
    const win = wm?.createAgentPanelWindow?.("Agent1c Solana Tools", {
      panelId: "solana-tools",
      left: 614,
      top: 132,
      width: 540,
      height: 560,
      closeAsMinimize: true,
    });
    if (!win?.panelRoot) return;
    win.panelRoot.innerHTML = toolsWindowHtml();
    wirePanel(win.panelRoot);
    refreshPanel(win.panelRoot);
  }

  function wirePanel(root){
    root.addEventListener("click", async event => {
      const buttonEl = event.target.closest("[data-solana-action]");
      if (!buttonEl || buttonEl.tagName === "SELECT") return;
      const action = buttonEl.getAttribute("data-solana-action");
      const input = name => root.querySelector(`[data-solana-input="${name}"]`)?.value || "";
      try {
        if (action === "connect") {
          setOutput(root, "Connecting wallet...");
          await connect();
          setOutput(root, `Connected ${state.providerName}: ${state.publicKey}`);
        } else if (action === "disconnect") {
          await disconnect();
          setOutput(root, "Disconnected.");
        } else if (action === "refresh" || action === "balance") {
          const lamports = await refreshBalance();
          setOutput(root, `Balance: ${formatSol(lamports)}`);
        } else if (action === "tokens") {
          const accounts = await inspectTokenAccounts();
          setOutput(root, accounts.length
            ? accounts.map((acct, i) => `${i + 1}. ${acct.amount} | mint=${acct.mint} | account=${acct.address}`).join("\n")
            : "No token accounts found.");
        } else if (action === "airdrop") {
          setOutput(root, "Requesting devnet airdrop...");
          const sig = await requestAirdrop(input("airdropAmount") || "1");
          setOutput(root, transactionResultText(sig));
        } else if (action === "sendSol") {
          setOutput(root, "Requesting SOL transaction signature...");
          const sig = await sendSol({ to: input("sendSolTo"), amountSol: input("sendSolAmount") });
          setOutput(root, transactionResultText(sig));
        } else if (action === "sendUsdc") {
          setOutput(root, "Requesting USDC transaction signature...");
          const sig = await sendUsdc({ to: input("sendUsdcTo"), amountUsdc: input("sendUsdcAmount") });
          setOutput(root, transactionResultText(sig));
        } else if (action === "tools") {
          openToolsWindow();
        } else if (action === "wallet") {
          openWalletWindow();
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Solana action failed.";
        state.lastError = message;
        emit();
        setOutput(root, `Error: ${message}`);
      }
    });

    root.addEventListener("change", event => {
      const select = event.target.closest('[data-solana-action="cluster"]');
      if (!select) return;
      setCluster(select.value);
    });
  }

  async function runToolCall(name, args = {}){
    const tool = String(name || "").trim().toLowerCase();
    try {
      if (tool === "solana_wallet") {
        const action = String(args.action || "status").trim().toLowerCase();
        if (action === "connect") await connect();
        else if (action === "disconnect") await disconnect();
        else if (action === "refresh") await refreshBalance();
        else if (action === "set_cluster") setCluster(args.cluster || args.network);
        else if (action === "open_wallet") openWalletWindow();
        else if (action === "open_tools") openToolsWindow();
        const snap = snapshot();
        return `TOOL_RESULT solana_wallet ${action}: connected=${snap.connected ? "yes" : "no"} provider=${snap.providerName || "none"} cluster=${snap.cluster} address=${snap.publicKey || "none"} balance=${snap.balanceLabel}`;
      }
      if (tool === "solana_balance") {
        const lamports = await refreshBalance();
        return `TOOL_RESULT solana_balance: ${formatSol(lamports)} address=${state.publicKey} cluster=${state.cluster}`;
      }
      if (tool === "solana_tokens") {
        const accounts = await inspectTokenAccounts();
        if (!accounts.length) return "TOOL_RESULT solana_tokens: no token accounts";
        return `TOOL_RESULT solana_tokens:\n${accounts.map((acct, i) => `${i + 1}. amount=${acct.amount} mint=${acct.mint} account=${acct.address}`).join("\n")}`;
      }
      if (tool === "solana_airdrop") {
        const sig = await requestAirdrop(args.amount || args.amount_sol || "1");
        return `TOOL_RESULT solana_airdrop: signature=${sig} explorer=${explorerTxUrl(sig)}`;
      }
      if (tool === "solana_send_sol") {
        const sig = await sendSol({ to: args.to || args.recipient || args.address, amountSol: args.amount || args.amount_sol });
        return `TOOL_RESULT solana_send_sol: signature=${sig} explorer=${explorerTxUrl(sig)}`;
      }
      if (tool === "solana_send_usdc") {
        const sig = await sendUsdc({ to: args.to || args.recipient || args.address, amountUsdc: args.amount || args.amount_usdc });
        return `TOOL_RESULT solana_send_usdc: signature=${sig} explorer=${explorerTxUrl(sig)}`;
      }
      return `TOOL_RESULT ${name}: unsupported`;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Solana tool failed.";
      state.lastError = message;
      emit();
      return `TOOL_RESULT ${name}: failed (${message})`;
    }
  }

  function handleAppAction(event){
    const action = String(event?.detail?.action || event?.detail?.appId || "").toLowerCase();
    if (action === "solanawallet" || action === "solana_wallet") openWalletWindow();
    if (action === "solanatools" || action === "solana_tools") openToolsWindow();
  }

  function startAutoConnect(){
    if (state.autoConnectAttempted) return;
    state.autoConnectAttempted = true;
    const tryConnect = async () => {
      chooseProvider();
      if (!state.provider) return;
      try {
        await connect({ silent: true });
        if (!state.connected) await connect();
      } catch {
        // Rejection or browser gesture blocking should not affect Agent1c boot.
      }
    };
    setTimeout(tryConnect, 350);
    setTimeout(() => {
      if (!state.provider && !state.connected) tryConnect();
    }, 1200);
  }

  button?.addEventListener("click", () => {
    openWalletWindow();
    if (!state.connected) connect().catch(() => {});
  });

  wm?.registerDesktopShortcut?.("solana-wallet-shortcut", {
    title: "Solana Wallet",
    kind: "app",
    glyph: "SOL",
    order: 12,
    onClick: openWalletWindow,
  });
  wm?.registerDesktopShortcut?.("solana-tools-shortcut", {
    title: "Solana Tools",
    kind: "app",
    glyph: "RPC",
    order: 13,
    onClick: openToolsWindow,
  });

  window.addEventListener("hedgey:app-action", handleAppAction);
  window.addEventListener("hedgey:open-solana-wallet", openWalletWindow);
  window.addEventListener("hedgey:open-solana-tools", openToolsWindow);

  chooseProvider();
  startAutoConnect();

  const api = {
    getState: snapshot,
    connect,
    disconnect,
    setCluster,
    refreshBalance,
    inspectTokenAccounts,
    requestAirdrop,
    sendSol,
    sendUsdc,
    openWalletWindow,
    openToolsWindow,
    runToolCall,
  };
  window.__hedgeySolana = api;
  return api;
}
