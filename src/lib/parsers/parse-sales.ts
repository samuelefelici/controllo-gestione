import pdf from "pdf-parse";

export interface SalesCategoryRow {
  rank: number;
  category_name: string;
  sold_quantity: number;
  net_sales: number;
  vat_amount: number;
  sales_with_vat: number;
  net_discount: number;
  discount_pct: number;
}

export interface SalesCategoryResult {
  period: string;
  rows: SalesCategoryRow[];
  totals: {
    sold_quantity: number;
    net_sales: number;
    vat: number;
    sales_with_vat: number;
    net_discount: number;
  };
}

/** Parse European-format number: "168 114,37" -> 168114.37 */
function parseEU(s: string): number {
  if (!s || s.trim() === "") return 0;
  const n = s.replace(/[€%]/g, "").trim().replace(/\s/g, "").replace(",", ".");
  const val = parseFloat(n);
  return isNaN(val) ? 0 : val;
}

/** Format number to EU string without spaces: 168114.37 -> "168114,37" */
function formatEU(n: number): string {
  return n.toFixed(2).replace(".", ",");
}

/**
 * Parse ALL financial numbers from a numeric string using the comma-split technique.
 *
 * EU numbers have format: \d{1,3}( \d{3})*,\d{2}
 * Every number has exactly ONE comma (decimal separator) followed by 2 digits.
 * When numbers are glued together: "168 114,370,00168 114,370,00"
 * Splitting by comma gives segments where each segment[i] (i>0) starts with
 * 2 decimal digits of previous number, followed by the integer part of next number.
 */
function commaSplitNumbers(numericStr: string): string[] {
  const parts = numericStr.split(",");
  if (parts.length < 2) return [];

  const rawNumbers: string[] = [];
  let intPart = parts[0];

  for (let i = 1; i < parts.length; i++) {
    const decimal = parts[i].substring(0, 2);
    const nextInt = parts[i].substring(2);
    rawNumbers.push(intPart + "," + decimal);
    intPart = nextInt;
  }

  return rawNumbers;
}

/**
 * Parse a single data line from the Erply "Sales by Category" PDF.
 *
 * Input format (rank already stripped, only " %" symbol removed but number kept):
 *   "MONEY TRANSFER553168 114,370,00168 114,370,00"
 *   "MOBILE7713 753,911 477,0915 231,00576,644,02"
 *
 * With discount: 5 financial numbers [qty+net, vat, total, disc, disc%]
 * Without discount: 4 financial numbers [qty+net, vat, total, disc(=0)]
 *
 * Returns null if parsing fails.
 */
function parseDataLine(lineWithoutRank: string, hasDiscount: boolean): Omit<SalesCategoryRow, "rank"> | null {
  const line = lineWithoutRank;

  // 1) Find where the name ends (last letter character)
  let lastLetterIdx = -1;
  for (let i = 0; i < line.length; i++) {
    if (/[A-Za-z\u00C0-\u00FF]/.test(line[i])) lastLetterIdx = i;
  }
  if (lastLetterIdx < 0) return null;

  const name = line.substring(0, lastLetterIdx + 1).replace(/\s+/g, " ").replace(/,$/, "").trim();
  const numericPart = line.substring(lastLetterIdx + 1);

  if (!numericPart.includes(",")) return null;

  // 2) Split all financial numbers using comma-split technique
  const rawNumbers = commaSplitNumbers(numericPart);
  // With discount:    [qty+net, vat, total, net_discount, disc_pct] (5 numbers)
  // Without discount: [qty+net, vat, total, net_discount]           (4 numbers)

  if (rawNumbers.length < 3) return null;

  // 3) Extract discount_pct if present (last number when hasDiscount)
  let discountPct = 0;
  const financials = [...rawNumbers];
  if (hasDiscount && financials.length >= 5) {
    discountPct = parseEU(financials.pop()!);
  }

  const vat = parseEU(financials[1]);
  const salesWithVat = parseEU(financials[2]);
  const netDiscount = financials.length >= 4 ? parseEU(financials[3]) : 0;

  // 4) Derive net_sales = sales_with_vat - vat
  const netSales = Math.round((salesWithVat - vat) * 100) / 100;

  // 5) Extract QTY from financials[0]
  // financials[0] without spaces = qty_digits + net_sales_as_EU_string
  const firstRaw = financials[0].replace(/\s/g, "");
  const netSalesStr = formatEU(netSales);

  let qty = 0;
  if (firstRaw.endsWith(netSalesStr)) {
    const qtyStr = firstRaw.substring(0, firstRaw.length - netSalesStr.length);
    qty = parseInt(qtyStr) || 0;
  }

  if (!name) return null;

  return {
    category_name: name,
    sold_quantity: qty,
    net_sales: netSales,
    vat_amount: vat,
    sales_with_vat: salesWithVat,
    net_discount: netDiscount,
    discount_pct: discountPct,
  };
}

/**
 * Parse the "Sales by Category" PDF from Erply (YESTORE).
 */
export async function parseSalesByCategory(buffer: Buffer): Promise<SalesCategoryResult> {
  const data = await pdf(buffer);
  const text = data.text;

  // Extract period
  const periodMatch = text.match(/Period:\s*(\d{2})\/(\d{2})\/(\d{4})\s*[–\-]\s*(\d{2})\/(\d{2})\/(\d{4})/);
  let period = "";
  if (periodMatch) {
    period = `${periodMatch[3]}-${periodMatch[2]}`;
  }

  // Split into lines, join multi-line entries
  const rawLines = text.split("\n").map((l: string) => l.trim()).filter(Boolean);
  const joinedLines: string[] = [];

  for (const line of rawLines) {
    // Skip headers, footers, URLs, etc.
    if (
      /Period:|Gift cards|Currency|YESTORE|Created by|Sales by Category|cached report|Filters|https?:|^Name$|^Sold$|^quantity$|^Net(\s|$)|^total(\s|$)|^VAT\s|^Sales total|^with VAT|^\(€\)|^discount|^\d{2}\/\d{2}\/\d{2}|^%$/.test(line)
    ) continue;

    // Data lines start with rank (1-2 digits) followed by a letter
    if (/^\d{1,2}[A-Za-z]/.test(line)) {
      joinedLines.push(line);
    }
    // Multi-line category names (e.g., "LAPTOP,MACBOOK")
    else if (joinedLines.length > 0 && /^[A-Za-z]/.test(line)) {
      joinedLines[joinedLines.length - 1] += line;
    }
    // Continuation with numbers (e.g., "181,9718,03100,000,00" for item 22)
    else if (joinedLines.length > 0 && /^\d/.test(line) && !line.startsWith("total")) {
      joinedLines[joinedLines.length - 1] += line;
    }
  }

  const rows: SalesCategoryRow[] = [];

  for (const line of joinedLines) {
    // Extract rank
    const rankMatch = line.match(/^(\d{1,2})/);
    if (!rankMatch) continue;
    const rank = parseInt(rankMatch[1]);
    let rest = line.substring(rankMatch[0].length);

    // Check if line has discount percentage (ends with " %")
    const hasDiscount = /\s*%\s*$/.test(rest);
    // Strip only the " %" symbol, keep the number
    rest = rest.replace(/\s*%\s*$/, "").trim();

    const parsed = parseDataLine(rest, hasDiscount);
    if (parsed) {
      rows.push({ rank, ...parsed });
    }
  }

  const totals = {
    sold_quantity: rows.reduce((s, r) => s + r.sold_quantity, 0),
    net_sales: rows.reduce((s, r) => s + r.net_sales, 0),
    vat: rows.reduce((s, r) => s + r.vat_amount, 0),
    sales_with_vat: rows.reduce((s, r) => s + r.sales_with_vat, 0),
    net_discount: rows.reduce((s, r) => s + r.net_discount, 0),
  };

  return { period, rows, totals };
}
