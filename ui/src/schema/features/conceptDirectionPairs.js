// Keep malformed imported values available for repair; editing never drops unknown keys.
export function readConceptDirectionPairs(raw) {
  const text = raw == null ? '' : typeof raw === 'string' ? raw : JSON.stringify(raw);
  if (!text.trim()) return { pairs: [], text, error: '' };
  try {
    const pairs = JSON.parse(text);
    if (!Array.isArray(pairs) || pairs.some((pair) => (
      !pair || typeof pair !== 'object' || Array.isArray(pair)
      || ['positive', 'negative'].some((key) => key in pair && typeof pair[key] !== 'string')
    ))) throw new TypeError('Expected concept pairs');
    return { pairs, text, error: '' };
  } catch {
    return { pairs: [], text, error: '现有概念对格式无法显示为表单，原文已保留。请修正为含 positive / negative 文本的数组。' };
  }
}

export function editConceptDirectionPairs(raw, action, index = -1, key = '', value = '') {
  const { pairs, error } = readConceptDirectionPairs(raw);
  if (error) throw new TypeError(error);
  const next = pairs.map((pair) => ({ ...pair }));
  if (action === 'add') next.push({ positive: '', negative: '' });
  else {
    if (!Number.isInteger(index) || index < 0 || index >= next.length) return raw;
    if (action === 'remove') next.splice(index, 1);
    else if (action === 'update' && ['positive', 'negative'].includes(key)) next[index][key] = value;
    else return raw;
  }
  return JSON.stringify(next);
}
