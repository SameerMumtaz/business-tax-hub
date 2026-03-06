// Spatial PDF text reconstruction utility
// Preserves column layout by detecting X-coordinate gaps between text items
// This ensures amounts in right-aligned columns appear on the same line as descriptions

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
}

/**
 * Reconstructs text from PDF page content items, preserving spatial layout.
 * Groups items by Y-coordinate (line), sorts by X within each line,
 * and inserts tab separators for large horizontal gaps (column boundaries).
 */
export function reconstructPageText(items: TextItem[]): string {
  const lineItems: LineItem[] = [];

  for (const item of items) {
    if (!item.str || !item.str.trim()) continue;
    const x = Math.round(item.transform?.[4] ?? 0);
    const y = Math.round(item.transform?.[5] ?? 0);
    const width = Math.round(item.width ?? item.str.length * 6);
    lineItems.push({ x, y, text: item.str, width });
  }

  if (lineItems.length === 0) return "";

  // Group by Y-coordinate (tolerance of 3px for slight vertical offsets)
  const yGroups = new Map<number, LineItem[]>();
  const sortedByY = [...lineItems].sort((a, b) => b.y - a.y); // top to bottom (PDF Y is bottom-up)

  for (const item of sortedByY) {
    let matched = false;
    for (const [groupY, group] of yGroups) {
      if (Math.abs(item.y - groupY) <= 3) {
        group.push(item);
        matched = true;
        break;
      }
    }
    if (!matched) {
      yGroups.set(item.y, [item]);
    }
  }

  // Sort groups top-to-bottom, items within each group left-to-right
  const sortedGroups = [...yGroups.entries()]
    .sort((a, b) => b[0] - a[0]) // Higher Y = higher on page
    .map(([, group]) => group.sort((a, b) => a.x - b.x));

  const outputLines: string[] = [];

  for (const group of sortedGroups) {
    let lineText = "";
    let prevEndX = 0;

    for (let i = 0; i < group.length; i++) {
      const item = group[i];
      const gap = item.x - prevEndX;

      if (i > 0) {
        // Large gap = column separator (use multiple spaces to preserve column structure)
        if (gap > 40) {
          lineText += "    "; // 4 spaces = column separator
        } else if (gap > 8) {
          lineText += " ";
        }
        // Overlapping or very close = no separator
      }

      lineText += item.text;
      prevEndX = item.x + item.width;
    }

    outputLines.push(lineText.trimEnd());
  }

  return outputLines.join("\n");
}
