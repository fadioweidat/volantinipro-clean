// Ripartizione intera con il metodo del resto maggiore (Hamilton): divide un
// totale intero in parti intere proporzionali ai pesi, con somma esatta.
// A parita' di resto vince la chiave minore (ordine stabile e riproducibile,
// lo stesso usato dalla migration SQL: order by resto desc, nil_code).

/**
 * @param {number} total intero >= 0
 * @param {Array<{key: string, weight: number}>} items pesi >= 0
 * @returns {Map<string, number>} quota intera per chiave; somma = total
 */
export function largestRemainder(total, items) {
  const target = Math.round(Number(total));
  const list = (Array.isArray(items) ? items : []).map((it) => ({ key: String(it.key), weight: Math.max(0, Number(it.weight) || 0) }));
  const result = new Map(list.map((it) => [it.key, 0]));
  const sum = list.reduce((s, it) => s + it.weight, 0);
  if (!(target > 0) || !(sum > 0)) return result;
  const parts = list.map((it) => {
    const exact = (target * it.weight) / sum;
    const floor = Math.floor(exact);
    return { key: it.key, floor, rest: exact - floor };
  });
  let left = target - parts.reduce((s, p) => s + p.floor, 0);
  const order = [...parts].sort((a, b) => (b.rest - a.rest) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  for (const p of parts) result.set(p.key, p.floor);
  for (let i = 0; left > 0 && i < order.length; i += 1, left -= 1) result.set(order[i].key, result.get(order[i].key) + 1);
  return result;
}
