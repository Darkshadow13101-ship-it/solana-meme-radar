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

const API = 'https://api.dexscreener.com';
const REFRESH_MS = 30000;
let tokens = [];

const trendClass = v => Number(v) >= 0 ? 'gain' : 'loss';
const fmtUsd = v => {
  v = Number(v);
  if (!Number.isFinite(v)) return '—';
  if (v >= 1) return '$' + v.toLocaleString(undefined, { maximumFractionDigits: 4 });
  if (v >= 0.01) return '$' + v.toFixed(4);
  return '$' + v.toPrecision(4);
};
const fmtCompact = v => {
  v = Number(v);
  if (!Number.isFinite(v)) return '—';
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(1) + 'B';
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
  return '$' + Math.round(v);
};

function fomoScore(p, boost) {
  const h1 = Number(p?.priceChange?.h1 || 0), h24 = Number(p?.priceChange?.h24 || 0);
  const m5 = Number(p?.priceChange?.m5 || 0), m15 = Number(p?.priceChange?.m15 || 0);
  const v5 = Number(p?.volume?.m5 || 0), v1 = Number(p?.volume?.h1 || 0), v24 = Number(p?.volume?.h24 || 0);
  const liq = Number(p?.liquidity?.usd || 0);
  const buys5 = Number(p?.txns?.m5?.buys || 0), sells5 = Number(p?.txns?.m5?.sells || 0);
  const buys1 = Number(p?.txns?.h1?.buys || 0), sells1 = Number(p?.txns?.h1?.sells || 0);
  const tx5 = buys5 + sells5, tx1 = buys1 + sells1;
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
  return Math.max(0, Math.min(100, Math.round(22 + ageBoost + acceleration + momentum + volumeAcceleration + buyPressure5 + buyPressure1 + activity + volumeLiq + boostPoints - liquidityPenalty - rugPenalty)));
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
function tokenRow(t, i) {
  return `<tr><td>${i + 1}</td><td><div class="token-cell"><span class="token-avatar ${t.color}">${t.letter}</span><span><b>${t.symbol}</b><small>${t.name}</small></span></div></td><td>${fmtUsd(t.price)}</td><td class="${trendClass(t.h1)}">${t.h1 >= 0 ? '+' : ''}${t.h1.toFixed(2)}%</td><td class="${trendClass(t.h24)}">${t.h24 >= 0 ? '+' : ''}${t.h24.toFixed(2)}%</td><td>${fmtCompact(t.volume)}</td><td>${fmtCompact(t.liquidity)}</td><td><span class="signal ${t.signal.toLowerCase()}">${t.signal} ${t.fomo}</span></td><td><button class="star" aria-label="Open ${t.symbol}" onclick="window.open('${t.url}','_blank')">↗</button></td></tr>`;
}
function renderFomoLeaderboard(items){const el=document.querySelector('#fomo-leaderboard');if(!el||!items.length)return;const top=items.slice(0,10);const cards=top.map((t,i)=>`<a class="leader-item" href="${t.url}" target="_blank" rel="noreferrer"><span class="leader-rank">#${i+1}</span><span class="leader-symbol">${t.symbol}</span><span class="leader-score">${t.fomo} FOMO</span><span class="leader-move ${trendClass(t.m5)}">${t.m5>=0?'+':''}${t.m5.toFixed(1)}%</span></a>`).join('');el.innerHTML=cards+cards;}
async function connectFomoWallet(){const button=document.querySelector('#wallet-button');const provider=window.phantom?.solana||window.solana;if(!provider?.isPhantom){window.open('https://phantom.app/','_blank','noopener,noreferrer');return;}try{const response=await provider.connect();const address=response?.publicKey?.toString?.()||provider.publicKey?.toString?.();if(address&&button){button.textContent=address.slice(0,4)+'…'+address.slice(-4);button.classList.add('connected');button.title=address;}}catch(err){console.error('Wallet connection cancelled:',err);}}
document.querySelector('#wallet-button')?.addEventListener('click',connectFomoWallet);

function renderTokens(items) {
  if (!tokenList) return;
  tokenList.innerHTML = items.map(tokenRow).join('') || '<tr><td colspan="9">No live tokens matched your search.</td></tr>';
}
function renderEarly(items) {
  if (!earlyOpportunities) return;
  earlyOpportunities.innerHTML = items.slice(0, 3).map(t => {
    const age = t.ageHours < 1 ? Math.max(1, Math.round(t.ageHours * 60)) + 'm' : Math.round(t.ageHours) + 'h';
    const buyRatio = Math.round(t.buys / Math.max(1, t.buys + t.sells) * 100);
    return `<article class="early-card"><div class="early-head"><div class="token-cell"><span class="token-avatar ${t.color}">${t.letter}</span><span><b>${t.symbol}</b><small>${t.name}</small></span></div><span class="signal ${t.signal.toLowerCase()}">${t.signal}</span></div><div class="early-score"><strong>${t.fomo}</strong><span>/100 FOMO</span></div><div class="score-bar"><span style="width:${t.fomo}%"></span></div><div class="early-metrics"><span><small>AGE</small><b>${age}</b></span><span><small>5M</small><b class="${trendClass(t.m5)}">${t.m5 >= 0 ? '+' : ''}${t.m5.toFixed(1)}%</b></span><span><small>1H</small><b class="${trendClass(t.h1)}">${t.h1 >= 0 ? '+' : ''}${t.h1.toFixed(1)}%</b></span><span><small>BUYS</small><b>${buyRatio}%</b></span></div><button class="watch-button" onclick="window.open('${t.url}','_blank')">Open on Dexscreener <span>↗</span></button></article>`;
  }).join('') || '<p class="opportunity-copy">Waiting for live candidates…</p>';
}
function renderLeader(items) {
  if (!radarPickContent || !items.length) return;
  const t = items[0], buyRatio = Math.round(t.buys / Math.max(1, t.buys + t.sells) * 100);
  radarPickContent.innerHTML = `<div class="opportunity-top"><span class="token-avatar ${t.color}">${t.letter}</span><div><h3 class="token-title">${t.symbol}</h3><p class="muted">${t.name}</p></div><div class="score">${t.fomo}<small>/100</small></div></div><div class="score-bar"><span style="width:${t.fomo}%"></span></div><p class="opportunity-copy">Top live radar signal based on fresh momentum, volume acceleration, transaction activity, buy pressure, liquidity and pair age. Signal only — not a prediction.</p><div class="opportunity-metrics"><div><span>5m move</span><strong class="${trendClass(t.m5)}">${t.m5 >= 0 ? '+' : ''}${t.m5.toFixed(2)}%</strong></div><div><span>1h move</span><strong class="${trendClass(t.h1)}">${t.h1 >= 0 ? '+' : ''}${t.h1.toFixed(2)}%</strong></div><div><span>Liquidity</span><strong>${fmtCompact(t.liquidity)}</strong></div><div><span>Buy ratio</span><strong>${buyRatio}%</strong></div></div><button class="watch-button" onclick="window.open('${t.url}','_blank')">Open live pair <span>↗</span></button>`;
}
function renderStats(items) {
  if (!items.length) return;
  if (statTracked) statTracked.textContent = items.length;
  if (statNew) statNew.textContent = items.filter(t => t.ageHours < 24).length;
  if (statVolume) statVolume.textContent = fmtCompact(items.reduce((s, t) => s + t.volume, 0));
  if (statHot) statHot.textContent = items[0].symbol;
  if (statHotScore) statHotScore.textContent = items[0].fomo + '/100 FOMO score';
}
function renderActivity(items) {
  if (!activityList) return;
  activityList.innerHTML = items.slice(0, 6).map((a, i) => `<div class="activity-item"><span class="token-avatar activity-avatar">${i + 1}</span><div class="activity-text"><b>${a.symbol}</b> ${a.side} <b>${a.count}</b> trades<br><span class="${a.side === 'buy-heavy' ? 'gain' : 'loss'}">${a.ratio}% buys</span></div><span class="activity-time">5m/1h</span></div>`).join('');
}
function renderMarket(items) {
  const volume = items.reduce((s, t) => s + t.volume, 0);
  if (marketVolume) marketVolume.textContent = fmtCompact(volume);
  if (marketCaption) marketCaption.textContent = `${items.length} live Solana radar candidates • refreshes every 30s`;
}
async function getJson(path) {
  const res = await fetch(API + path, { cache: 'no-store' });
  if (!res.ok) throw new Error(path + ' -> ' + res.status);
  return res.json();
}
async function fetchLiveData() {
  try {
    const [boosts, profiles] = await Promise.all([getJson('/token-boosts/latest/v1'), getJson('/token-profiles/latest/v1')]);
    const candidates = new Map();
    [...(Array.isArray(boosts) ? boosts : []), ...(Array.isArray(profiles) ? profiles : [])].filter(x => x.chainId === 'solana' && x.tokenAddress).forEach(x => candidates.set(x.tokenAddress, x));
    const addresses = [...candidates.keys()].slice(0, 40);
    const results = await Promise.allSettled(addresses.map(async address => {
      const data = await getJson('/latest/dex/tokens/' + address);
      const pairs = (data.pairs || []).filter(p => p.chainId === 'solana' && p.liquidity?.usd);
      return { meta: candidates.get(address), pair: pairs.sort((a, b) => Number(b.volume?.h24 || 0) - Number(a.volume?.h24 || 0))[0] };
    }));
    const fresh = results.filter(r => r.status === 'fulfilled' && r.value.pair).map(r => {
      const p = r.value.pair, meta = r.value.meta, score = fomoScore(p, meta?.amount);
      const buys = Number(p.txns?.h24?.buys || 0), sells = Number(p.txns?.h24?.sells || 0);
      const ageHours = p.pairCreatedAt ? (Date.now() - Number(p.pairCreatedAt)) / 3600000 : 9999;
      return {
        symbol: p.baseToken?.symbol || 'UNKNOWN', name: p.baseToken?.name || 'Unknown token',
        letter: (p.baseToken?.symbol || '?').slice(0, 1).toUpperCase(),
        color: ['orange','purple','pink','blue','yellow'][Math.abs((p.baseToken?.symbol || '').charCodeAt(0)) % 5],
        price: Number(p.priceUsd || 0), m5: Number(p.priceChange?.m5 || 0),
        h1: Number(p.priceChange?.h1 || 0), h24: Number(p.priceChange?.h24 || 0),
        volume: Number(p.volume?.h24 || 0), liquidity: Number(p.liquidity?.usd || 0),
        fomo: score, signal: signalFor(score, p), url: p.url, buys, sells, ageHours
      };
    }).sort((a, b) => b.fomo - a.fomo);
    if (!fresh.length) throw new Error('No live Solana pairs returned');
    tokens = fresh;
    renderTokens(tokens); renderEarly(tokens); renderLeader(tokens); renderStats(tokens); renderMarket(tokens); renderFomoLeaderboard(tokens);
    renderActivity(tokens.map(t => ({ symbol: t.symbol, side: t.buys >= t.sells ? 'buy-heavy' : 'sell-heavy', count: t.buys + t.sells, ratio: Math.round(t.buys / Math.max(1, t.buys + t.sells) * 100) })));
  } catch (err) {
    console.error('Moonwatch feed error:', err);
    if (!tokens.length && tokenList) tokenList.innerHTML = '<tr><td colspan="9">Live feed unavailable. Check your connection and try again.</td></tr>';
  }
}
document.querySelectorAll('.filter').forEach(button => button.addEventListener('click', () => {
  document.querySelector('.filter.active')?.classList.remove('active'); button.classList.add('active');
  const f = button.dataset.filter;
  renderTokens(f === 'all' ? tokens : tokens.filter(t => f === 'trending' ? t.fomo >= 65 : f === 'gainers' ? t.h24 > 0 : f === 'new' ? t.ageHours < 24 : true));
}));
document.querySelector('#search')?.addEventListener('input', e => {
  const value = e.target.value.toLowerCase();
  renderTokens(tokens.filter(t => `${t.symbol} ${t.name}`.toLowerCase().includes(value)));
});
fetchLiveData();
setInterval(fetchLiveData, REFRESH_MS);
