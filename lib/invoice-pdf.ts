import { jsPDF } from 'jspdf';
import { getFontEmbedCSS, toCanvas } from 'html-to-image';

/** Lay out the existing invoice at paper width before rendering each A4 page. */
export async function downloadInvoicePdf(source: HTMLElement, billId: string) {
  const frame = document.createElement('iframe');
  frame.title = 'Preparing invoice PDF';
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, { position: 'fixed', left: '-10000px', top: '0', width: '1000px', height: '1200px', border: '0' });
  document.body.append(frame);
  try {
    const doc = frame.contentDocument;
    if (!doc) throw new Error('Could not prepare the invoice.');
    doc.documentElement.className = document.documentElement.className;
    doc.body.className = document.body.className;
    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'));
    const ready = styles.map(style => {
      const clone = style.cloneNode(true) as HTMLElement;
      const loaded = clone.tagName === 'LINK' ? new Promise<void>((resolve, reject) => {
        clone.onload = () => resolve();
        clone.onerror = () => reject(new Error('Invoice styles could not load. Try again.'));
      }) : Promise.resolve();
      doc.head.append(clone);
      return loaded;
    });
    await Promise.all(ready);
    const paperStyle = doc.createElement('style');
    paperStyle.textContent = `
      html, body { margin: 0; padding: 0; background: white; }
      .pdf-page.sr-invoice-sheet { width: 710px; height: 980px; margin: 0 0 20px; padding: 0; border: 0; border-radius: 0; box-shadow: none; font-size: 9.5pt; overflow: visible; }
      .pdf-page .sr-invoice-mark strong { font-size: 22pt; }
      .pdf-page .sr-invoice-print-ref { display: none; }
      .pdf-continuation { display: flex; justify-content: space-between; gap: 12px; padding: 0 0 10px; color: var(--sr-red); font-weight: 700; }
    `;
    doc.head.append(paperStyle);
    const measuring = source.cloneNode(true) as HTMLElement;
    measuring.classList.add('pdf-page');
    doc.body.append(measuring);
    await doc.fonts.ready;
    const fontEmbedCSS = await getFontEmbedCSS(measuring);
    measuring.remove();

    const pages: HTMLElement[] = [];
    const height = 980;
    let page: HTMLElement;
    let table: HTMLTableElement | undefined;
    function newPage() {
      page = source.cloneNode(false) as HTMLElement;
      page.classList.add('pdf-page');
      if (pages.length) {
        const heading = doc!.createElement('div');
        heading.className = 'pdf-continuation';
        const brand = source.querySelector('.sr-invoice-mark strong')?.textContent ?? 'Sweet Rascal';
        const label = doc!.createElement('span');
        label.textContent = brand;
        const reference = doc!.createElement('span');
        reference.textContent = 'Bill ' + billId + ' · Continued';
        heading.append(label, reference);
        page.append(heading);
      }
      doc!.body.append(page);
      pages.push(page);
      table = undefined;
    }
    function fits() {
      const last = page.lastElementChild;
      return !last || last.getBoundingClientRect().bottom - page.getBoundingClientRect().top <= height;
    }
    function appendBlock(element: Element) {
      const clone = element.cloneNode(true);
      page.append(clone);
      if (!fits()) {
        clone.parentNode?.removeChild(clone);
        newPage();
        page.append(clone);
        if (!fits()) throw new Error('A bill section is too tall for PDF download. Use Print A4 to paginate this bill.');
      }
    }
    newPage();
    for (const section of Array.from(source.children)) {
      if (section.tagName !== 'TABLE') { appendBlock(section); continue; }
      const original = section as HTMLTableElement;
      function newTable() {
        table = original.cloneNode(false) as HTMLTableElement;
        for (const part of Array.from(original.children)) if (part.tagName !== 'TBODY') table.append(part.cloneNode(true));
        table.append(doc!.createElement('tbody'));
        page.append(table);
      }
      newTable();
      for (const row of Array.from(original.tBodies[0].rows)) {
        const clone = row.cloneNode(true);
        table!.tBodies[0].append(clone);
        if (!fits()) {
          clone.parentNode?.removeChild(clone);
          if (!table!.tBodies[0].rows.length) table!.remove();
          newPage();
          newTable();
          table!.tBodies[0].append(clone);
          if (!fits()) throw new Error('A dish row is too tall for PDF download. Use Print A4 for this bill.');
        }
      }
    }
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    pdf.setProperties({ title: 'Sweet Rascal bill ' + billId });
    for (const [index, paper] of pages.entries()) {
      if (index) pdf.addPage('a4', 'portrait');
      const canvas = await toCanvas(paper, { pixelRatio: 2, backgroundColor: '#ffffff', fontEmbedCSS, width: 710, height });
      pdf.addImage(canvas, 'PNG', 11, 10, 188, height * 188 / 710);
      pdf.setDrawColor(150);
      pdf.line(11, 281, 199, 281);
      pdf.setFontSize(8);
      pdf.setTextColor(55);
      pdf.text('Sweet Rascal | Bill ' + billId, 11, 286);
      pdf.text('Page ' + (index + 1) + ' of ' + pages.length, 199, 286, { align: 'right' });
      canvas.width = 0;
      canvas.height = 0;
    }
    await pdf.save('Sweet-Rascal-' + billId.replace(/[^a-z0-9_-]/gi, '-') + '.pdf', { returnPromise: true });
  } finally { frame.remove(); }
}
