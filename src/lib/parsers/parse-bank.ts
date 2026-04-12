import pdfParse from "pdf-parse";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BankTransaction {
  transaction_date: string; // YYYY-MM-DD
  value_date: string;       // YYYY-MM-DD
  amount: number;
  description: string;
  category: string;         // tipo: PAGAMENTO, INCASSO, BONIFICO_IN, BONIFICO_OUT, ALTRO
  subcategory: string;      // causale originale dal PDF
  counterpart: string;      // dettaglio estratto (merchant, n. operazioni, beneficiario)
  running_balance: number;  // saldo movimento
  raw_description: string;  // descrizione completa originale
  cost_category: string;    // macrocategoria costi (compilata dall'utente)
  income_category: string;  // macrocategoria entrate (compilata dall'utente)
  rank?: number;
}

// ─── Costanti ────────────────────────────────────────────────────────────────

const CAUSALI = [
  "PAGAMENTI MEZZO POS",
  "INCASSO TRAMITE P.O.S.",
  "VS. DISPOSIZIONE",
  "COMMISSIONI",
  "PAGAMENTI DIVERSI",
  "BONIFICO A VOSTRO FAVORE",
  "BONIFICO DALL'ESTERO",
  "STORNO OPERAZIONE",
  "CANONE P.O.S.",
  "CANONE",
  "RECUPERO BOLLI",
  "VERSAMENTO CONTANTE SELF",
] as const;

// ─── Regex ───────────────────────────────────────────────────────────────────

/** Importo standalone: "-17,98", "1.169,00" */
const IMPORTO_RE = /^-?[\d.]+,\d{2}$/;

/**
 * Le due date sono incollate senza spazi dal pdf-parse:
 * "30/01/202627/01/2026EUR" → dataMovimento, dataValuta
 */
const DATE_EUR_RE = /^(\d{2}\/\d{2}\/\d{4})(\d{2}\/\d{2}\/\d{4})EUR$/;

// ─── Extract helpers ─────────────────────────────────────────────────────────

function extractMerchant(desc: string): string | null {
  const match = desc.match(/Qta\.:\s*[\d.,]+\s*-\s*(.+?)(?:\s*-\s|\s*\()/);
  if (!match) return null;
  let merchant = match[1].trim();
  merchant = merchant.replace(/\d{6,}$/, "").trim().replace(/-$/, "").trim();
  return merchant || null;
}

function extractIncassoDetail(desc: string): string | null {
  const match = desc.match(/numero\s+(\d+)\s+operazion[ei]/i);
  if (!match) return null;
  const ente = desc.match(/con\s+(?:Ente\s+Autorizzante\s+)?(.+?)(?:\s+\d+)?$/i);
  return `${match[1]} operazioni${ente ? ` (${ente[1].trim()})` : ""}`;
}

function extractBonificoDetail(desc: string): string | null {
  const outMatch = desc.match(/A FAVORE DI\s+(.+?)\s+C\.\s*BENEF\./i);
  if (outMatch) return outMatch[1].trim();
  const inMatch = desc.match(/\/C\d*\s*(.+?)\s+NOTE:/i);
  if (inMatch) return inMatch[1].trim();
  return null;
}

function extractSddCreditor(desc: string): string | null {
  const match = desc.match(/Cred\.?\s*(?:\S+\s+)?([A-Za-z][\w\s.]+?)(?:\s+Deb\.|\s+Rif\.)/i);
  return match ? match[1].trim() : null;
}

// ─── Classificazione ─────────────────────────────────────────────────────────

type TipoTx = "PAGAMENTO" | "INCASSO" | "BONIFICO_IN" | "BONIFICO_OUT" | "ALTRO";

function classifyTransaction(
  causale: string,
  descrizione: string,
  importo: number
): { tipo: TipoTx; dettaglio: string | null } {
  switch (causale) {
    case "PAGAMENTI MEZZO POS":
    case "STORNO OPERAZIONE":
      return { tipo: "PAGAMENTO", dettaglio: extractMerchant(descrizione) };
    case "INCASSO TRAMITE P.O.S.":
      return { tipo: "INCASSO", dettaglio: extractIncassoDetail(descrizione) };
    case "BONIFICO A VOSTRO FAVORE":
    case "BONIFICO DALL'ESTERO":
      return { tipo: "BONIFICO_IN", dettaglio: extractBonificoDetail(descrizione) };
    case "VS. DISPOSIZIONE":
      return { tipo: "BONIFICO_OUT", dettaglio: extractBonificoDetail(descrizione) };
    case "PAGAMENTI DIVERSI":
      return {
        tipo: "PAGAMENTO",
        dettaglio: extractSddCreditor(descrizione) ?? extractBonificoDetail(descrizione),
      };
    case "VERSAMENTO CONTANTE SELF":
      return { tipo: "INCASSO", dettaglio: "Versamento contante" };
    case "COMMISSIONI":
    case "CANONE":
    case "CANONE P.O.S.":
    case "RECUPERO BOLLI":
      return { tipo: "ALTRO", dettaglio: null };
    default:
      return { tipo: importo >= 0 ? "INCASSO" : "PAGAMENTO", dettaglio: null };
  }
}

// ─── Voci di costo (subcategory per uscite) ──────────────────────────────────

// ─── Parse helpers ───────────────────────────────────────────────────────────

/** Parse importo EU: "1.052,69" → 1052.69, "-17,98" → -17.98 */
function parseImporto(raw: string): number {
  return parseFloat(raw.replace(/\./g, "").replace(",", "."));
}

/** Parse date DD/MM/YYYY → YYYY-MM-DD */
function parseDate(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.trim().split("/");
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
}

// ─── State machine parser ────────────────────────────────────────────────────

type ParserState = "SEEK_IMPORTO" | "SEEK_CAUSALE" | "SEEK_DESCRIPTION" | "SEEK_SALDO";

/**
 * Parse bank movements from PDF (BPP "Lista movimenti contabili").
 * Uses a state machine: IMPORTO → CAUSALE → DESCRIPTION → SALDO → repeat.
 */
export async function parseBankMovementsPDF(
  buffer: Buffer
): Promise<{ period: string; transactions: BankTransaction[] }> {
  const pdf = await pdfParse(buffer);
  const lines: string[] = pdf.text
    .split("\n")
    .map((l: string) => l.trim())
    .filter((l: string) => l.length > 0);

  const transactions: BankTransaction[] = [];
  let period = "";
  let state: ParserState = "SEEK_IMPORTO";
  let currentImporto = 0;
  let currentCausale = "";
  let descriptionLines: string[] = [];
  let currentDataMov = "";
  let currentDataVal = "";

  for (const line of lines) {
    // Skip header/footer lines presenti su ogni pagina
    if (
      line.includes("Lista movimenti") ||
      line.includes("Coordinate bancarie") ||
      line.match(/^\d+di\d+Pag/) ||
      line.includes("con * sono evidenziati") ||
      line.includes("Saldo Contabile") ||
      line.includes("Intestato a:") ||
      line.includes("Conto:") ||
      line.match(/^\d{1,2}\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+\d{4}/i) ||
      line.match(/^(Data|Valuta|Descrizione|Importo|Saldo|Divisa)/) ||
      line.match(/^(Cod\.|Car\.|Paese|CIN)/) ||
      line.match(/^IT\d{2}[A-Z]\d/) ||
      line.match(/^\d{3}\s*-\s*\d+/) ||
      line.match(/^SMART WORLD SOCIETA/) ||
      line.match(/^EUR\s*[\d.,]+$/) ||
      line.match(/^CIN\s*ABI/) ||
      line === "-"
    ) {
      continue;
    }

    switch (state) {
      case "SEEK_IMPORTO": {
        if (IMPORTO_RE.test(line)) {
          currentImporto = parseImporto(line);
          state = "SEEK_CAUSALE";
        }
        break;
      }

      case "SEEK_CAUSALE": {
        const matched = CAUSALI.find((c) => line === c || line.startsWith(c));
        if (matched) {
          currentCausale = matched;
          descriptionLines = [];
          state = "SEEK_DESCRIPTION";
        } else {
          // Falso positivo importo, torna a cercare
          state = "SEEK_IMPORTO";
        }
        break;
      }

      case "SEEK_DESCRIPTION": {
        const dateMatch = line.match(DATE_EUR_RE);
        if (dateMatch) {
          currentDataMov = dateMatch[1];
          currentDataVal = dateMatch[2];
          state = "SEEK_SALDO";
        } else {
          descriptionLines.push(line);
        }
        break;
      }

      case "SEEK_SALDO": {
        if (IMPORTO_RE.test(line)) {
          const saldo = parseImporto(line);
          const descrizione = descriptionLines.join(" ");
          const { tipo, dettaglio } = classifyTransaction(
            currentCausale,
            descrizione,
            currentImporto
          );

          const txDate = parseDate(currentDataMov);
          const valDate = parseDate(currentDataVal);
          if (!period && txDate) period = txDate.substring(0, 7);

          transactions.push({
            transaction_date: txDate,
            value_date: valDate,
            amount: currentImporto,
            description: `${currentCausale} - ${descrizione}`.substring(0, 500),
            category: tipo,
            subcategory: currentCausale,
            counterpart: dettaglio || "",
            running_balance: saldo,
            raw_description: descrizione,
            cost_category: "",
            income_category: "",
            rank: transactions.length + 1,
          });
        }
        state = "SEEK_IMPORTO";
        break;
      }
    }
  }

  return { period, transactions };
}
