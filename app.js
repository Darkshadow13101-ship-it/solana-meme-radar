const tokenList = document.querySelector('#token-list');
const activityList = document.querySelector('#activity-list');
const earlyOpportunities = document.querySelector('#early-opportunities');
const radarPickContent = document.querySelector('#radar-pick-content');
const statTracked = document.querySelector('#stat-tracked');
const statNew = document.querySelector('#stat-new');
const statVolume = document.querySelector('#stat-volume');
const statHot = document.querySelector('#stat-hot');
const statHotScore = document.querySelector('#stat-hot-score');
const marketVolume = document.querySelector('#market-volume');
const marketCaption = document.querySelector('#market-caption');
const socialFeed = document.querySelector('#social-feed');
const socialStatus = document.querySelector('#social-status');

const API = '/api/market';
const UI_REFRESH_MS = 1000;
const DATA_REFRESH_MS = 15000;
const DISCOVERY_REFRESH_MS = 15000;

let lastDataRefresh = 0;
let lastDiscovery = 0;
let activeFilter = 'all';
let searchValue = '';
let previousTokens = new Map();
let breakingEvents = [];
let tokens = [];

const trendClass = v => Number(v) >= 0 ? 'gain' : 'loss';

function fmtUsd(v) {
  v = Number(v);
  if (!Number.isFinite(v)) return '—';
  if (v >= 1) return '$' + v.toLocaleString(undefined, { maximumFractionDigits: 4 });
  if (v >= 0.01) return '$' + v.toFixed(4);
  return '$' + v.toPrecision(4);
}

function fmtCompact(v) {
  v = Number(v);
  if (!Number.isFinite(v)) return '—';
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(1) + 'B';
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
  return '$' + Math.round(v);
}

function fomoScore(p, boost = 0) {
  const h1 = Number(p?.priceChange?.h1 || 0);
  const h24 = Number(p?.priceChange?.h24 || 0);
  const m5 = Number(p?.priceChange?.m5 || 0);
  const m15 = Number(p?.priceChange?.m15 || 0);
  const v5 = Number(p?.volume?.m5 || 0);
  const v1 = Number(p?.volume?.h1 || 0);
  const v24 = Number(p?.volume?.h24 || 0);
  const liq = Number(p?.liquidity?.usd || 0);
  const buys5 = Number(p?.txns?.m5?.buys || 0);
  const sells5 = Number(p?.txns?.m5?.sells || 0);
  const buys1 = Number(p?.txns?.h1?.buys || 0);
  const sells1 = Number(p?.txns?.h1?.sells || 0);
  const tx5 = buys5 + sells5;
  const tx1 = buys1 + sells1;
  const ageHours = p?.pairCreatedAt ? (Date.now() - Number(p.pairCreatedAt)) / 3600000 : 9999;

  const ageBoost = ageHours < 1 ? 18 : ageHours < 3 ? 12 : ageHours < 12 ? 7 : ageHours < 24 ? 3 : 0;
  const acceleration = Math.max(0, Math.min(18, m5 * 1.5 + m15 * 0.6));
  const momentum = Math.max(0, Math.min(16, h1 * 1.2 + h24 * 0.15));
  const volumeAcceleration = v1 > 0 ? Math.min(16, Math.max(0, (v5 / Math.max(1, v1 / 12)) * 8)) : 0;
  const buyPressure5 = tx5 ? Math.max(0, (buys5 / tx5 - 0.5) * 30) : 0;
  const buyPressure1 = tx1 ? Math.max(0, (buys1 / tx1 - 0.5) * 12) : 0;
  const activity = Math.min(10, Math.log10(Math.max(1, tx1)) * 3);
  const volumeLiq = liq ? Math.min(12, (v24 / liq) * 1.8) : 0;
  const boostPoints = Math.min(10, Number(boost || 0) / 8);
  const liquidityPenalty = liq < 25000 ? 35 : liq < 50000 ? 20 : liq < 100000 ? 10 : liq < 250000 ? 3 : 0;
  const rugPenalty = ageHours < 1 && tx5 < 5 ? 8 : 0;

  return Math.max(0, Math.min(100, Math.round(
    22 + ageBoost + acceleration + momentum + volumeAcceleration +
    buyPressure5 + buyPressure1 + activity + volumeLiq + boostPoints -
    liquidityPenalty - rugPenalty
  )));
}

function riskScore(p) {
  const liq = Number(p?.liquidity?.usd || 0);
  const age = p?.pairCreatedAt ? (Date.now() - Number(p.pairCreatedAt)) / 3600000 : 9999;
  const tx = Number(p?.txns?.h1?.buys || 0) + Number(p?.txns?.h1?.sells || 0);
  const v = Number(p?.volume?.h24 || 0);

  let r = 35;
  if (liq < 25000) r += 35;
  else if (liq < 50000) r += 25;
  else if (liq < 100000) r += 15;
  else if (liq < 250000) r += 7;
  if (age < 1) r += 12;
  else if (age < 6) r += 6;
  if (tx < 20) r += 8;
  if (v > 0 && liq > 0 && v / liq > 25) r += 8;
  return Math.max(0, Math.min(100, Math.round(r)));
}

function riskLabel(r) {
  return r >= 70 ? 'HIGH' : r >= 45 ? 'MEDIUM' : 'LOW';
}

function socialScoreForToken(t) {
  const m5 = Number(t?.m5 || 0);
  const h1 = Number(t?.h1 || 0);
  const vol = Number(t?.volume || 0);
  const liq = Number(t?.liquidity || 0);
  const buys = Number(t?.buys || 0);
  const sells = Number(t?.sells || 0);
  const tx = buys + sells;
  const buyRatio = tx ? buys / tx : 0.5;

  // X-free attention proxy: only uses the live on-chain market feed.
  const momentum = Math.max(0, Math.min(45, m5 * 4 + h1 * 0.8));
  const pressure = Math.max(0, Math.min(25, (buyRatio - 0.5) * 50));
  const activity = Math.min(20, Math.log10(Math.max(1, tx)) * 5);
  const turnover = liq > 0 ? Math.min(10, (vol / liq) * 0.5) : 0;

  return Math.max(0, Math.min(100, Math.round(momentum + pressure + activity + turnover)));
}

function combinedScore(t) {
  return Math.max(0, Math.min(100, Math.round(Number(t.fomo || 0) * 0.72 + Number(t.social || 0) * 0.28)));
}

function signalFor(score, p) {
  const liq = Number(p?.liquidity?.usd || 0);
  const age = p?.pairCreatedAt ? (Date.now() - Number(p.pairCreatedAt)) / 3600000 : 9999;
  if (liq < 25000) return 'RISK';
  if (score >= 85 && age < 6) return 'EARLY';
  if (score >= 80) return 'HOT';
  if (score >= 65) return 'WATCH';
  return age < 24 ? 'NEW' : 'WATCH';
}

function detectBreakouts(items) {
  const now = Date.now();
  const events = [];

  items.forEach(t => {
    const prev = previousTokens.get(t.symbol);
    const move5m = Number(t.m5 || 0);
    const moveDelta = prev ? move5m - Number(prev.m5 || 0) : 0;
    const volumeJump = prev?.volume > 0 ? Number(t.volume) / Number(prev.volume) : 0;
    const socialJump = prev ? Number(t.social || 0) - Number(prev.social || 0) : 0;

    if (
      move5m >= 2.5 ||
      moveDelta >= 1.25 ||
      volumeJump >= 1.75 ||
      socialJump >= 20
    ) {
      events.push({
        symbol: t.symbol,
        move: move5m.toFixed(1),
        delta: moveDelta.toFixed(1),
        social: t.social,
        score: t.combined
      });
    }
  });

  if (events.length) {
    const fresh = events.slice(0, 5).map(e => ({ ...e, at: now }));
    const existing = breakingEvents.filter(e => now - e.at < 30000);
    const seen = new Set(existing.map(e => e.symbol));
    breakingEvents = [...existing, ...fresh.filter(e => !seen.has(e.symbol))].slice(0, 5);
  }

  previousTokens = new Map(items.map(t => [
    t.symbol,
    { m5: t.m5, volume: t.volume, social: t.social }
  ]));
}

function renderBreaking() {
  const el = document.querySelector('#breaking-feed');
  if (!el) return;

  breakingEvents = breakingEvents.filter(e => Date.now() - e.at < 90000);
  el.innerHTML = breakingEvents.map(e =>
    `<article class="breaking-item"><span class="breaking-icon">🚨</span><div><b>${e.symbol}</b> <span>BREAKOUT DETECTED</span><small>5m +${e.move}% • Accel +${e.delta || "0.0"}% • Attention ${e.social} • Radar ${e.score}</small></div></article>`
  ).join('') || '<div class="breaking-empty">Watching for sudden moves, volume spikes, and buy pressure…</div>';
}

function tokenRow(t, i) {
  return `<tr>
    <td>${i + 1}</td>
    <td><div class="token-cell"><span class="token-avatar ${t.color}">${t.letter}</span><span><b>${t.symbol}</b><small>${t.name}</small></span></div></td>
    <td>${fmtUsd(t.price)}</td>
    <td class="${trendClass(t.h1)}">${t.h1 >= 0 ? '+' : ''}${t.h1.toFixed(2)}%</td>
    <td class="${trendClass(t.h24)}">${t.h24 >= 0 ? '+' : ''}${t.h24.toFixed(2)}%</td>
    <td>${fmtCompact(t.volume)}</td>
    <td>${fmtCompact(t.liquidity)}</td>
    <td><span class="signal ${t.signal.toLowerCase()}">${t.signal} ${t.combined}</span><small class="risk-mini">${riskLabel(t.risk)} RISK</small></td>
    <td><button class="star" aria-label="Open ${t.symbol}" onclick="window.open('${t.url}','_blank')">↗</button></td>
  </tr>`;
}

function renderTokens(items) {
  if (!tokenList) return;
  tokenList.innerHTML = items.map(tokenRow).join('') || '<tr><td colspan="9">No live tokens matched your search.</td></tr>';
}

function renderFomoLeaderboard(items) {
  const el = document.querySelector('#fomo-leaderboard');
  if (!el) return;

  if (!items.length) {
    el.innerHTML = '<span class="leader-loading">Loading live FOMO rankings…</span>';
    return;
  }

  const top = items.slice(0, 10);
  const cards = top.map((t, i) =>
    `<a class="leader-item" href="${t.url}" target="_blank" rel="noreferrer"><span class="leader-rank">#${i + 1}</span><span class="leader-symbol">${t.symbol}</span><span class="leader-score">${t.combined} RADAR</span><span class="leader-move ${trendClass(t.m5)}">${t.m5 >= 0 ? '+' : ''}${t.m5.toFixed(1)}%</span></a>`
  ).join('');

  el.innerHTML = cards + cards;
}

function renderEarly(items) {
  if (!earlyOpportunities) return;

  earlyOpportunities.innerHTML = items.slice(0, 3).map(t => {
    const age = t.ageHours < 1 ? Math.max(1, Math.round(t.ageHours * 60)) + 'm' : Math.round(t.ageHours) + 'h';
    const buyRatio = Math.round(t.buys / Math.max(1, t.buys + t.sells) * 100);

    return `<article class="early-card">
      <div class="early-head"><div class="token-cell"><span class="token-avatar ${t.color}">${t.letter}</span><span><b>${t.symbol}</b><small>${t.name}</small></span></div><span class="signal ${t.signal.toLowerCase()}">${t.signal}</span></div>
      <div class="early-score"><strong>${t.combined}</strong><span>/100 RADAR</span></div>
      <div class="score-bar"><span style="width:${t.fomo}%"></span></div>
      <div class="early-metrics"><span><small>AGE</small><b>${age}</b></span><span><small>5M</small><b class="${trendClass(t.m5)}">${t.m5 >= 0 ? '+' : ''}${t.m5.toFixed(1)}%</b></span><span><small>1H</small><b class="${trendClass(t.h1)}">${t.h1 >= 0 ? '+' : ''}${t.h1.toFixed(1)}%</b></span><span><small>BUYS</small><b>${buyRatio}%</b></span></div>
      <button class="watch-button" onclick="window.open('${t.url}','_blank')">Open on Axiom <span>↗</span></button>
    </article>`;
  }).join('') || '<p class="opportunity-copy">Waiting for live candidates…</p>';
}

function renderLeader(items) {
  if (!radarPickContent || !items.length) return;

  const t = items[0];
  const buyRatio = Math.round(t.buys / Math.max(1, t.buys + t.sells) * 100);

  radarPickContent.innerHTML = `<div class="opportunity-top"><span class="token-avatar ${t.color}">${t.letter}</span><div><h3 class="token-title">${t.symbol}</h3><p class="muted">${t.name}</p></div><div class="score">${t.combined}<small>/100</small></div></div>
  <div class="score-bar"><span style="width:${t.combined}%"></span></div>
  <p class="opportunity-copy">Top live radar signal based on momentum, volume acceleration, transaction activity, buy pressure, liquidity, pair age and social activity. Signal only — not a prediction.</p>
  <div class="opportunity-metrics"><div><span>5m move</span><strong class="${trendClass(t.m5)}">${t.m5 >= 0 ? '+' : ''}${t.m5.toFixed(2)}%</strong></div><div><span>1h move</span><strong class="${trendClass(t.h1)}">${t.h1 >= 0 ? '+' : ''}${t.h1.toFixed(2)}%</strong></div><div><span>Liquidity</span><strong>${fmtCompact(t.liquidity)}</strong></div><div><span>Buy ratio</span><strong>${buyRatio}%</strong></div></div>
  <button class="watch-button" onclick="window.open('${t.url}','_blank')">Open live pair <span>↗</span></button>`;
}

function renderStats(items) {
  if (!items.length) return;
  if (statTracked) statTracked.textContent = items.length;
  if (statNew) statNew.textContent = items.filter(t => t.ageHours < 24).length;
  if (statVolume) statVolume.textContent = fmtCompact(items.reduce((s, t) => s + t.volume, 0));
  if (statHot) statHot.textContent = items[0].symbol;
  if (statHotScore) statHotScore.textContent = items[0].combined + '/100 RADAR score';
}

function renderActivity(items) {
  if (!activityList) return;

  activityList.innerHTML = items.slice(0, 6).map((a, i) =>
    `<div class="activity-item"><span class="token-avatar activity-avatar">${i + 1}</span><div class="activity-text"><b>${a.symbol}</b> ${a.side} <b>${a.count}</b> trades<br><span class="${a.side === 'buy-heavy' ? 'gain' : 'loss'}">${a.ratio}% buys</span></div><span class="activity-time">5m/1h</span></div>`
  ).join('');
}

function renderMarket(items) {
  const volume = items.reduce((s, t) => s + t.volume, 0);
  if (marketVolume) marketVolume.textContent = fmtCompact(volume);
  if (marketCaption) marketCaption.textContent = `${items.length} live Solana radar candidates • data refresh 5s`;
}

function renderFilteredTokens() {
  const q = searchValue.trim();
  let list = tokens;

  if (activeFilter !== 'all') {
    list = list.filter(t =>
      activeFilter === 'trending' ? t.combined >= 65 :
      activeFilter === 'gainers' ? t.h24 > 0 :
      activeFilter === 'new' ? t.ageHours < 24 : true
    );
  }

  if (q) list = list.filter(t => `${t.symbol} ${t.name} ${t.address || ''}`.toLowerCase().includes(q));
  renderTokens(list);
}

function updateLiveClock() {
  const el = document.querySelector('#live-clock');
  if (el) el.textContent = 'LIVE • ' + new Date().toLocaleTimeString();
}

async function getJson(path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    const res = await fetch(API, { cache: 'no-store', signal: controller.signal });
    if (!res.ok) throw new Error(path + ' -> ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchLiveData() {
  try {
    const now = Date.now();
    if (now - lastDataRefresh < DATA_REFRESH_MS && tokens.length) return;
    lastDataRefresh = now;

    // Use GeckoTerminal's trending pool payload directly.
    // The public API is rate-limited, so avoid making one request per token.
    const data = await getJson('');
    const pools = Array.isArray(data?.data) ? data.data.slice(0, 20) : [];

    const fresh = pools.map(pool => {
      const a = pool?.attributes || {};
      const base = String(pool?.relationships?.base_token?.data?.id || pool?.id || '')
        .replace(/^solana_/, '')
        .trim();
      const pairName = String(a.name || 'UNKNOWN / SOL').split(' / ');
      const symbol = pairName[0] || 'UNKNOWN';
      const pc = a.price_change_percentage || {};
      const vol = a.volume_usd || {};
      const tx = a.transactions || {};

      const p = {
        baseToken: { symbol, name: symbol },
        priceUsd: a.base_token_price_usd,
        priceChange: {
          m5: pc.m5, m15: pc.m15, h1: pc.h1, h24: pc.h24
        },
        volume: {
          m5: vol.m5, h1: vol.h1, h24: vol.h24
        },
        liquidity: { usd: a.reserve_in_usd },
        txns: {
          m5: { buys: tx.m5?.buys, sells: tx.m5?.sells },
          h1: { buys: tx.h1?.buys, sells: tx.h1?.sells },
          h24: { buys: tx.h24?.buys, sells: tx.h24?.sells }
        },
        pairCreatedAt: a.pool_created_at ? Date.parse(a.pool_created_at) : undefined,
        url: base ? 'https://axiom.trade/' + base : 'https://axiom.trade/'
      };

      return { address: base, pair: p };
    }).filter(x => x.address);

    const mapped = fresh.map(r => {
      const p = r.pair;
      const score = fomoScore(p);
      const buys = Number(p.txns?.h24?.buys || 0);
      const sells = Number(p.txns?.h24?.sells || 0);
      const ageHours = p.pairCreatedAt ? (Date.now() - Number(p.pairCreatedAt)) / 3600000 : 9999;

      return {
        address: r.address,
        symbol: p.baseToken.symbol,
        name: p.baseToken.name,
        letter: p.baseToken.symbol.slice(0, 1).toUpperCase(),
        color: ['orange', 'purple', 'pink', 'blue', 'yellow'][Math.abs(p.baseToken.symbol.charCodeAt(0)) % 5],
        price: Number(p.priceUsd || 0),
        m5: Number(p.priceChange.m5 || 0),
        h1: Number(p.priceChange.h1 || 0),
        h24: Number(p.priceChange.h24 || 0),
        volume: Number(p.volume.h24 || 0),
        liquidity: Number(p.liquidity.usd || 0),
        fomo: score,
        social: 0,
        combined: score,
        risk: riskScore(p),
        signal: signalFor(score, p),
        url: p.url,
        buys,
        sells,
        ageHours
      };
    });

    if (!mapped.length) throw new Error('No live Solana trending pools returned');

    mapped.forEach(t => {
      t.social = socialScoreForToken(t);
      t.combined = combinedScore(t);
      t.signal = signalFor(t.combined, {
        liquidity: { usd: t.liquidity },
        pairCreatedAt: t.ageHours < 9999 ? Date.now() - t.ageHours * 3600000 : undefined
      });
    });

    detectBreakouts(mapped);
    tokens = mapped.sort((a, b) => b.combined - a.combined);

    renderBreaking();
    renderAttentionRadar();
    renderTokens(tokens);
    renderEarly(tokens);
    renderLeader(tokens);
    renderStats(tokens);
    renderMarket(tokens);
    renderFomoLeaderboard(tokens);
    renderActivity(tokens.map(t => ({
      symbol: t.symbol,
      side: t.buys >= t.sells ? 'buy-heavy' : 'sell-heavy',
      count: t.buys + t.sells,
      ratio: Math.round(t.buys / Math.max(1, t.buys + t.sells) * 100)
    })));
    updateLiveClock();
  } catch (err) {
    console.error('Moonwatch feed error:', err);
    if (!tokens.length && tokenList) {
      tokenList.innerHTML = '<tr><td colspan="9">Live market feed unavailable — retrying…</td></tr>';
    }
  }
}
function renderAttentionRadar() {
  if (!socialFeed) return;

  const top = [...tokens]
    .sort((a, b) => Number(b.social || 0) - Number(a.social || 0))
    .slice(0, 6);

  socialFeed.innerHTML = top.map(t => {
    const tx = Number(t.buys || 0) + Number(t.sells || 0);
    const buyRatio = Math.round(Number(t.buys || 0) / Math.max(1, tx) * 100);
    return `<article class="social-post"><a href="${t.url}" target="_blank" rel="noreferrer"><div class="social-meta"><span><span class="social-author">${t.symbol}</span> ${t.name}</span><span class="social-score">${t.social} ATTENTION</span></div><p class="social-text">Live on-chain attention signal: ${buyRatio}% buys, ${tx.toLocaleString()} recent trades, +${Number(t.m5 || 0).toFixed(1)}% in 5m.</p><div class="social-stats">Volume ${fmtCompact(t.volume)} · Liquidity ${fmtCompact(t.liquidity)}<span class="social-tags">ON-CHAIN</span></div></a></article>`;
  }).join('') || '<p class="opportunity-copy">Waiting for live market signals…</p>';

  if (socialStatus) socialStatus.textContent = 'ON-CHAIN LIVE • ' + new Date().toLocaleTimeString();
}

document.querySelectorAll('.filter').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelector('.filter.active')?.classList.remove('active');
    button.classList.add('active');
    activeFilter = button.dataset.filter || 'all';
    renderFilteredTokens();
  });
});

document.querySelector('#search')?.addEventListener('input', e => {
  searchValue = e.target.value.toLowerCase();
  renderFilteredTokens();
});

async function connectFomoWallet() {
  const button = document.querySelector('#wallet-button');
  const provider = window.phantom?.solana || window.solana;

  if (!provider?.isPhantom) {
    window.open('https://phantom.app/', '_blank', 'noopener,noreferrer');
    return;
  }

  try {
    const response = await provider.connect();
    const address = response?.publicKey?.toString?.() || provider.publicKey?.toString?.();
    if (address && button) {
      button.textContent = address.slice(0, 4) + '…' + address.slice(-4);
      button.classList.add('connected');
      button.title = address;
    }
  } catch (err) {
    console.error('Wallet connection cancelled:', err);
  }
}

document.querySelector('#wallet-button')?.addEventListener('click', connectFomoWallet);

fetchLiveData();
setInterval(fetchLiveData, UI_REFRESH_MS);
setInterval(updateLiveClock, 1000);
