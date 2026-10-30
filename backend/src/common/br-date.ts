const MAX_RANGE_DAYS = 366;

// Valida dd/mm/yyyy (data real, não só o formato).
export function isValidBrDate(value: string): boolean {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!m) return false;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function brToMs(value: string): number {
  const [d, mo, y] = value.split('/').map(Number);
  return Date.UTC(y, mo - 1, d);
}

// Retorna mensagem de erro, ou null se o intervalo é válido.
export function validateBrRange(startDate: string, endDate: string): string | null {
  if (!isValidBrDate(startDate)) return 'startDate não é uma data válida.';
  if (!isValidBrDate(endDate)) return 'endDate não é uma data válida.';
  const diff = brToMs(endDate) - brToMs(startDate);
  if (diff < 0) return 'startDate não pode ser posterior a endDate.';
  if (diff / 86_400_000 > MAX_RANGE_DAYS) return `Intervalo máximo de ${MAX_RANGE_DAYS} dias.`;
  return null;
}
