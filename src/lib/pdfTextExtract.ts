// Spatial PDF text reconstruction utility
// Preserves column layout by detecting X-coordinate gaps between text items
// Uses tolerance-based Y-band clustering that adapts to font size

export interface TextItem {
  str: string;
  transform?: number[];
  width?: number;
  height?: number;
}

interface LineItem {
  x: number;
  y: number;
  text: string;
  width: number;
  height: number;
}

interface ReconstructedLine {
  y: number;
  items: LineItem[];
  text: string;
}

export type DocType = "bank_statement" | "w2" | "unknown";

/** Raw positioned item for structured extraction */
export interface RawPageItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PageData {
  pageNum: number;
  width: number;
  height: number;
  items: RawPageItem[];
}

/**
 * Extract raw positioned items from a pdf.js page's text content.
 * Returns cleaned items with absolute coordinates.
 */
export function extractRawItems(contentItems: any[], viewport?: { width: number; height: number }): PageData {
  const items: RawPageItem[] = [];
  for (const item of contentItems) {
    if (!("str" in item) || !item.str || !item.str.trim()) continue;
    items.push({
      str: item.str,
      x: item.transform?.[4] ?? 0,
      y: item.transform?.[5] ?? 0,
      width: item.width ?? item.str.length * 6,
      height: item.height ?? 12,
    });
  }
  return {
    pageNum: 0,
    width: viewport?.width ?? 612,
    height: viewport?.height ?? 792,
    items,
  };
}

/**
 * Detect document type from extracted text.
 */
export function detectDocType(fullText: string): DocType {
  const upper = fullText.toUpperCase();

  if (
    upper.includes("WAGE AND TAX STATEMENT") ||
    upper.includes("FORM W-2") ||
    upper.includes("W-2 WAGE")
  ) {
    return "w2";
  }

  if (
    upper.includes("ACCOUNT STATEMENT") ||
    upper.includes("STATEMENT OF ACCOUNT") ||
    upper.includes("BEGINNING BALANCE") ||
    upper.includes("ENDING BALANCE") ||
    upper.includes("AVAILABLE BALANCE") ||
    upper.includes("DEPOSITS AND ADDITIONS") ||
    upper.includes("WITHDRAWALS AND DEDUCTIONS") ||
    upper.includes("DEPOSITS AND OTHER CREDITS") ||
    upper.includes("WITHDRAWALS AND OTHER DEBITS") ||
    upper.includes("TRANSACTION DETAIL") ||
    upper.includes("PREVIOUS BALANCE") ||
    upper.includes("NEW BALANCE") ||
    upper.includes("PAYMENT DUE DATE") ||
    upper.includes("MINIMUM PAYMENT")
  ) {
    return "bank_statement";
  }

  return "unknown";
}

/**
 * Detect document type from raw page items (without reconstructing text).
 */
export function detectDocTypeFromItems(pages: PageData[]): DocType {
  const allText = pages.flatMap(p => p.items.map(i => i.str)).join(" ");
  return detectDocType(allText);
}

/**
 * Reconstructs text from PDF page content items, preserving spatial layout.
 * Uses tolerance-based Y-band clustering that adapts to font size,
 * and inserts separators based on character-relative gap detection.
 */
export function reconstructPageText(items: TextItem[]): string {
  const lineItems: LineItem[] = [];

  for (const item of items) {
    if (!item.str || !item.str.trim()) continue;
    const x = item.transform?.[4] ?? 0;
    const y = item.transform?.[5] ?? 0;
    const width = item.width ?? item.str.length * 6;
    const height = item.height ?? 12;
    lineItems.push({ x, y, text: item.str, width, height });
  }

  if (lineItems.length === 0) return "";

  // Sort by Y descending (top of page first in PDF coords), then X ascending
  const sorted = [...lineItems].sort((a, b) => b.y - a.y || a.x - b.x);

  // Group into lines using adaptive Y-tolerance based on item height
  const lines: { y: number; items: LineItem[] }[] = [];
  let currentBand: LineItem[] = [sorted[0]];
  let bandY = sorted[0].y;

  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i];
    // Tolerance: ~30% of the item's font height, minimum 2px
    const tolerance = Math.max(item.height * 0.3, 2);
    if (Math.abs(item.y - bandY) <= tolerance) {
      currentBand.push(item);
    } else {
      lines.push({ y: bandY, items: [...currentBand] });
      currentBand = [item];
      bandY = item.y;
    }
  }
  lines.push({ y: bandY, items: [...currentBand] });

  // Build text for each line
  const outputLines: string[] = [];

  for (const line of lines) {
    // Sort items left-to-right within the line
    const sortedItems = [...line.items].sort((a, b) => a.x - b.x);

    let text = sortedItems[0].text;
    for (let i = 1; i < sortedItems.length; i++) {
      const prev = sortedItems[i - 1];
      const curr = sortedItems[i];
      const gap = curr.x - (prev.x + prev.width);

      // Gap detection relative to font height
      if (gap > prev.height * 2) {
        text += "    "; // Large gap = column separator
      } else if (gap > prev.height * 0.3) {
        text += " "; // Normal word gap
      }
      // Very close or overlapping = no separator

      text += curr.text;
    }

    outputLines.push(text.trimEnd());
  }

  return outputLines.join("\n");
}
