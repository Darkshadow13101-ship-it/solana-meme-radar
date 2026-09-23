const API_BASE = 'https://api.dexscreener.com';
const REFRESH_INTERVAL_MS = 60_000;
let livePairs = [];
let activeFilter = 'all';

const tokenList = document.querySelector('#token-list');
const activityList = document.querySelector('#activity-list');
const liveStatus = document.querySelector('#live-status');
const refreshButton = document.querySelector('#refresh-button');

function formatCurrency(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 2 }).format(amount);
}

function formatPrice(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return '—';
  return amount < 0.01 ? `$${amount.toPrecision(3)}` : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: amount < 1 ? 5 : 3 }).format(amount);
}

function formatPercent(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  return `${amount > 0 ? '+' : ''}${amount.toFixed(2)}%`;
}

function formatAge(timestamp) {
  if (!timestamp) return 'recently';
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}

function avatar(pair) {
  const initial = (pair.baseToken?.symbol || '?').slice(0, 1).toUpperCase();
  const image = pair.info?.imageUrl;
  return image ? `<img class="token-avatar token-image" src="${image}" alt="" />` : `<span class="token-avatar purple">${initial}</span>`;
}

function dexUrl(pair) {
  return `https://dexscreener.com/solana/${pair.pairAddress}`;
}

function renderTokens() {
  const query = document.querySelector('#search').value.trim().toLowerCase();
  let pairs = livePairs.filter(pair => `${pair.baseToken?.symbol || ''} ${pair.baseToken?.name || ''} ${pair.baseToken?.address || ''}`.toLowerCase().includes(query));
  if (activeFilter === 'new') pairs = pairs.filter(pair => Date.now() - pair.pairCreatedAt < 86_400_000);
  if (activeFilter === 'gainers') pairs = pairs.filter(pair => Number(pair.priceChange?.h24) > 0).sort((a, b) => Number(b.priceChange?.h24) - Number(a.priceChange?.h24));
  if (activeFilter === 'trending') pairs = pairs.sort((a, b) => Number(b.volume?.h24) - Number(a.volume?.h24));

  tokenList.innerHTML = pairs.length ? pairs.slice(0, 20).map((pair, index) => {
    const hourly = Number(pair.priceChange?.h1);
    const daily = Number(pair.priceChange?.h24);
    const signal = daily >= 20 ? 'HOT' : daily > 0 ? 'WATCH' : 'LIVE';
    return `<tr><td>${index + 1}</td><td><a class="token-cell token-link" href="${dexUrl(pair)}" target="_blank" rel="noreferrer">${avatar(pair)}<span><b>${pair.baseToken?.symbol || 'Unknown'}</b><small>${pair.baseToken?.name || 'Unnamed token'}</small></span></a></td><td>${formatPrice(pair.priceUsd)}</td><td class="${hourly >= 0 ? 'gain' : 'loss'}">${formatPercent(hourly)}</td><td class="${daily >= 0 ? 'gain' : 'loss'}">${formatPercent(daily)}</td><td>${formatCurrency(pair.volume?.h24)}</td><td>${formatCurrency(pair.liquidity?.usd)}</td><td><span class="signal ${signal.toLowerCase()}">${signal}</span></td><td><a class="star" href="${dexUrl(pair)}" target="_blank" rel="noreferrer" aria-label="Open ${pair.baseToken?.symbol || 'token'} on Dexscreener">↗</a></td></tr>`;
  }).join('') : '<tr><td colspan="9" class="empty-state">No live Solana pairs matched this filter.</td></tr>';
}

function renderActivity() {
  const pairs = [...livePairs].sort((a, b) => Number(b.volume?.h1) - Number(a.volume?.h1)).slice(0, 3);
  activityList.innerHTML = pairs.length ? pairs.map((pair, index) => {
    const change = Number(pair.priceChange?.h1);
    return `<a class="activity-item activity-link" href="${dexUrl(pair)}" target="_blank" rel="noreferrer">${avatar(pair)}<div class="activity-text"><b>${pair.baseToken?.symbol || 'Unknown'}</b> traded <b>${formatCurrency(pair.volume?.h1)}</b><br><span class="${change >= 0 ? 'gain' : 'loss'}">${formatPercent(change)} in the last hour</span></div><span class="activity-time">${formatAge(pair.pairCreatedAt)}</span></a>`;
  }).join('') : '<p class="opportunity-copy">Live pair activity will appear once market data loads.</p>';
}

function renderRadarPick() {
  const pick = [...livePairs].sort((a, b) => Number(b.volume?.h24) - Number(a.volume?.h24))[0];
  const container = document.querySelector('#radar-pick-content');
  if (!pick) return;
  const change = Number(pick.priceChange?.h24);
  container.innerHTML = `<div class="opportunity-top">${avatar(pick)}<div><p class="token-title">${pick.baseToken?.symbol || 'Unknown'}</p><p class="muted">${pick.baseToken?.name || 'Unnamed token'}</p></div><span class="score ${change >= 0 ? 'gain' : 'loss'}">${formatPercent(change)} <small>24h</small></span></div><p class="opportunity-copy">Highest 24-hour volume in the live Solana pairs currently shown. This is market data, not a recommendation.</p><div class="opportunity-metrics"><div><span>24h volume</span><strong>${formatCurrency(pick.volume?.h24)}</strong></div><div><span>Liquidity</span><strong>${formatCurrency(pick.liquidity?.usd)}</strong></div></div><a class="watch-button" href="${dexUrl(pick)}" target="_blank" rel="noreferrer">Open on Dexscreener <span>↗</span></a>`;
}

function renderSummary() {
  const volume = livePairs.reduce((sum, pair) => sum + (Number(pair.volume?.h24) || 0), 0);
  const newPairs = livePairs.filter(pair => Date.now() - pair.pairCreatedAt < 86_400_000).length;
  const hot = [...livePairs].sort((a, b) => Number(b.volume?.h24) - Number(a.volume?.h24))[0];
  document.querySelector('#pairs-tracked').textContent = livePairs.length;
  document.querySelector('#new-pairs').textContent = newPairs;
  document.querySelector('#volume-24h').textContent = formatCurrency(volume);
  document.querySelector('#hot-token').textContent = hot ? `$${hot.baseToken?.symbol || '—'}` : '—';
  document.querySelector('#market-volume').textContent = formatCurrency(volume);
  document.querySelector('#market-caption').textContent = `${livePairs.length} live Solana pairs`;
  document.querySelector('#last-updated').textContent = `Updated ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

async function fetchLivePairs() {
  const boostsResponse = await fetch(`${API_BASE}/token-boosts/top/v1`);
  if (!boostsResponse.ok) throw new Error(`Market API returned ${boostsResponse.status}`);
  const boostedTokens = await boostsResponse.json();
  const addresses = [...new Set(boostedTokens.filter(token => token.chainId === 'solana').map(token => token.tokenAddress))].slice(0, 30);
  if (!addresses.length) throw new Error('No live Solana tokens were returned');
  const pairsResponse = await fetch(`${API_BASE}/tokens/v1/solana/${addresses.join(',')}`);
  if (!pairsResponse.ok) throw new Error(`Pair API returned ${pairsResponse.status}`);
  const pairs = await pairsResponse.json();
  return pairs.filter(pair => pair.chainId === 'solana' && pair.priceUsd && pair.liquidity?.usd).sort((a, b) => Number(b.volume?.h24) - Number(a.volume?.h24));
}

async function refreshLiveData() {
  refreshButton.disabled = true;
  refreshButton.innerHTML = 'Refreshing <span>↻</span>';
  liveStatus.textContent = 'Refreshing live market data…';
  try {
    livePairs = await fetchLivePairs();
    renderSummary();
    renderTokens();
    renderActivity();
    renderRadarPick();
    liveStatus.textContent = `Live via Dexscreener · refreshed just now`;
  } catch (error) {
    console.error(error);
    liveStatus.textContent = 'Live data is temporarily unavailable. Try refresh.';
    tokenList.innerHTML = '<tr><td colspan="9" class="empty-state">Could not load live market data. Please try again shortly.</td></tr>';
    activityList.innerHTML = '<p class="opportunity-copy">The live market feed is temporarily unavailable.</p>';
  } finally {
    refreshButton.disabled = false;
    refreshButton.innerHTML = 'Refresh <span>↻</span>';
  }
}

document.querySelectorAll('.filter').forEach(button => button.addEventListener('click', () => {
  document.querySelector('.filter.active').classList.remove('active');
  button.classList.add('active');
  activeFilter = button.dataset.filter;
  renderTokens();
}));
document.querySelector('#search').addEventListener('input', renderTokens);
refreshButton.addEventListener('click', refreshLiveData);
refreshLiveData();
setInterval(refreshLiveData, REFRESH_INTERVAL_MS);
