const tokens = [
  { rank: 1, symbol: 'BONK', name: 'Bonk', letter: 'B', color: 'orange', price: '$0.00001942', h1: '+4.82%', h24: '+23.7%', volume: '$38.4M', liquidity: '$8.2M', signal: 'HOT', type: 'trending' },
  { rank: 2, symbol: 'WIF', name: 'dogwifhat', letter: 'W', color: 'purple', price: '$2.146', h1: '+2.14%', h24: '+16.9%', volume: '$42.8M', liquidity: '$14.6M', signal: 'HOT', type: 'trending' },
  { rank: 3, symbol: 'POPCAT', name: 'Popcat', letter: 'P', color: 'pink', price: '$0.4821', h1: '-0.78%', h24: '+11.4%', volume: '$12.7M', liquidity: '$4.1M', signal: 'WATCH', type: 'gainers' },
  { rank: 4, symbol: 'MEW', name: 'cat in a dogs world', letter: 'M', color: 'blue', price: '$0.00431', h1: '+1.06%', h24: '+8.6%', volume: '$9.8M', liquidity: '$2.7M', signal: 'NEW', type: 'new' },
  { rank: 5, symbol: 'MICHI', name: 'michi', letter: 'M', color: 'yellow', price: '$0.1824', h1: '+0.43%', h24: '-3.2%', volume: '$5.1M', liquidity: '$1.9M', signal: 'WATCH', type: 'new' }
];
const tokenList = document.querySelector('#token-list');
const trendClass = value => value.startsWith('+') ? 'gain' : 'loss';
function renderTokens(items) {
  tokenList.innerHTML = items.map(t => `<tr><td>${t.rank}</td><td><div class="token-cell"><span class="token-avatar ${t.color}">${t.letter}</span><span><b>${t.symbol}</b><small>${t.name}</small></span></div></td><td>${t.price}</td><td class="${trendClass(t.h1)}">${t.h1}</td><td class="${trendClass(t.h24)}">${t.h24}</td><td>${t.volume}</td><td>${t.liquidity}</td><td><span class="signal ${t.signal.toLowerCase()}">${t.signal}</span></td><td><button class="star" aria-label="Watch ${t.symbol}">☆</button></td></tr>`).join('') || '<tr><td colspan="9">No tokens matched your search.</td></tr>';
}
renderTokens(tokens);
document.querySelectorAll('.filter').forEach(button => button.addEventListener('click', () => {
  document.querySelector('.filter.active').classList.remove('active'); button.classList.add('active');
  renderTokens(button.dataset.filter === 'all' ? tokens : tokens.filter(t => t.type === button.dataset.filter));
}));
document.querySelector('#search').addEventListener('input', event => {
  const value = event.target.value.toLowerCase();
  renderTokens(tokens.filter(t => `${t.symbol} ${t.name}`.toLowerCase().includes(value)));
});
const activity = [
  ['8xK3...YvP2', 'bought', 'WIF', '$42,900', '2m ago'],
  ['Bz81...qF4n', 'bought', 'BONK', '$18,200', '7m ago'],
  ['DRp9...a2Wc', 'sold', 'POPCAT', '$11,840', '12m ago']
];
document.querySelector('#activity-list').innerHTML = activity.map((a, i) => `<div class="activity-item"><span class="token-avatar activity-avatar">${i + 1}</span><div class="activity-text"><b>${a[0]}</b> ${a[1]} <b>${a[2]}</b><br><span class="${a[1] === 'bought' ? 'gain' : 'loss'}">${a[3]}</span></div><span class="activity-time">${a[4]}</span></div>`).join('');
