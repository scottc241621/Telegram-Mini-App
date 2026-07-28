// ---------------------------------------------------------------------------
// CryptoPulse Mini App
// Data source: CoinGecko public API (no key required)
// ---------------------------------------------------------------------------

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";
const CHECK_INTERVAL_MS = 30000; // check alerts every 30s while app is open
const ALERTS_KEY = "cryptopulse_alerts";

// ---------------------------------------------------------------------------
// Telegram WebApp integration (safe no-op if opened outside Telegram)
// ---------------------------------------------------------------------------
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  if (tg.setHeaderColor) {
    try { tg.setHeaderColor("secondary_bg_color"); } catch (e) {}
  }
}

function haptic(type = "light") {
  try {
    if (tg?.HapticFeedback) {
      if (type === "success") tg.HapticFeedback.notificationOccurred("success");
      else tg.HapticFeedback.impactOccurred(type);
    }
  } catch (e) {}
}

// ---------------------------------------------------------------------------
// Coin list cache (id/symbol/name lookup)
// ---------------------------------------------------------------------------
let coinListCache = null;

async function getCoinList() {
  if (coinListCache) return coinListCache;
  const res = await fetch(`${COINGECKO_BASE}/coins/list`);
  coinListCache = await res.json();
  return coinListCache;
}

async function resolveCoin(query) {
  const q = query.toLowerCase().trim();
  const coins = await getCoinList();

  let matches = coins.filter((c) => c.symbol.toLowerCase() === q);
  if (matches.length) {
    matches.sort((a, b) => a.id.length - b.id.length);
    return matches[0];
  }

  matches = coins.filter((c) => c.id === q);
  if (matches.length) return matches[0];

  matches = coins.filter((c) => c.name.toLowerCase() === q);
  if (matches.length) return matches[0];

  return null;
}

async function fetchPrice(coinId) {
  const res = await fetch(
    `${COINGECKO_BASE}/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true`
  );
  const data = await res.json();
  return data[coinId];
}

async function fetchTopCoins(limit = 10) {
  const res = await fetch(
    `${COINGECKO_BASE}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${limit}&page=1&sparkline=false`
  );
  return res.json();
}

// ---------------------------------------------------------------------------
// Alerts storage (localStorage)
// ---------------------------------------------------------------------------
function getAlerts() {
  try {
    return JSON.parse(localStorage.getItem(ALERTS_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function saveAlerts(alerts) {
  localStorage.setItem(ALERTS_KEY, JSON.stringify(alerts));
}

function addAlert(coinId, symbol, targetPrice, direction) {
  const alerts = getAlerts();
  const alert = {
    id: Date.now(),
    coinId,
    symbol: symbol.toUpperCase(),
    targetPrice,
    direction,
  };
  alerts.push(alert);
  saveAlerts(alerts);
  return alert;
}

function removeAlert(id) {
  const alerts = getAlerts().filter((a) => a.id !== id);
  saveAlerts(alerts);
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------
function showToast(message, duration = 3500) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.add("hidden"), duration);
}

function formatPrice(price) {
  if (price >= 1) return price.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return price.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
    haptic("light");
    if (btn.dataset.tab === "alerts") renderAlerts();
  });
});

// ---------------------------------------------------------------------------
// Market tab — top coins
// ---------------------------------------------------------------------------
async function renderTopCoins() {
  const container = document.getElementById("topCoinsList");
  container.innerHTML = `<div class="loading">Loading market data…</div>`;
  try {
    const coins = await fetchTopCoins(10);
    container.innerHTML = "";
    coins.forEach((c, i) => {
      const change = c.price_change_percentage_24h || 0;
      const changeClass = change >= 0 ? "up" : "down";
      const arrow = change >= 0 ? "▲" : "▼";

      const card = document.createElement("div");
      card.className = "coin-card";
      card.innerHTML = `
        <div class="coin-card-left">
          <span class="coin-rank">${i + 1}</span>
          <img class="coin-icon" src="${c.image}" alt="${c.symbol}" />
          <div>
            <div class="coin-name">${c.name}</div>
            <div class="coin-symbol">${c.symbol}</div>
          </div>
        </div>
        <div class="coin-card-right">
          <div class="coin-price">$${formatPrice(c.current_price)}</div>
          <div class="coin-change ${changeClass}">${arrow} ${Math.abs(change).toFixed(2)}%</div>
        </div>
      `;
      container.appendChild(card);
    });
  } catch (e) {
    container.innerHTML = `<div class="loading">⚠️ Couldn't load market data. Pull to refresh.</div>`;
  }
}

document.getElementById("refreshBtn").addEventListener("click", () => {
  haptic("light");
  renderTopCoins();
});

// ---------------------------------------------------------------------------
// Market tab — search
// ---------------------------------------------------------------------------
async function handleSearch() {
  const query = document.getElementById("coinSearch").value.trim();
  const resultBox = document.getElementById("searchResult");

  if (!query) return;

  resultBox.classList.remove("hidden");
  resultBox.innerHTML = `<div class="loading">Searching…</div>`;

  try {
    const coin = await resolveCoin(query);
    if (!coin) {
      resultBox.innerHTML = `<div class="loading">❌ No match for "${query}"</div>`;
      return;
    }

    const priceData = await fetchPrice(coin.id);
    if (!priceData) {
      resultBox.innerHTML = `<div class="loading">⚠️ No price data available</div>`;
      return;
    }

    const change = priceData.usd_24h_change || 0;
    const changeClass = change >= 0 ? "up" : "down";
    const arrow = change >= 0 ? "▲" : "▼";

    resultBox.innerHTML = `
      <div class="coin-card">
        <div class="coin-card-left">
          <div>
            <div class="coin-name">${coin.name}</div>
            <div class="coin-symbol">${coin.symbol}</div>
          </div>
        </div>
        <div class="coin-card-right">
          <div class="coin-price">$${formatPrice(priceData.usd)}</div>
          <div class="coin-change ${changeClass}">${arrow} ${Math.abs(change).toFixed(2)}%</div>
        </div>
      </div>
    `;
    haptic("light");
  } catch (e) {
    resultBox.innerHTML = `<div class="loading">⚠️ Search failed. Try again.</div>`;
  }
}

document.getElementById("searchBtn").addEventListener("click", handleSearch);
document.getElementById("coinSearch").addEventListener("keypress", (e) => {
  if (e.key === "Enter") handleSearch();
});

// ---------------------------------------------------------------------------
// Alerts tab
// ---------------------------------------------------------------------------
async function handleAddAlert() {
  const coinInput = document.getElementById("alertCoin").value.trim();
  const priceInput = document.getElementById("alertPrice").value.trim();
  const direction = document.getElementById("alertDirection").value;

  if (!coinInput || !priceInput) {
    showToast("Enter a coin and target price.");
    return;
  }

  const targetPrice = parseFloat(priceInput);
  if (isNaN(targetPrice) || targetPrice <= 0) {
    showToast("Enter a valid price.");
    return;
  }

  const btn = document.getElementById("addAlertBtn");
  btn.disabled = true;
  btn.textContent = "Setting…";

  try {
    const coin = await resolveCoin(coinInput);
    if (!coin) {
      showToast(`Couldn't find "${coinInput}"`);
      return;
    }

    addAlert(coin.id, coin.symbol, targetPrice, direction);
    document.getElementById("alertCoin").value = "";
    document.getElementById("alertPrice").value = "";
    renderAlerts();
    showToast(`✅ Alert set: ${coin.symbol.toUpperCase()} ${direction} $${targetPrice}`);
    haptic("success");
  } catch (e) {
    showToast("Something went wrong. Try again.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Set Alert";
  }
}

document.getElementById("addAlertBtn").addEventListener("click", handleAddAlert);

function renderAlerts() {
  const container = document.getElementById("alertsList");
  const alerts = getAlerts();

  if (!alerts.length) {
    container.innerHTML = `<p class="empty-state">No alerts yet. Set one above.</p>`;
    return;
  }

  container.innerHTML = "";
  alerts.forEach((a) => {
    const card = document.createElement("div");
    card.className = "alert-card";
    card.innerHTML = `
      <div class="alert-card-info">
        <div class="alert-card-title">${a.symbol} ${a.direction} $${formatPrice(a.targetPrice)}</div>
        <div class="alert-card-sub">Watching live</div>
      </div>
      <button class="delete-btn" data-id="${a.id}">✕</button>
    `;
    container.appendChild(card);
  });

  container.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      removeAlert(parseInt(btn.dataset.id));
      renderAlerts();
      haptic("light");
    });
  });
}

// ---------------------------------------------------------------------------
// Background alert checker (runs while app is open)
// ---------------------------------------------------------------------------
async function checkAlerts() {
  const alerts = getAlerts();
  if (!alerts.length) return;

  const uniqueCoinIds = [...new Set(alerts.map((a) => a.coinId))];
  const prices = {};

  for (const coinId of uniqueCoinIds) {
    try {
      const data = await fetchPrice(coinId);
      if (data) prices[coinId] = data.usd;
    } catch (e) {
      // skip on failure, try again next cycle
    }
  }

  let remaining = [...alerts];
  let triggeredAny = false;

  for (const alert of alerts) {
    const current = prices[alert.coinId];
    if (current === undefined) continue;

    const triggered =
      (alert.direction === "above" && current >= alert.targetPrice) ||
      (alert.direction === "below" && current <= alert.targetPrice);

    if (triggered) {
      triggeredAny = true;
      showToast(`🔔 ${alert.symbol} is now $${formatPrice(current)} (${alert.direction} $${formatPrice(alert.targetPrice)})`, 6000);
      haptic("success");

      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("CryptoPulse Alert", {
          body: `${alert.symbol} is now $${formatPrice(current)}`,
        });
      }

      remaining = remaining.filter((a) => a.id !== alert.id);
    }
  }

  if (triggeredAny) {
    saveAlerts(remaining);
    renderAlerts();
  }
}

// Ask for browser notification permission (works when opened as a regular webpage too)
if ("Notification" in window && Notification.permission === "default") {
  Notification.requestPermission();
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
renderTopCoins();
renderAlerts();
setInterval(checkAlerts, CHECK_INTERVAL_MS);
setInterval(renderTopCoins, 60000); // refresh market data every 60s
