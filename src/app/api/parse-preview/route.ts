import { NextRequest, NextResponse } from "next/server";
import { parseSalesByCategory } from "@/lib/parsers/parse-sales";
import { parseBankMovementsPDF } from "@/lib/parsers/parse-bank";
import { parseAmexStatement } from "@/lib/parsers/parse-amex";
import { parsePayroll } from "@/lib/parsers/parse-payroll";

/**
 * POST /api/parse-preview
 *
 * Parses an uploaded file and returns the extracted data as JSON
 * WITHOUT saving anything to the database. The client can then
 * display an editable preview table and POST to /api/import/confirm
 * when the user is satisfied with the data.
 *
 * FormData:
 *   - file: the document (PDF, XLS, etc.)
 *   - type: "sales_by_category" | "bank_movements" | "amex_statement" | "payroll"
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const fileType = formData.get("type") as string;

    if (!file || !fileType) {
      return NextResponse.json({ error: "Missing file or type" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    switch (fileType) {
      case "sales_by_category": {
        const parsed = await parseSalesByCategory(buffer);
        return NextResponse.json({
          success: true,
          file_type: fileType,
          filename: file.name,
          period: parsed.period,
          columns: [
            { key: "rank", label: "#", type: "number", editable: false },
            { key: "category_name", label: "Categoria", type: "text", editable: true },
            { key: "sold_quantity", label: "Qty", type: "number", editable: true },
            { key: "net_sales", label: "Netto (€)", type: "currency", editable: true },
            { key: "vat_amount", label: "IVA (€)", type: "currency", editable: true },
            { key: "sales_with_vat", label: "Totale (€)", type: "currency", editable: true },
            { key: "net_discount", label: "Sconto (€)", type: "currency", editable: true },
            { key: "discount_pct", label: "Sconto %", type: "percent", editable: true },
          ],
          rows: parsed.rows,
          totals: parsed.totals,
        });
      }

      // Future: amex_statement, payroll
      case "bank_movements": {
        const parsed = await parseBankMovementsPDF(buffer);
        return NextResponse.json({
          success: true,
          file_type: fileType,
          filename: file.name,
          period: parsed.period,
          columns: [
            { key: "rank", label: "#", type: "number", editable: false },
            { key: "transaction_date", label: "Data", type: "text", editable: true },
            { key: "value_date", label: "Valuta", type: "text", editable: true },
            { key: "amount", label: "Importo (€)", type: "currency", editable: true },
            { key: "category", label: "Tipo", type: "text", editable: true },
            { key: "subcategory", label: "Causale", type: "text", editable: true },
            { key: "counterpart", label: "Dettaglio", type: "text", editable: true },
            { key: "running_balance", label: "Saldo (€)", type: "currency", editable: true },
            { key: "description", label: "Descrizione", type: "text", editable: true },
          ],
          rows: parsed.transactions,
          totals: {
            count: parsed.transactions.length,
            total_in: parsed.transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0),
            total_out: parsed.transactions.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0),
          },
        });
      }

      // Future: payroll
      case "amex_statement": {
        const parsed = await parseAmexStatement(buffer);
        return NextResponse.json({
          success: true,
          file_type: fileType,
          filename: file.name,
          period: parsed.period,
          columns: [
            { key: "rank", label: "#", type: "number", editable: false },
            { key: "operation_date", label: "Data Op.", type: "text", editable: true },
            { key: "booking_date", label: "Data Cont.", type: "text", editable: true },
            { key: "amount_eur", label: "Importo (€)", type: "currency", editable: true },
            { key: "category", label: "Categoria", type: "text", editable: true },
            { key: "merchant", label: "Merchant", type: "text", editable: true },
            { key: "location", label: "Luogo", type: "text", editable: true },
            { key: "description", label: "Descrizione", type: "text", editable: true },
          ],
          rows: parsed.transactions,
          totals: {
            count: parsed.transactions.length,
            addebiti: parsed.new_charges,
            accrediti: parsed.credits,
            saldo: parsed.current_balance,
          },
        });
      }

      case "payroll": {
        const parsed = await parsePayroll(buffer);
        return NextResponse.json({
          success: true,
          file_type: fileType,
          filename: file.name,
          period: parsed.period,
          columns: [
            { key: "rank", label: "#", type: "number", editable: false },
            { key: "employee_name", label: "Dipendente", type: "text", editable: true },
            { key: "employee_code", label: "Cod.", type: "number", editable: true },
            { key: "role", label: "Qualifica", type: "text", editable: true },
            { key: "part_time_pct", label: "PT %", type: "percent", editable: true },
            { key: "hire_date", label: "Assunzione", type: "text", editable: true },
            { key: "hours_worked", label: "Ore", type: "number", editable: true },
            { key: "days_worked", label: "GG", type: "number", editable: true },
            { key: "gross_pay", label: "Lordo (€)", type: "currency", editable: true },
            { key: "social_contributions", label: "Contr.Soc. (€)", type: "currency", editable: true },
            { key: "irpef", label: "IRPEF (€)", type: "currency", editable: true },
            { key: "net_pay", label: "Netto (€)", type: "currency", editable: true },
            { key: "tfr_month", label: "TFR (€)", type: "currency", editable: true },
            { key: "total_deductions", label: "Tot.Tratt. (€)", type: "currency", editable: true },
          ],
          rows: parsed.records,
          totals: {
            count: parsed.records.length,
            total_gross: parsed.records.reduce((s, r) => s + r.gross_pay, 0),
            total_net: parsed.records.reduce((s, r) => s + r.net_pay, 0),
            total_tfr: parsed.records.reduce((s, r) => s + r.tfr_month, 0),
          },
        });
      }

      default:
        return NextResponse.json(
          { error: `Tipo file "${fileType}" non ancora supportato per l'anteprima` },
          { status: 400 }
        );
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Parse preview error:", err);
    return NextResponse.json({ error: "Parse fallito", details: message }, { status: 500 });
  }
}
