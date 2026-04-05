import pdf from "pdf-parse";

export interface AmexTransaction {
  operation_date: string;
  booking_date: string;
  description: string;
  amount_eur: number;
  amount_foreign: number | null;
  currency_foreign: string | null;
  exchange_rate: number | null;
  category: string;
}

export interface AmexResult {
  period: string;
  statement_start: string;
  statement_end: string;
  previous_balance: number;
  new_charges: number;
  credits: number;
  current_balance: number;
  amount_due: number;
  transactions: AmexTransaction[];
}

function categorizeAmex(desc: string): string {
  const d = desc.toUpperCase();
  if (d.includes("BALUWO")) return "baluwo";
  if (d.includes("FACEBK") || d.includes("FACEBOOK")) return "advertising";
  if (d.includes("AMZN") || d.includes("AMAZON")) return "supply_amazon";
  if (d.includes("MICROSOFT")) return "subscription";
  if (d.includes("BUBLUP")) return "subscription";
  if (d.includes("SHOPIFY")) return "subscription";
  if (d.includes("AMZSCOUT")) return "subscription";
  if (d.includes("BRICOBRAVO")) return "supply";
  if (d.includes("WIZZ AIR") || d.includes("RYANAIR") || d.includes("EASYJET")) return "travel";
  if (d.includes("FASTWEB")) return "internet";
  if (d.includes("QUOTA ASSOCIATIVA")) return "amex_fee";
  if (d.includes("IMPOSTA DI BOLLO")) return "tax";
  if (d.includes("ADDEBITO IN C/C")) return "payment";
  if (d.includes("PARIS SUPER MARKET") || d.includes("WOODEN STORE")) return "personal";
  return "other";
}

function parseItalianDate(dateStr: string): string {
  // DD.MM.YY -> YYYY-MM-DD
  const parts = dateStr.split(".");
  if (parts.length !== 3) return "";
  const year = parseInt(parts[2]) < 50 ? `20${parts[2]}` : `19${parts[2]}`;
  return `${year}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
}

export async function parseAmexStatement(buffer: Buffer): Promise<AmexResult> {
  const data = await pdf(buffer);
  const text = data.text;

  // Extract statement period
  const periodMatch = text.match(/Operazioni contabilizzate nel periodo\s*(\d{2}\.\d{2}\.\d{4})\s*-\s*(\d{2}\.\d{2}\.\d{4})/);
  const startDate = periodMatch?.[1]?.replace(/\./g, "/") || "";
  const endDate = periodMatch?.[2]?.replace(/\./g, "/") || "";

  // Derive period from end date
  let period = "";
  if (periodMatch) {
    const parts = periodMatch[2].split(".");
    period = `${parts[2]}-${parts[1]}`;
  }

  // Extract balance info
  const parseNum = (pattern: RegExp): number => {
    const match = text.match(pattern);
    if (!match) return 0;
    return parseFloat(match[1].replace(/\./g, "").replace(",", "."));
  };

  const previousBalance = parseNum(/Saldo Precedente[\s\S]*?([\d.,]+)\s/);
  const amountDue = parseNum(/Importo Dovuto[\s\S]*?([\d.,]+)\s*EUR/);

  // Extract transactions
  // Format: DD.MM.YY DD.MM.YY DESCRIPTION AMOUNT
  const lines = text.split("\n");
  const transactions: AmexTransaction[] = [];
  const txPattern = /^(\d{2}\.\d{2}\.\d{2})\s+(\d{2}\.\d{2}\.\d{2})\s+(.+?)\s+([\d.,]+)$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const match = line.match(txPattern);
    if (match) {
      const opDate = parseItalianDate(match[1]);
      const bookDate = parseItalianDate(match[2]);
      const desc = match[3].trim();
      const amount = parseFloat(match[4].replace(/\./g, "").replace(",", "."));

      if (desc.includes("ADDEBITO IN C/C")) continue; // skip payment line

      const category = categorizeAmex(desc);

      // Check next line for exchange rate info
      let foreignAmount: number | null = null;
      let foreignCurrency: string | null = null;
      let exchangeRate: number | null = null;

      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        const fxMatch = nextLine.match(/Tasso di Cambio\s+([\d.,]+)/);
        const currMatch = nextLine.match(/(Dollari Statunitensi|Rupie Pakistane|Sterline)/);
        if (fxMatch) {
          exchangeRate = parseFloat(fxMatch[1].replace(",", "."));
        }
        if (currMatch) {
          foreignCurrency = currMatch[1] === "Dollari Statunitensi" ? "USD" : currMatch[1] === "Rupie Pakistane" ? "PKR" : "GBP";
        }
      }

      transactions.push({
        operation_date: opDate,
        booking_date: bookDate,
        description: desc,
        amount_eur: amount,
        amount_foreign: foreignAmount,
        currency_foreign: foreignCurrency,
        exchange_rate: exchangeRate,
        category,
      });
    }
  }

  return {
    period,
    statement_start: startDate,
    statement_end: endDate,
    previous_balance: previousBalance,
    new_charges: transactions.reduce((s, t) => s + t.amount_eur, 0),
    credits: 0,
    current_balance: amountDue,
    amount_due: amountDue,
    transactions,
  };
}
