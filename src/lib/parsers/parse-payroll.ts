import pdf from "pdf-parse";

export interface PayrollRecord {
  employee_code: number;
  employee_name: string;
  role: string;
  part_time_pct: number;
  hire_date: string;
  hours_worked: number;
  days_worked: number;
  gross_pay: number;
  social_contributions: number;
  irpef: number;
  net_pay: number;
  tfr_month: number;
  additional_regional: number;
  additional_municipal: number;
  total_deductions: number;
}

export interface PayrollResult {
  period: string;
  records: PayrollRecord[];
  company: string;
}

/**
 * Parse payroll PDF (Cedolini) from TeamSystem format.
 * Each page is one employee's payslip.
 */
export async function parsePayroll(buffer: Buffer): Promise<PayrollResult> {
  const data = await pdf(buffer);
  const text = data.text;

  // Extract company name
  const companyMatch = text.match(/Ditta\s*\n\s*(.+?)(?:\n|VIA)/);
  const company = companyMatch?.[1]?.trim() || "SMART WORLD SRLS";

  // Extract period: "GENNAIO 2026" pattern
  const periodMatch = text.match(/(GENNAIO|FEBBRAIO|MARZO|APRILE|MAGGIO|GIUGNO|LUGLIO|AGOSTO|SETTEMBRE|OTTOBRE|NOVEMBRE|DICEMBRE)\s+(\d{4})/i);
  const monthNames: Record<string, string> = {
    GENNAIO: "01", FEBBRAIO: "02", MARZO: "03", APRILE: "04",
    MAGGIO: "05", GIUGNO: "06", LUGLIO: "07", AGOSTO: "08",
    SETTEMBRE: "09", OTTOBRE: "10", NOVEMBRE: "11", DICEMBRE: "12",
  };
  let period = "";
  if (periodMatch) {
    const monthNum = monthNames[periodMatch[1].toUpperCase()] || "01";
    period = `${periodMatch[2]}-${monthNum}`;
  }

  // Split by pages (each employee is on a separate page)
  // The TeamSystem format repeats headers per page
  const pages = text.split(/Foglio N\./);
  const records: PayrollRecord[] = [];

  for (const page of pages) {
    if (!page.includes("COGNOME E NOME") && !page.includes("TOTALE LORDO")) continue;

    try {
      // Employee code and name
      const codeNameMatch = page.match(/(\d{1,3})\s+([\w\s]+?)(?:\d{2}\/\d{2}\/\d{2})/);
      const employeeName = codeNameMatch?.[2]?.trim() || "";
      const employeeCode = parseInt(codeNameMatch?.[1] || "0");

      if (!employeeName) continue;

      // Role (QUALIFICA line)
      const roleMatch = page.match(/(?:AUSILIARIO|AIUTO|ADD\.|COMMESSO|VENDITA|AMMINISTRATIV)[^\n]*/i);
      const role = roleMatch?.[0]?.trim() || "";

      // Part time percentage
      const ptMatch = page.match(/(?:% P\.\s*TIME|P\.TIME)\s*(\d+[,.]?\d*)/);
      const partTimePct = ptMatch ? parseFloat(ptMatch[1].replace(",", ".")) : 100;

      // Hire date
      const hireDateMatch = page.match(/DATA ASSUNZ\.\s*(\d{2}\/\d{2}\/\d{2})/);
      const hireDate = hireDateMatch?.[1] || "";

      // Hours and days
      const hoursMatch = page.match(/ORE\.CONTR\.\s*\n?\s*([\d,.]+)/);
      const hours = hoursMatch ? parseFloat(hoursMatch[1].replace(",", ".")) : 0;

      const daysMatch = page.match(/GG\.\s*CONTR\.\s*[\n\s]*([\d]+)/);
      const days = daysMatch ? parseInt(daysMatch[1]) : 0;

      // TOTALE LORDO
      const grossMatch = page.match(/TOTALE LORDO\s*\n?\s*([\d.,]+)/);
      const grossPay = grossMatch ? parseFloat(grossMatch[1].replace(/\./g, "").replace(",", ".")) : 0;

      // TOT. CONTR. SOC.
      const contrMatch = page.match(/TOT\.\s*CONTR\.\s*SOC\.\s*\n?\s*([\d.,]+)/);
      const socialContributions = contrMatch ? parseFloat(contrMatch[1].replace(/\./g, "").replace(",", ".")) : 0;

      // NETTO BUSTA
      const netMatch = page.match(/NETTO BUSTA\s*\n?\s*([\d.,]+)/);
      const netPay = netMatch ? parseFloat(netMatch[1].replace(/\./g, "").replace(",", ".")) : 0;

      // TFR MESE
      const tfrMatch = page.match(/TFR MESE\s*\n?\s*([\d.,]+)/);
      const tfrMonth = tfrMatch ? parseFloat(tfrMatch[1].replace(/\./g, "").replace(",", ".")) : 0;

      // IRPEF (TOT. TRAT. IRPEF)
      const irpefMatch = page.match(/TOT\.\s*TRAT\.\s*IRPEF\s*\n?\s*([\d.,]+)/);
      const irpef = irpefMatch ? parseFloat(irpefMatch[1].replace(/\./g, "").replace(",", ".")) : 0;

      // Total deductions
      const deductMatch = page.match(/TOT\.\s*TRATTENUTE\s*\n?\s*([\d.,]+)/);
      const totalDeductions = deductMatch ? parseFloat(deductMatch[1].replace(/\./g, "").replace(",", ".")) : 0;

      // Addizionale regionale
      const regMatch = page.match(/ADDIZ\.\s*REGIONALE\s*\n?\s*([\d.,]+)/);
      const additionalRegional = regMatch ? parseFloat(regMatch[1].replace(/\./g, "").replace(",", ".")) : 0;

      // Addizionale comunale
      const comMatch = page.match(/ADDIZ\.\s*COMUNALE\s*\n?\s*([\d.,]+)/);
      const additionalMunicipal = comMatch ? parseFloat(comMatch[1].replace(/\./g, "").replace(",", ".")) : 0;

      if (grossPay > 0) {
        records.push({
          employee_code: employeeCode,
          employee_name: employeeName,
          role,
          part_time_pct: partTimePct,
          hire_date: hireDate,
          hours_worked: hours,
          days_worked: days,
          gross_pay: grossPay,
          social_contributions: socialContributions,
          irpef,
          net_pay: netPay,
          tfr_month: tfrMonth,
          additional_regional: additionalRegional,
          additional_municipal: additionalMunicipal,
          total_deductions: totalDeductions,
        });
      }
    } catch (err) {
      console.error("Error parsing payroll page:", err);
    }
  }

  return { period, records, company };
}
