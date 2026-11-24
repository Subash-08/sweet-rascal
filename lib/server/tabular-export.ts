import 'server-only';
import { strToU8, zipSync } from 'fflate';
import { ApiError } from './auth';

type Cell = string | number | boolean | undefined | null;
export function csvCell(value: Cell) {
  let text = String(value ?? '');
  if (typeof value === 'string' && (/^\s*[=+\-@]/.test(text) || /^[\t\r]/.test(text))) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

const xml = (value: Cell) => String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '').replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char]!);
function workbookRow(row: Cell[], number: number) {
  const cells = row.map((value, index) => {
    const ref = String.fromCharCode(65 + index) + number;
    if (typeof value === 'number') return `<c r="${ref}"><v>${value}</v></c>`;
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
  });
  return `<row r="${number}">${cells.join('')}</row>`;
}

export async function xlsxResponse(filename: string, headers: string[], rows: AsyncIterable<Cell[]>, signal: AbortSignal) {
  const sheet = [workbookRow(headers, 1)];
  for await (const row of rows) {
    if (signal.aborted) throw new ApiError(499, 'Download cancelled.');
    if (sheet.length > 10_000) throw new ApiError(400, 'Excel downloads support up to 10,000 rows. Narrow the filters or use CSV.');
    sheet.push(workbookRow(row, sheet.length + 1));
  }
  const ns = 'http://schemas.openxmlformats.org', spreadsheet = `${ns}/spreadsheetml/2006/main`;
  const packages = `${ns}/package/2006`, office = `${ns}/officeDocument/2006/relationships`;
  const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const files = {
    '[Content_Types].xml': `<Types xmlns="${packages}/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    '_rels/.rels': `<Relationships xmlns="${packages}/relationships"><Relationship Id="rId1" Type="${office}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<workbook xmlns="${spreadsheet}" xmlns:r="${office}"><sheets><sheet name="Records" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<Relationships xmlns="${packages}/relationships"><Relationship Id="rId1" Type="${office}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    'xl/worksheets/sheet1.xml': `<worksheet xmlns="${spreadsheet}"><sheetData>${sheet.join('')}</sheetData></worksheet>`,
  };
  const zip = zipSync(Object.fromEntries(Object.entries(files).map(([path, content]) => [path, strToU8(declaration + content)])), { level: 3 });
  return new Response(new Uint8Array(zip), { headers: {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="${filename}.xlsx"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
  } });
}

export function csvResponse(filename: string, headers: string[], rows: AsyncIterable<Cell[]>, signal: AbortSignal) {
  const encoder = new TextEncoder(), iterator = rows[Symbol.asyncIterator]();
  let header = true;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        let chunk = '';
        if (header) { chunk = '\uFEFF' + headers.map(csvCell).join(',') + '\r\n'; header = false; }
        for (let i = 0; i < 50; i++) {
          if (signal.aborted) throw new Error('Download cancelled.');
          const record = await iterator.next();
          if (record.done) { if (chunk) controller.enqueue(encoder.encode(chunk)); controller.close(); return; }
          chunk += record.value.map(csvCell).join(',') + '\r\n';
        }
        controller.enqueue(encoder.encode(chunk));
      } catch (error) { await iterator.return?.(); controller.error(error); }
    },
    async cancel() { await iterator.return?.(); },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store',
    'Content-Disposition': `attachment; filename="${filename}.csv"`, 'X-Content-Type-Options': 'nosniff' } });
}
