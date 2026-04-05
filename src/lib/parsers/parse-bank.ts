import * as XLSX from "xlsx";

export interface BankTransaction {
  transaction_date: string; // YYYY-MM-DD
  value_date: string;
  amount: number;
  description: string;
  category: string;
  subcategory: string;
  counterpart: string;
  running_balance: number;
  raw_description: string;
}

/**
 * Categorize a bank transaction based on its description.
 */
function categorize(desc: string, amount: number): { category: string; subcategory: string; counterpart: string } {
  const d = desc.toUpperCase();

  // POS income (shop sales)
  if (d.includes("INCASSO TRAMITE P.O.S.") || d.includes("SMART WORLD")) {
    return { category: "pos_income", subcategory: "shop_sales", counterpart: "SMART WORLD POS" };
  }

  // Salaries
  if (d.includes("STIPENDIO") || (d.includes("VS. DISPOSIZIONE") && d.includes("STIPENDIO"))) {
    const nameMatch = desc.match(/A FAVORE DI\s+([^C]+?)C\.\s*BENEF/i);
    return { category: "bonifico_out", subcategory: "salary", counterpart: nameMatch?.[1]?.trim() || "Dipendente" };
  }

  // Supplier payments (Opensky = air tickets)
  if (d.includes("OPENSKY WORLD")) {
    return { category: "bonifico_out", subcategory: "supplier_airtickets", counterpart: "Opensky World SRL" };
  }

  // RIA transfers
  if (d.includes("RIA ITALIA")) {
    if (amount > 0) return { category: "bonifico_in", subcategory: "commission_ria", counterpart: "RIA Italia SRL" };
    return { category: "bonifico_out", subcategory: "money_transfer", counterpart: "RIA Italia SRL" };
  }

  // MoneyGram
  if (d.includes("MONEYGRAM")) {
    return { category: "bonifico_in", subcategory: "commission_mg", counterpart: "MoneyGram" };
  }

  // Western Union (WURSI)
  if (d.includes("WURSI")) {
    return { category: "bonifico_in", subcategory: "commission_wu", counterpart: "WURSI SRL (Western Union)" };
  }

  // Mondu Capital (supplier)
  if (d.includes("MONDU CAPITAL")) {
    return { category: "bonifico_out", subcategory: "supplier_products", counterpart: "Mondu Capital SARL" };
  }

  // NEXI commissions
  if (d.includes("NEXI") && d.includes("COMM")) {
    return { category: "sdd", subcategory: "pos_commission", counterpart: "NEXI Payments" };
  }

  // Fastweb
  if (d.includes("FASTWEB")) {
    return { category: "sdd", subcategory: "internet", counterpart: "Fastweb SpA" };
  }

  // American Express
  if (d.includes("AMERICAN EXPRESS")) {
    return { category: "sdd", subcategory: "credit_card", counterpart: "American Express" };
  }

  // Amazon purchases
  if (d.includes("AMZN") || d.includes("AMAZON")) {
    return { category: "pos_expense", subcategory: "amazon", counterpart: "Amazon" };
  }

  // Travel
  if (d.includes("RYANAIR") || d.includes("WIZZAIR") || d.includes("EASYJET") || d.includes("FLIXBUS") || d.includes("MARINOBUS")) {
    const airline = d.includes("RYANAIR") ? "Ryanair" : d.includes("WIZZAIR") ? "WizzAir" : d.includes("EASYJET") ? "EasyJet" : d.includes("FLIXBUS") ? "FlixBus" : "MarinoBus";
    return { category: "pos_expense", subcategory: "travel", counterpart: airline };
  }

  // Cash deposit
  if (d.includes("VERSAMENTO CONTANTE")) {
    return { category: "cash_deposit", subcategory: "cash", counterpart: "Versamento" };
  }

  // Commissions (bank fees)
  if (d.includes("COMMISSIONI") || d.includes("COMMISSIONE") || d.includes("CANONE")) {
    return { category: "commission", subcategory: "bank_fee", counterpart: "Banca" };
  }

  // Bollo
  if (d.includes("BOLLO") || d.includes("IMPOSTA")) {
    return { category: "commission", subcategory: "tax", counterpart: "Agenzia Entrate" };
  }

  // Storno
  if (d.includes("STORNO")) {
    return { category: "storno", subcategory: "refund", counterpart: "Storno" };
  }

  // Luggage partners
  if (d.includes("CITYSTASHER") || d.includes("RADICAL STORAGE") || d.includes("LUGGAGEHERO") || d.includes("BOUNCE")) {
    const partner = d.includes("CITYSTASHER") ? "CityStasher" : d.includes("RADICAL") ? "Radical Storage" : d.includes("LUGGAGE") ? "LuggageHero" : "Bounce";
    return { category: "bonifico_in", subcategory: "luggage_commission", counterpart: partner };
  }

  // PayPal / subscriptions
  if (d.includes("PAYPAL") && (d.includes("SHOPIFY") || d.includes("OPENAI") || d.includes("QUICKBOOKS") || d.includes("NETFLIX"))) {
    const svc = d.includes("SHOPIFY") ? "Shopify" : d.includes("OPENAI") ? "OpenAI" : d.includes("QUICKBOOKS") ? "QuickBooks" : "Netflix";
    return { category: "pos_expense", subcategory: "subscription", counterpart: svc };
  }

  // BigBuy (ecommerce supplier)
  if (d.includes("BIGBUY")) {
    return { category: "pos_expense", subcategory: "supplier_ecommerce", counterpart: "BigBuy" };
  }

  // Baluwo
  if (d.includes("BALUWO")) {
    return { category: "pos_expense", subcategory: "baluwo", counterpart: "Baluwo" };
  }

  // Leroy Merlin (shop supplies)
  if (d.includes("LEROY MERLIN")) {
    return { category: "pos_expense", subcategory: "shop_supplies", counterpart: "Leroy Merlin" };
  }

  // Alcott (clothing)
  if (d.includes("ALCOTT")) {
    return { category: "pos_expense", subcategory: "personal", counterpart: "Alcott" };
  }

  // Turkish Airlines
  if (d.includes("THY")) {
    return { category: "pos_expense", subcategory: "travel", counterpart: "Turkish Airlines" };
  }

  // Connect SRL
  if (d.includes("CONNECT S.R.L")) {
    return { category: "bonifico_in", subcategory: "commission_connect", counterpart: "Connect SRL" };
  }

  // Default
  if (amount > 0) {
    return { category: "income_other", subcategory: "other", counterpart: "" };
  }
  return { category: "expense_other", subcategory: "other", counterpart: "" };
}

/**
 * Parse date from DD/MM/YYYY format
 */
function parseDate(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.toString().trim().split("/");
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
}

/**
 * Parse bank movements from XLS file (BPP export)
 */
export async function parseBankMovementsXLS(buffer: Buffer): Promise<{ period: string; transactions: BankTransaction[] }> {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  const transactions: BankTransaction[] = [];
  let period = "";

  for (let i = 1; i < rows.length; i++) { // skip header
    const row = rows[i];
    if (!row || !row[0]) continue;

    const txDate = parseDate(String(row[0]));
    const valDate = parseDate(String(row[1]));
    const desc = String(row[2] || "");
    const amount = parseFloat(String(row[4] || "0"));
    const balance = parseFloat(String(row[6] || "0"));

    if (!txDate || isNaN(amount)) continue;

    // Derive period from first transaction
    if (!period && txDate) {
      period = txDate.substring(0, 7); // YYYY-MM
    }

    const { category, subcategory, counterpart } = categorize(desc, amount);

    transactions.push({
      transaction_date: txDate,
      value_date: valDate,
      amount,
      description: desc.substring(0, 500),
      category,
      subcategory,
      counterpart,
      running_balance: balance,
      raw_description: desc,
    });
  }

  return { period, transactions };
}
