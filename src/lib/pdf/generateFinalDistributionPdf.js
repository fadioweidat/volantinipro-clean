const PAGE = { width: 595.28, height: 841.89, margin: 42 };
const encoder = new TextEncoder();

function encodePdfBytes(value) {
  const bytes = [];
  for (const character of String(value)) {
    const code = character.codePointAt(0);
    if (code <= 255) bytes.push(code);
    else if (character === '€') bytes.push(0x80);
    else bytes.push(0x20);
  }
  return Uint8Array.from(bytes);
}

function clean(value) {
  return String(value ?? '').normalize('NFC').replace(/[\u2013\u2014]/g, '-').replace(/[^\x20-\x7E\u00A0-\u00FF]/g, ' ');
}

function pdfText(value) {
  return `(${clean(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')})`;
}

function wrap(value, limit = 76) {
  const words = clean(value).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (next.length > limit && line) {
      lines.push(line);
      line = word;
    } else line = next;
  });
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function dateTime(value) {
  if (!value) return 'Dato non disponibile';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Dato non disponibile' : date.toLocaleString('it-IT');
}

function dateOnly(value) {
  if (!value) return 'da definire';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'da definire' : date.toLocaleDateString('it-IT');
}

function number(value) {
  return Number(value || 0).toLocaleString('it-IT');
}

function duration(ms) {
  const minutes = Math.round(Number(ms || 0) / 60000);
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours} h ${minutes % 60} min` : `${minutes} min`;
}

function jpegSize(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1];
    const length = (bytes[offset + 2] << 8) + bytes[offset + 3];
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { height: (bytes[offset + 5] << 8) + bytes[offset + 6], width: (bytes[offset + 7] << 8) + bytes[offset + 8] };
    }
    if (!length) break;
    offset += 2 + length;
  }
  return null;
}

function concat(parts) {
  const arrays = parts.map((part) => typeof part === 'string' ? encodePdfBytes(part) : part);
  const total = arrays.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  arrays.forEach((part) => { output.set(part, offset); offset += part.length; });
  return output;
}

function buildPages(report, images) {
  const pages = [];
  let page;
  let y;
  const addPage = () => {
    page = { commands: [], images: [] };
    pages.push(page);
    y = PAGE.height - PAGE.margin;
    page.commands.push('0.91 0.34 0.10 rg', `BT /F2 20 Tf ${PAGE.margin} ${y} Td ${pdfText('VolantiniPro')} Tj ET`);
    y -= 30;
  };
  const ensure = (height) => { if (y - height < 58) addPage(); };
  const text = (value, { size = 10, bold = false, color = '0.11 0.15 0.27', indent = 0, leading = 14, max = 76 } = {}) => {
    const lines = wrap(value, max);
    ensure(lines.length * leading + 4);
    page.commands.push(`${color} rg`);
    lines.forEach((line) => {
      page.commands.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${PAGE.margin + indent} ${y} Td ${pdfText(line)} Tj ET`);
      y -= leading;
    });
  };
  const heading = (value) => { ensure(28); y -= 8; text(value, { size: 14, bold: true, leading: 18 }); };
  const rule = () => { ensure(12); page.commands.push('0.88 0.89 0.91 RG 0.7 w', `${PAGE.margin} ${y} m ${PAGE.width - PAGE.margin} ${y} l S`); y -= 12; };

  addPage();
  text('CERTIFICAZIONE FINALE DI DISTRIBUZIONE', { size: 16, bold: true, leading: 21 });
  text(report.title, { size: 20, bold: true, leading: 24, max: 50 });
  text(`Periodo di lavoro: ${dateOnly(report.periodStart)} - ${dateOnly(report.periodEnd)}`, { color: '0.36 0.40 0.49' });
  text(`Stato: ${report.status}${report.provisional ? ' - REPORT PROVVISORIO' : ''}`, { bold: true, color: report.provisional ? '0.72 0.35 0.05' : '0.05 0.50 0.32' });
  rule();
  heading('Riepilogo verificabile');
  text(`Quantita assegnata: ${number(report.totals.quantityAssigned)} volantini`);
  text(`Zone completate: ${report.totals.zonesCompleted} su ${report.totals.zonesTotal}`);
  text(`Sessioni operative: ${report.totals.sessionCount}`);
  text(`Rilevazioni GPS: ${number(report.totals.gpsCount)}`);
  text(`Prove fotografiche approvate: ${report.totals.photoCount}`);
  text(`Primo avvio: ${dateTime(report.totals.firstStartAt)}`);
  text(`Ultima chiusura: ${dateTime(report.totals.lastClosureAt)}`);
  text(`Durata registrata: ${duration(report.totals.durationMs)}`);
  heading('Zone e comuni');
  report.zones.forEach((zone) => {
    ensure(62);
    text(zone.name, { bold: true, size: 11 });
    text(`${number(zone.quantityAssigned)} assegnati | ${zone.status} | ${zone.sessionCount} sessioni | ${number(zone.gpsCount)} rilevazioni GPS`, { color: '0.30 0.34 0.41', indent: 8, max: 82 });
    text(`${dateTime(zone.firstActivityAt)} - ${dateTime(zone.lastActivityAt)} | ${duration(zone.durationMs)}`, { color: '0.42 0.45 0.51', indent: 8, size: 9, max: 88 });
    y -= 5;
  });

  heading('Timeline operativa');
  report.timeline.forEach((item) => text(`${item.label}: ${dateTime(item.at)}`, { indent: 8 }));
  heading('Evidenze e note');
  if (report.anomalies.length) report.anomalies.forEach((item) => text(`- ${item}`, { indent: 8 }));
  else text('Nessuna anomalia utile al cliente rilevata nei dati disponibili.', { indent: 8 });

  if (images.length) {
    addPage();
    text('PROVE FOTOGRAFICHE', { size: 16, bold: true, leading: 22 });
    text('Anteprima delle prove approvate associate alle sessioni di zona.', { color: '0.36 0.40 0.49' });
    images.forEach((image, index) => {
      ensure(178);
      const width = 220;
      const height = Math.min(145, width * image.height / image.width);
      page.commands.push(`q ${width} 0 0 ${height} ${PAGE.margin} ${y - height} cm /Im${index + 1} Do Q`);
      page.images.push(index + 1);
      y -= height + 8;
      text(`${image.zoneName} - ${dateTime(image.takenAt)}`, { size: 9, color: '0.36 0.40 0.49' });
      y -= 8;
    });
  }
  pages.forEach((item, index) => {
    item.commands.push(`0.42 0.45 0.51 rg BT /F1 8 Tf ${PAGE.margin} 28 Td ${pdfText(`VolantiniPro | Generato ${dateTime(report.generatedAt)} | Pagina ${index + 1}/${pages.length}`)} Tj ET`);
  });
  return pages;
}

export function generateFinalDistributionPdfBytes(report, { photos = [] } = {}) {
  const images = photos.map((photo) => {
    const bytes = photo.bytes instanceof Uint8Array ? photo.bytes : new Uint8Array(photo.bytes || []);
    const size = jpegSize(bytes);
    return size ? { ...photo, ...size, bytes } : null;
  }).filter(Boolean).slice(0, 6);
  const pages = buildPages(report, images);
  const imageStart = 5;
  const contentStart = imageStart + images.length;
  const pageIds = pages.map((_, index) => contentStart + (index * 2) + 1);
  const objects = new Map();
  objects.set(1, '<< /Type /Catalog /Pages 2 0 R >>');
  objects.set(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  objects.set(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  objects.set(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  images.forEach((image, index) => {
    const body = concat([`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`, image.bytes, '\nendstream']);
    objects.set(imageStart + index, body);
  });
  pages.forEach((page, index) => {
    const contentId = contentStart + index * 2;
    const pageId = contentId + 1;
    const stream = encoder.encode(page.commands.join('\n'));
    objects.set(contentId, concat([`<< /Length ${stream.length} >>\nstream\n`, stream, '\nendstream']));
    const xobjects = images.length ? `/XObject << ${images.map((_, imageIndex) => `/Im${imageIndex + 1} ${imageStart + imageIndex} 0 R`).join(' ')} >>` : '';
    objects.set(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> ${xobjects} >> /Contents ${contentId} 0 R >>`);
  });

  const maxId = Math.max(...objects.keys());
  const chunks = [encoder.encode('%PDF-1.4\n%âãÏÓ\n')];
  const offsets = [0];
  let length = chunks[0].length;
  for (let id = 1; id <= maxId; id += 1) {
    offsets[id] = length;
    const body = objects.get(id);
    const chunk = concat([`${id} 0 obj\n`, body, '\nendobj\n']);
    chunks.push(chunk);
    length += chunk.length;
  }
  const xref = length;
  chunks.push(encoder.encode(`xref\n0 ${maxId + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`));
  return concat(chunks);
}

async function photoBytes(report) {
  const photos = report.zones.flatMap((zone) => zone.photos.map((photo) => ({ ...photo, zoneName: zone.name }))).filter((photo) => photo.signedUrl).slice(0, 6);
  return Promise.all(photos.map(async (photo) => {
    try {
      const response = await fetch(photo.signedUrl);
      if (!response.ok) return null;
      return { ...photo, bytes: new Uint8Array(await response.arrayBuffer()) };
    } catch { return null; }
  })).then((items) => items.filter(Boolean));
}

export async function downloadFinalDistributionPdf(report, filename = 'certificazione-distribuzione.pdf') {
  const photos = await photoBytes(report);
  const bytes = generateFinalDistributionPdfBytes(report, { photos });
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
