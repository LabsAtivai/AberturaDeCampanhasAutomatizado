import { csvField, csvRow } from './csv';

describe('csv', () => {
  it('duplica aspas', () => {
    expect(csvField('a"b')).toBe('"a""b"');
  });

  it('neutraliza fórmulas', () => {
    expect(csvField('=1+1')).toBe(`"'=1+1"`);
    expect(csvField('@x')).toBe(`"'@x"`);
  });

  it('null vira vazio e linha junta por vírgula', () => {
    expect(csvRow(['a', null, 3])).toBe('"a","","3"');
  });
});
