import { autoMapHeaders, detectDelimiter, parseDelimitedText, rowsToLeads } from '../utils/importSpreadsheet';

describe('ImportWizard helpers', () => {
  test('detecta CSV brasileiro separado por ponto e vírgula', () => {
    const text = 'Nome;Telefone;Endereço\nLoja A;11999999999;Rua 1\nLoja B;11888888888;Rua 2';
    expect(detectDelimiter(text)).toBe(';');
    expect(parseDelimitedText(text).rows).toHaveLength(3);
  });

  test('preserva delimitadores e quebras dentro de campos entre aspas', () => {
    const parsed = parseDelimitedText('Nome,Endereço\n"Loja, Centro","Rua A\nSala 2"');
    expect(parsed.rows[1]).toEqual(['Loja, Centro', 'Rua A\nSala 2']);
  });

  test('mapeia aliases em português e valida linhas', () => {
    const headers = ['Empresa', 'WhatsApp', 'E-mail', 'Lat', 'Lng'];
    const mapping = autoMapHeaders(headers);
    const result = rowsToLeads([
      ['Clínica A', '(11) 99999-0000', 'contato@clinica.com', '-23,5', '-46,6'],
      ['', '', 'email-invalido', '200', '0'],
    ], mapping);

    expect(result[0].errors).toEqual([]);
    expect(result[0].lead.name).toBe('Clínica A');
    expect(result[0].lead.latitude).toBe(-23.5);
    expect(result[1].errors).toEqual(expect.arrayContaining(['nome ausente', 'e-mail inválido', 'latitude inválida']));
  });
});
