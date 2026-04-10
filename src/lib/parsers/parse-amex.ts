import pdfParse from "pdf-parse";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AmexTransaction {
  operation_date: string;   // YYYY-MM-DD
  booking_date: string;     // YYYY-MM-DD
  description: string;      // descrizione completa
  amount_eur: number;       // importo EUR (positivo = spesa, negativo = accredito)
  category: string;         // SPESA | QUOTA | BOLLO | PAGAMENTO_CC
  cost_category: string;    // Macrocategoria manuale (come bank_movements)
  merchant: string;         // nome pulito merchant
  location: string | null;  // città/paese
  is_credit: boolean;       // true se accredito
  rank?: number;
}

export interface AmexResult {
  period: string;
  statement_start: string;
  statement_end: string;
  previous_balance: number;
  new_charges: number;
  credits: number;
  current_balance: number;
  transactions: AmexTransaction[];
}

// ─── Regex ───────────────────────────────────────────────────────────────────

/** Riga transazione AMEX: DD.MM.YYDD.MM.YY<descrizione> */
const TX_LINE_RE = /^(\d{2}\.\d{2}\.\d{2})(\d{2}\.\d{2}\.\d{2})(.+)$/;

/** Importo EUR standalone: "100,00" o "3.402,00" */
const AMOUNT_RE = /^[\d.]+,\d{2}$/;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** DD.MM.YY → YYYY-MM-DD */
function parseDate(ddmmyy: string): string {
  const d = ddmmyy.slice(0, 2);
  const m = ddmmyy.slice(3, 5);
  const yy = ddmmyy.slice(6, 8);
  const yyyy = parseInt(yy) > 50 ? `19${yy}` : `20${yy}`;
  return `${yyyy}-${m}-${d}`;
}

/** "1.052,69" → 1052.69 */
function parseImporto(raw: string): number {
  return parseFloat(raw.replace(/\./g, "").replace(",", "."));
}

function cleanDescription(raw: string): {
  merchant: string;
  location: string | null;
} {
  const trimmed = raw.trim();
  // Split on multiple spaces to separate merchant from location
  const parts = trimmed.split(/\s{2,}/);
  if (parts.length >= 2) {
    return {
      merchant: parts[0].trim(),
      location: parts.slice(1).join(" ").trim() || null,
    };
  }
  return { merchant: trimmed, location: null };
}

function categorize(desc: string, isCredito: boolean): string {
  if (isCredito || desc.includes("ADDEBITO IN C/C")) return "PAGAMENTO_CC";
  if (desc.includes("QUOTA ASSOCIATIVA")) return "QUOTA";
  if (desc.includes("IMPOSTA DI BOLLO")) return "BOLLO";
  return "SPESA";
}

// ─── Core parser ─────────────────────────────────────────────────────────────

export async function parseAmexStatement(
  buffer: Buffer
): Promise<AmexResult> {
  const pdf = await pdfParse(buffer);
  const lines: string[] = pdf.text
    .split("\n")
    .map((l: string) => l.trim())
    .filter((l: string) => l.length > 0);

  // ── 1. Estrai metadati dall'header ──
  let saldoPrecedente = 0;
  let accrediti = 0;
  let addebiti = 0;
  let saldoAttuale = 0;
  let periodoInizio = "";
  let periodoFine = "";

  for (const line of lines) {
    // "3.402,00-3.402,00+787,39=787,39"
    const summaryMatch = line.match(
      /^([\d.,]+)\s*-\s*([\d.,]+)\s*\+\s*([\d.,]+)\s*=\s*([\d.,]+)$/
    );
    if (summaryMatch) {
      saldoPrecedente = parseImporto(summaryMatch[1]);
      accrediti = parseImporto(summaryMatch[2]);
      addebiti = parseImporto(summaryMatch[3]);
      saldoAttuale = parseImporto(summaryMatch[4]);
    }

    // Periodo: "15.12.202514.01.2026" (concatenato)
    const periodoMatch = line.match(/^(\d{2}\.\d{2}\.\d{4})(\d{2}\.\d{2}\.\d{4})$/);
    if (periodoMatch && !periodoInizio) {
      periodoInizio = periodoMatch[1].replace(/\./g, "/");
      periodoFine = periodoMatch[2].replace(/\./g, "/");
    }
  }

  // Derive period from periodoFine (MM/YYYY → YYYY-MM)
  let period = "";
  if (periodoFine) {
    const parts = periodoFine.split("/");
    if (parts.length === 3) {
      period = `${parts[2]}-${parts[1]}`;
    }
  }

  // ── 2. Raccogli righe transazione (descrizioni) ──
  const txDescriptions: {
    dataOp: string;
    dataCont: string;
    desc: string;
    isCC: boolean;
  }[] = [];

  for (const line of lines) {
    const txMatch = line.match(TX_LINE_RE);
    if (txMatch) {
      const [, dataOp, dataCont, desc] = txMatch;
      const isCC = desc.includes("ADDEBITO IN C/C");
      txDescriptions.push({ dataOp, dataCont, desc: desc.trim(), isCC });
    }
  }

  // ── 3. Raccogli importi EUR (blocco importi) ──
  const allAmounts: number[] = [];
  let inAmountZone = false;
  let skipForeignCurrency = false;

  for (const line of lines) {
    if (line.startsWith("Nuovi addebiti per") || line.includes("Nuovi addebiti per")) {
      inAmountZone = true;
      continue;
    }
    if (line === "INTERESSI, ALTRI ADDEBITI E ACCREDITI") {
      inAmountZone = true;
      continue;
    }
    if (line.includes("Totale nuove operazioni") || line.includes("Totale interessi")) {
      inAmountZone = false;
      continue;
    }

    // Skip foreign currency
    if (
      line.includes("Dollari Statunitensi") ||
      line.includes("Rupie Pakistane") ||
      line.includes("Sterline") ||
      line.includes("Yen") ||
      line.includes("Franchi")
    ) {
      skipForeignCurrency = true;
      continue;
    }
    if (skipForeignCurrency && line.match(/^[\d,.]+$/)) {
      skipForeignCurrency = false;
      continue;
    }
    skipForeignCurrency = false;

    if (inAmountZone && AMOUNT_RE.test(line)) {
      allAmounts.push(parseImporto(line));
    }
  }

  // ── 4. Match descrizioni con importi ──
  const nonCCDescriptions = txDescriptions.filter((t) => !t.isCC);
  const ccDescriptions = txDescriptions.filter((t) => t.isCC);

  const transactions: AmexTransaction[] = [];
  let rankCounter = 1;

  // Aggiungi ADDEBITO IN C/C come accredito
  for (const cc of ccDescriptions) {
    transactions.push({
      operation_date: parseDate(cc.dataOp),
      booking_date: parseDate(cc.dataCont),
      description: cc.desc,
      amount_eur: -accrediti,
      category: "PAGAMENTO_CC",
      cost_category: "",
      merchant: "ADDEBITO IN C/C",
      location: null,
      is_credit: true,
      rank: rankCounter++,
    });
  }

  // Match importi con descrizioni non-CC
  for (let i = 0; i < nonCCDescriptions.length; i++) {
    const tx = nonCCDescriptions[i];
    const importo = i < allAmounts.length ? allAmounts[i] : 0;
    const { merchant, location } = cleanDescription(tx.desc);

    transactions.push({
      operation_date: parseDate(tx.dataOp),
      booking_date: parseDate(tx.dataCont),
      description: tx.desc,
      amount_eur: importo,
      category: categorize(tx.desc, false),
      cost_category: "",
      merchant,
      location,
      is_credit: false,
      rank: rankCounter++,
    });
  }

  // Ordina per data operazione
  transactions.sort((a, b) => {
    return a.operation_date.localeCompare(b.operation_date);
  });
  // Ri-assegna rank dopo ordinamento
  transactions.forEach((t, i) => { t.rank = i + 1; });

  return {
    period,
    statement_start: periodoInizio,
    statement_end: periodoFine,
    previous_balance: saldoPrecedente,
    new_charges: addebiti,
    credits: accrediti,
    current_balance: saldoAttuale,
    transactions,
  };
}
