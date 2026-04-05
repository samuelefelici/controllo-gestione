import { NextRequest, NextResponse } from "next/server";
import { parseSalesByCategory } from "@/lib/parsers/parse-sales";

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

      // Future: bank_movements, amex_statement, payroll
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
