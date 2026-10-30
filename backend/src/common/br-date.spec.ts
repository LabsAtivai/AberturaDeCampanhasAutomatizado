import { isValidBrDate, validateBrRange } from './br-date';

describe('br-date', () => {
  it('rejeita data inexistente', () => {
    expect(isValidBrDate('99/99/9999')).toBe(false);
    expect(isValidBrDate('31/02/2026')).toBe(false);
    expect(isValidBrDate('29/02/2028')).toBe(true);
  });

  it('valida ordem e tamanho do intervalo', () => {
    expect(validateBrRange('01/10/2026', '30/10/2026')).toBeNull();
    expect(validateBrRange('30/10/2026', '01/10/2026')).toMatch(/posterior/);
    expect(validateBrRange('01/01/2020', '01/01/2026')).toMatch(/Intervalo máximo/);
  });
});
