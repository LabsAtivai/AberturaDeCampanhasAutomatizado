// Normaliza para busca: minúsculas, sem acentos e sem espaços nas pontas.
export function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

// Todos os termos (separados por espaço) precisam aparecer em algum dos campos.
export function matchesSearch(term, fields) {
  const terms = normalize(term).split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const haystack = fields.map(normalize).join(' ');
  return terms.every((t) => haystack.includes(t));
}
