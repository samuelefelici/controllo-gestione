import pdfParse from "pdf-parse";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PayrollRecord {
  employee_code: number;
  employee_name: string;
  role: string;
  part_time_pct: number | null; // null = full time (100)
  hire_date: string;
  hours_worked: number;
  days_worked: number;
  gross_pay: number;
  social_contributions: number;
  irpef: number;
  net_pay: number;
  tfr_month: number;
  total_deductions: number;
  rank?: number;
}

export interface PayrollResult {
  period: string;
  records: PayrollRecord[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseNum(raw: string): number {
  if (!raw || !raw.trim()) return 0;
  return parseFloat(raw.trim().replace(/\./g, "").replace(",", ".")) || 0;
}

function extractNumbers(line: string): number[] {
  const matches = line.match(/-?[\d.]+,\d{2}/g);
  return matches ? matches.map(parseNum) : [];
}

const MONTH_MAP: Record<string, string> = {
  GENNAIO: "01", FEBBRAIO: "02", MARZO: "03", APRILE: "04",
  MAGGIO: "05", GIUGNO: "06", LUGLIO: "07", AGOSTO: "08",
  SETTEMBRE: "09", OTTOBRE: "10", NOVEMBRE: "11", DICEMBRE: "12",
};

// ─── Core parser ─────────────────────────────────────────────────────────────

const HEADER_RE =
  /(GENNAIO|FEBBRAIO|MARZO|APRILE|MAGGIO|GIUGNO|LUGLIO|AGOSTO|SETTEMBRE|OTTOBRE|NOVEMBRE|DICEMBRE)\s+(\d{4})\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+(\d+)\s+(.+?)(?:\d{2}\/\d{2}\/\d{2})/;

export async function parsePayroll(
  buffer: Buffer
): Promise<PayrollResult> {
  const pdf = await pdfParse(buffer);
  const lines: string[] = pdf.text.split("\n");

  let period = "";
  const records: PayrollRecord[] = [];

  // Trova gli indici dove inizia ogni cedolino
  const payslipStarts: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (HEADER_RE.test(lines[i].trim())) {
      payslipStarts.push(i);
    }
  }

  for (let ps = 0; ps < payslipStarts.length; ps++) {
    const startIdx = payslipStarts[ps];
    const endIdx = ps + 1 < payslipStarts.length
      ? payslipStarts[ps + 1]
      : lines.length;

    const block = lines.slice(startIdx, endIdx).map((l: string) => l.trim());

    // ── 1. Riga anagrafica ──
    const headerMatch = block[0].match(HEADER_RE);
    if (!headerMatch) continue;

    const mese = headerMatch[1];
    const anno = parseInt(headerMatch[2]);
    const codice = parseInt(headerMatch[3]);
    const cognomeNome = headerMatch[4].trim();

    // Periodo dal primo cedolino
    if (!period) {
      period = `${anno}-${MONTH_MAP[mese] || "01"}`;
    }

    // Data assunzione
    const dateMatch = block[0].match(/(\d{2}\/\d{2}\/\d{2})\s+(\d{2}\/\d{2})/);
    const dataAssunzione = dateMatch ? dateMatch[1] : "";

    // ── 2. CF + GG/Ore (riga successiva) ──
    const cfLine = block[1] || "";
    const ggOreMatch = cfLine.match(/(\d{2,3})\s+([\d.,]+)$/);
    const ggContributivi = ggOreMatch ? parseInt(ggOreMatch[1]) : 0;
    const oreContributive = ggOreMatch ? parseNum(ggOreMatch[2]) : 0;

    // ── 3. Qualifica + part time ──
    const qualLine = block[2] || "";
    const qualMatch = qualLine.match(/^\d+\s+(.+?)(?:\s+([\d.,]+))?\s+(\d)\^?\s+(\d)$/);
    const qualifica = qualMatch ? qualMatch[1].trim() : "";
    const percentualePartTime = qualMatch && qualMatch[2] ? parseNum(qualMatch[2]) : null;

    // ── 4. Totali ──
    let totaleLordo = 0;
    let imponibileContributivo = 0;
    let contributiSociali = 0;
    let imponibileIrpef = 0;
    let irpefLorda = 0;
    let totaleDetrazioni = 0;
    let totaleTrattenuteIrpef = 0;
    let totaleTrattenute = 0;
    let nettoBusta = 0;
    let tfrMese = 0;

    for (let j = 0; j < block.length; j++) {
      const line = block[j];
      const nums = extractNumbers(line);

      // TOTALE LORDO + IMPON CONTR + CONTRIBUTO
      if (nums.length >= 4 && !totaleLordo) {
        const isLordo = j > 10 && nums[0] > 100 && nums[1] > 50 && nums[0] >= nums[1];
        if (isLordo) {
          totaleLordo = nums[0];
          imponibileContributivo = nums[1];
          contributiSociali = nums[2];
        }
      }

      // IMP IRPEF, IRPEF LORDA, TOT DETR, TOT TRAT IRPEF
      if (totaleLordo && !imponibileIrpef && nums.length >= 4) {
        const couldBeIrpef = nums[0] > 50 && nums[0] < totaleLordo && nums[1] < nums[0];
        if (couldBeIrpef) {
          imponibileIrpef = nums[0];
          irpefLorda = nums[1];
          totaleDetrazioni = nums[2];
          totaleTrattenuteIrpef = nums[3];
        }
      }

      // NETTO BUSTA
      const nettoMatch = line.match(/([\d.,]+)\s+([\d.,]+)\s+F\s+GIORNO FESTIVO/);
      if (nettoMatch) {
        nettoBusta = parseNum(nettoMatch[2]);
      }

      // DATI STATISTICI: ore, imponibile INAIL, TFR
      const statsMatch = line.match(
        /^[O01]\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+\d+\s+([\d.,]+)\s+([\d.,]+)$/
      );
      if (statsMatch && !tfrMese) {
        tfrMese = parseNum(statsMatch[5]);
      }

      // TOT TRATTENUTE
      if (totaleLordo && imponibileIrpef && !totaleTrattenute) {
        if (nums.length >= 2 && nums.length <= 3) {
          const lastNum = nums[nums.length - 1];
          if (lastNum > 100 && lastNum < totaleLordo) {
            totaleTrattenute = lastNum;
          }
        }
      }
    }

    if (totaleLordo > 0) {
      records.push({
        employee_code: codice,
        employee_name: cognomeNome,
        role: qualifica,
        part_time_pct: percentualePartTime,
        hire_date: dataAssunzione,
        hours_worked: oreContributive,
        days_worked: ggContributivi,
        gross_pay: totaleLordo,
        social_contributions: contributiSociali,
        irpef: totaleTrattenuteIrpef,
        net_pay: nettoBusta,
        tfr_month: tfrMese,
        total_deductions: totaleTrattenute,
        rank: records.length + 1,
      });
    }
  }

  return { period, records };
}
