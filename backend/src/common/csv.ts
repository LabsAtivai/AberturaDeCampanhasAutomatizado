// Escapa um campo CSV: duplica aspas e neutraliza fórmulas (=, +, -, @) abertas pelo Excel.
export function csvField(value: unknown): string {
  let s = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function csvRow(values: unknown[]): string {
  return values.map(csvField).join(',');
}
