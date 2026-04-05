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
  period: string; // '2026-01'
  rows: SalesCategoryRow[];
  totals: {
    sold_quantity: number;
    net_sales: number;
    vat: number;
    sales_with_vat: number;
    net_discount: number;
  };
}

/**
 * Parse the "Sales by Category" PDF exported from Erply (YESTORE).
 * 
 * Expected format:
 *   Period: DD/MM/YYYY – DD/MM/YYYY
 *   Rows: rank | name | qty | net_sales | vat | sales_total | discount | discount_%
 *   Last row: total (€) ...
 */
export async function parseSalesByCategory(buffer: Buffer): Promise<SalesCategoryResult> {
  const data = await pdf(buffer);
  const text = data.text;

  // Extract period
  const periodMatch = text.match(/Period:\s*(\d{2})\/(\d{2})\/(\d{4})\s*[–-]\s*(\d{2})\/(\d{2})\/(\d{4})/);
  let period = "";
  if (periodMatch) {
    const year = periodMatch[3];
    const month = periodMatch[2];
    period = `${year}-${month}`;
  }

  const lines = text.split("\n").map((l: string) => l.trim()).filter(Boolean);
  const rows: SalesCategoryRow[] = [];

  // Pattern: number NAME numbers...
  // The Erply export has columns: rank, Name, Sold qty, Net sales, VAT, Sales total, Net discount, Net discount %
  const rowPattern = /^(\d+)\s+(.+?)\s+([\d,.]+)\s+([\d,. ]+)\s+([\d,.]+)\s+([\d,. ]+)\s+([\d,.]+)\s*([\d,.]+\s*%?)?$/;

  for (const line of lines) {
    if (line.startsWith("total")) continue;
    if (line.includes("Period:") || line.includes("Gift cards") || line.includes("Currency")) continue;

    // Try to parse as a data row
    // Erply PDF text extraction is messy, so we use a more flexible approach
    const parts = line.split(/\s{2,}/); // split by 2+ spaces
    if (parts.length >= 4) {
      const rankStr = parts[0]?.trim();
      const rank = parseInt(rankStr);
      if (isNaN(rank) || rank < 1 || rank > 100) continue;

      const name = parts[1]?.trim();
      if (!name || name === "Name") continue;

      // Parse remaining numeric fields
      const nums = parts.slice(2).map((s: string) =>
        parseFloat(s.replace(/[€%\s]/g, "").replace(/\./g, "").replace(",", "."))
      );

      if (nums.length >= 4 && !isNaN(nums[0])) {
        rows.push({
          rank,
          category_name: name,
          sold_quantity: Math.round(nums[0]) || 0,
          net_sales: nums[1] || 0,
          vat_amount: nums[2] || 0,
          sales_with_vat: nums[3] || 0,
          net_discount: nums[4] || 0,
          discount_pct: nums[5] || 0,
        });
      }
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
