import JSZip from 'jszip';

export interface DocSection {
  id: string;
  heading: string;
  paragraphs: string[];
}

export interface ParsedDoc {
  licenseTitle: string;
  sections: DocSection[];
}

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function getParagraphText(p: Element): string {
  return Array.from(p.getElementsByTagNameNS(W, 't'))
    .map(t => t.textContent ?? '')
    .join('')
    .trim();
}

function isParagraphBold(p: Element): boolean {
  // Check paragraph-level default rPr
  const pPrRpr = p.querySelector('pPr > rPr > b, pPr > rPr > b');
  if (pPrRpr) return true;
  // Check any run-level bold
  const runs = Array.from(p.getElementsByTagNameNS(W, 'r'));
  if (runs.length === 0) return false;
  const boldRuns = runs.filter(r => r.getElementsByTagNameNS(W, 'b').length > 0);
  // Consider bold if majority of runs are bold
  return boldRuns.length / runs.length > 0.5;
}

function isUpperCase(text: string): boolean {
  const letters = text.replace(/[^a-zA-Zа-яА-ЯёЁ]/g, '');
  if (letters.length < 3) return false;
  const upper = (letters.match(/[A-ZА-ЯЁ]/g) ?? []).length;
  return upper / letters.length > 0.75;
}

function isHeading(p: Element): boolean {
  const text = getParagraphText(p);
  return !!text && isParagraphBold(p) && isUpperCase(text);
}

function makeId(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 48)
    + '-' + Math.random().toString(36).slice(2, 6);
}

export async function parseDocx(source: File | ArrayBuffer): Promise<ParsedDoc> {
  const zip = await JSZip.loadAsync(source);
  const xmlStr = await zip.file('word/document.xml')!.async('string');

  const xmlDoc = new DOMParser().parseFromString(xmlStr, 'application/xml');
  const body = xmlDoc.getElementsByTagNameNS(W, 'body')[0];
  const allParas = Array.from(body.getElementsByTagNameNS(W, 'p'));

  const sections: DocSection[] = [];
  let current: DocSection | null = null;
  let preamble: string[] = [];
  let foundFirst = false;

  for (const p of allParas) {
    const text = getParagraphText(p);
    if (!text) continue;

    if (isHeading(p)) {
      foundFirst = true;
      if (current) sections.push(current);
      current = { id: makeId(text), heading: text, paragraphs: [] };
    } else if (!foundFirst) {
      preamble.push(text);
    } else if (current) {
      current.paragraphs.push(text);
    }
  }
  if (current) sections.push(current);

  // Extract license title from preamble or first heading
  const titleLine = preamble.find(l => l.includes('ЛИЦЕНЗИ')) ?? sections[0]?.heading ?? 'Договор';

  return { licenseTitle: titleLine, sections };
}
