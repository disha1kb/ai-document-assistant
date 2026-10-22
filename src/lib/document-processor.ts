export interface ExtractedPage {
  text: string;
  pageNumber: number;
}

export interface TextChunk {
  content: string;
  page_number: number | null;
  chunk_index: number;
}

const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 150;

export async function extractTextFromPdf(
  file: File,
  onProgress?: (page: number, total: number) => void
): Promise<ExtractedPage[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfjsLib = await import('pdfjs-dist');
  // Vite resolves this URL pattern for the worker bundle
  const workerUrl = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).href;
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages: ExtractedPage[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const text = textContent.items
      .map((item: any) => item.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    pages.push({ text, pageNumber: i });
    onProgress?.(i, pdf.numPages);
  }

  return pages;
}

export async function extractTextFromTxt(file: File): Promise<ExtractedPage[]> {
  const text = await file.text();
  return [{ text: text.replace(/\s+/g, ' ').trim(), pageNumber: 1 }];
}

export function chunkPages(pages: ExtractedPage[]): TextChunk[] {
  const chunks: TextChunk[] = [];
  let chunkIndex = 0;

  for (const page of pages) {
    if (!page.text) continue;

    const words = page.text.split(' ');
    let start = 0;

    while (start < words.length) {
      const end = Math.min(start + CHUNK_SIZE, words.length);
      const content = words.slice(start, end).join(' ');

      if (content.trim().length > 0) {
        chunks.push({
          content: content.trim(),
          page_number: page.pageNumber,
          chunk_index: chunkIndex,
        });
        chunkIndex++;
      }

      start += CHUNK_SIZE - CHUNK_OVERLAP;
      if (start >= words.length) break;
    }
  }

  return chunks;
}

export function generateSessionId(): string {
  return (
    'sess_' +
    Date.now().toString(36) +
    '_' +
    Math.random().toString(36).substring(2, 12)
  );
}
