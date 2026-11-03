import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { parseImportFile } from '../src/modules/import/import.parser.js';

const latin1 = (text: string) => Buffer.from(text, 'latin1');

describe('lectura de CSV', () => {
  it('lee CSV con punto y coma en Windows-1252 (como lo guarda Excel en español)', async () => {
    const file = await parseImportFile(
      latin1('Código;Descripción;Precio\r\nALG-1;Algodón hidrófilo;3.899,00\r\n;;\r\nIBU-4;Ibuprofeno;1.250,50\r\n'),
      'precios.csv',
    );
    expect(file.headers).toEqual(['Código', 'Descripción', 'Precio']);
    expect(file.rows).toEqual([
      { rowNumber: 2, cells: ['ALG-1', 'Algodón hidrófilo', '3.899,00'] },
      { rowNumber: 4, cells: ['IBU-4', 'Ibuprofeno', '1.250,50'] },
    ]);
    expect(file.suggestedMapping).toMatchObject({ sku: 0, name: 1, price: 2 });
  });

  it('lee CSV UTF-8 con BOM y comas', async () => {
    const file = await parseImportFile(Buffer.from('﻿EAN,Nombre,Precio\n7791234567898,Ñandú,10.5\n'), 'a.csv');
    expect(file.headers[0]).toBe('EAN');
    expect(file.rows[0]!.cells).toEqual(['7791234567898', 'Ñandú', '10.5']);
  });

  it('rechaza archivos sin filas de datos', async () => {
    await expect(parseImportFile(Buffer.from('Codigo;Precio\n'), 'vacio.csv')).rejects.toThrow('no tiene datos');
  });
});

describe('lectura de Excel', () => {
  async function buildXlsx(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Vacía');
    const sheet = workbook.addWorksheet('Precios');
    sheet.addRow(['Lista de precios noviembre']); // título antes del encabezado: se toma como encabezado
    sheet.getRow(3).values = ['EAN', 'Descripción', 'PVP'];
    sheet.getRow(4).values = [7791234567898, { richText: [{ text: 'Ibu' }, { text: 'profeno' }] }, 1250.5];
    sheet.getRow(5).values = ['4006381333931', 'Protector', { formula: 'B1*2', result: 28990 }];
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  it('usa la primera hoja con datos y convierte números, texto enriquecido y fórmulas', async () => {
    const file = await parseImportFile(await buildXlsx(), 'lista.xlsx');
    expect(file.sheetNames).toEqual(['Vacía', 'Precios']);
    expect(file.sheet).toBe('Precios');
    // La primera fila con datos es el título; el usuario lo verá en la vista previa.
    expect(file.rows[0]).toEqual({ rowNumber: 3, cells: ['EAN', 'Descripción', 'PVP'] });
    expect(file.rows[1]).toEqual({ rowNumber: 4, cells: [7791234567898, 'Ibuprofeno', 1250.5] });
    expect(file.rows[2]).toEqual({ rowNumber: 5, cells: ['4006381333931', 'Protector', 28990] });
  });

  it('permite elegir la hoja', async () => {
    await expect(parseImportFile(await buildXlsx(), 'lista.xlsx', 'Vacía')).rejects.toThrow('no tiene datos');
    await expect(parseImportFile(await buildXlsx(), 'lista.xlsx', 'Otra')).rejects.toThrow('no tiene una hoja');
  });

  it('explica qué hacer con archivos .xls y formatos desconocidos', async () => {
    await expect(parseImportFile(Buffer.from('x'), 'viejo.xls')).rejects.toThrow('Guardar como');
    await expect(parseImportFile(Buffer.from('x'), 'foto.png')).rejects.toThrow('Formato no compatible');
    await expect(parseImportFile(Buffer.from('no es zip'), 'falso.xlsx')).rejects.toThrow('no es un Excel');
  });
});
