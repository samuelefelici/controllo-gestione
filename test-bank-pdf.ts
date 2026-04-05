import pdf from "pdf-parse";
import { readFile } from "fs/promises";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Transaction {
  dataMovimento: string;
  dataValuta: string;
  divisa: string;
  importo: number;
  causale: string;
  descrizione: string;
  saldo: number;
  tipo: "PAGAMENTO" | "INCASSO" | "BONIFICO_IN" | "BONIFICO_OUT" | "ALTRO";
  dettaglio: string | null;
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

function classifyTransaction(
  causale: string,
  descrizione: string,
  importo: number
): { tipo: Transaction["tipo"]; dettaglio: string | null } {
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

// ─── Parse importo italiano ──────────────────────────────────────────────────

function parseImporto(raw: string): number {
  return parseFloat(raw.replace(/\./g, "").replace(",", "."));
}

// ─── State machine parser ────────────────────────────────────────────────────

type ParserState = "SEEK_IMPORTO" | "SEEK_CAUSALE" | "SEEK_DESCRIPTION" | "SEEK_SALDO";

export async function parseBankPdf(filePath: string): Promise<Transaction[]> {
  const buffer = await readFile(filePath);
  const { text } = await pdf(buffer);

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const transactions: Transaction[] = [];
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
          // Falso positivo, torna a cercare importo
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

          transactions.push({
            dataMovimento: currentDataMov,
            dataValuta: currentDataVal,
            divisa: "EUR",
            importo: currentImporto,
            causale: currentCausale,
            descrizione,
            saldo,
            tipo,
            dettaglio,
          });
        }
        state = "SEEK_IMPORTO";
        break;
      }
    }
  }

  return transactions;
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: npx tsx test-bank-pdf.ts <path-to-pdf>");
    process.exit(1);
  }

  const transactions = await parseBankPdf(filePath);

  console.log(`\n✅ ${transactions.length} transazioni trovate\n`);

  const byTipo = transactions.reduce(
    (acc, t) => ({ ...acc, [t.tipo]: (acc[t.tipo] || 0) + 1 }),
    {} as Record<string, number>
  );
  console.log("Per tipo:", byTipo);

  const byCausale = transactions.reduce(
    (acc, t) => ({ ...acc, [t.causale]: (acc[t.causale] || 0) + 1 }),
    {} as Record<string, number>
  );
  console.log("Per causale:", byCausale);

  console.log("\nTransazioni:");
  for (const t of transactions) {
    const sign = t.importo >= 0 ? "+" : "";
    console.log(
      `  ${t.dataMovimento} | ${t.tipo.padEnd(13)} | ${(sign + t.importo.toFixed(2)).padStart(12)} | ${t.dettaglio ?? t.causale}`
    );
  }
}

main().catch(console.error);
