import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { parseSalesByCategory } from "@/lib/parsers/parse-sales";
import { parseBankMovementsXLS } from "@/lib/parsers/parse-bank";
import { parsePayroll } from "@/lib/parsers/parse-payroll";
import { parseAmexStatement } from "@/lib/parsers/parse-amex";

type FileType = "sales_by_category" | "bank_movements" | "amex_statement" | "payroll";

/**
 * POST /api/upload
 * 
 * Accepts multipart form data with:
 *   - file: the document (PDF or XLS)
 *   - type: one of the FileType values
 *   - period: optional override (e.g. "2026-01")
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const fileType = formData.get("type") as FileType;
    const periodOverride = formData.get("period") as string | null;
    const clientId = formData.get("client_id") as string | null;

    if (!file || !fileType) {
      return NextResponse.json({ error: "Missing file or type" }, { status: 400 });
    }

    if (!clientId) {
      return NextResponse.json({ error: "Missing client_id" }, { status: 400 });
    }

    const validTypes: FileType[] = ["sales_by_category", "bank_movements", "amex_statement", "payroll"];
    if (!validTypes.includes(fileType)) {
      return NextResponse.json({ error: `Invalid type. Use: ${validTypes.join(", ")}` }, { status: 400 });
    }

    const sb = getServiceSupabase();
    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = file.name;

    // 1. Upload file to Supabase Storage (organized by client)
    const storagePath = `clients/${clientId}/${fileType}/${Date.now()}_${filename}`;
    const { error: uploadError } = await sb.storage
      .from("documents")
      .upload(storagePath, buffer, { contentType: file.type });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return NextResponse.json({ error: "File upload failed", details: uploadError.message }, { status: 500 });
    }

    // 2. Track upload
    const { data: uploadRecord } = await sb.from("file_uploads").insert({
      client_id: clientId,
      filename,
      file_type: fileType,
      storage_path: storagePath,
      status: "parsing",
    }).select().single();

    // 3. Parse based on type
    let result: any;
    let rowsImported = 0;
    let period = periodOverride || "";

    try {
      switch (fileType) {
        case "sales_by_category": {
          const parsed = await parseSalesByCategory(buffer);
          period = period || parsed.period;

          // Upsert into sales_by_category table
          for (const row of parsed.rows) {
            await sb.from("sales_by_category").upsert({
              client_id: clientId,
              period,
              category_name: row.category_name,
              sold_quantity: row.sold_quantity,
              net_sales: row.net_sales,
              vat_amount: row.vat_amount,
              sales_with_vat: row.sales_with_vat,
              net_discount: row.net_discount,
              discount_pct: row.discount_pct,
            }, { onConflict: "client_id,period,category_name" });
          }
          rowsImported = parsed.rows.length;
          result = { period, categories: parsed.rows.length, totals: parsed.totals };
          break;
        }

        case "bank_movements": {
          const parsed = await parseBankMovementsXLS(buffer);
          period = period || parsed.period;

          // Delete existing transactions for this period and client, then insert
          await sb.from("bank_transactions").delete().eq("period", period).eq("client_id", clientId);

          // Insert in batches of 50
          const batches = [];
          for (let i = 0; i < parsed.transactions.length; i += 50) {
            batches.push(parsed.transactions.slice(i, i + 50));
          }
          for (const batch of batches) {
            await sb.from("bank_transactions").insert(
              batch.map((tx) => ({ ...tx, period, client_id: clientId }))
            );
          }
          rowsImported = parsed.transactions.length;

          // Auto-compute commission totals from bank data
          const commWU = parsed.transactions
            .filter((t) => t.subcategory === "commission_wu")
            .reduce((s, t) => s + t.amount, 0);
          const commRIA = parsed.transactions
            .filter((t) => t.subcategory === "commission_ria")
            .reduce((s, t) => s + t.amount, 0);
          const commMG = parsed.transactions
            .filter((t) => t.subcategory === "commission_mg")
            .reduce((s, t) => s + t.amount, 0);

          // Upsert revenue lines for commissions
          for (const [source, amount] of [["wu", commWU], ["ria", commRIA], ["mg", commMG]] as const) {
            if (amount > 0) {
              await sb.from("revenue_lines").upsert(
                { client_id: clientId, period, source, amount, notes: "Auto-parsed from bank movements" },
                { onConflict: "client_id,period,source" }
              );
            }
          }

          result = { period, transactions: rowsImported, commissions: { wu: commWU, ria: commRIA, mg: commMG } };
          break;
        }

        case "amex_statement": {
          const parsed = await parseAmexStatement(buffer);
          period = period || parsed.period;

          await sb.from("amex_transactions").delete().eq("period", period).eq("client_id", clientId);
          if (parsed.transactions.length > 0) {
            await sb.from("amex_transactions").insert(
              parsed.transactions.map((tx) => ({ ...tx, period, client_id: clientId }))
            );
          }
          rowsImported = parsed.transactions.length;
          result = { period, transactions: rowsImported, amount_due: parsed.amount_due };
          break;
        }

        case "payroll": {
          const parsed = await parsePayroll(buffer);
          period = period || parsed.period;

          for (const rec of parsed.records) {
            await sb.from("payroll").upsert({
              client_id: clientId,
              period,
              employee_code: rec.employee_code,
              employee_name: rec.employee_name,
              role: rec.role,
              part_time_pct: rec.part_time_pct,
              hire_date: rec.hire_date || null,
              hours_worked: rec.hours_worked,
              days_worked: rec.days_worked,
              gross_pay: rec.gross_pay,
              social_contributions: rec.social_contributions,
              irpef: rec.irpef,
              net_pay: rec.net_pay,
              tfr_month: rec.tfr_month,
              additional_regional: rec.additional_regional,
              additional_municipal: rec.additional_municipal,
              total_deductions: rec.total_deductions,
            }, { onConflict: "client_id,period,employee_name" });
          }
          rowsImported = parsed.records.length;

          // Auto-update expense line for salaries
          const totalLordo = parsed.records.reduce((s, r) => s + r.gross_pay, 0);
          const totalTfr = parsed.records.reduce((s, r) => s + r.tfr_month, 0);
          await sb.from("expense_lines").upsert(
            { client_id: clientId, period, category: "stipendi", amount: totalLordo + totalTfr, notes: `Lordo ${totalLordo.toFixed(2)} + TFR ${totalTfr.toFixed(2)}` },
            { onConflict: "client_id,period,category" }
          );

          result = { period, employees: rowsImported, total_gross: totalLordo, total_tfr: totalTfr };
          break;
        }
      }

      // 4. Update upload record
      await sb.from("file_uploads").update({
        status: "parsed",
        period,
        rows_imported: rowsImported,
        parsed_at: new Date().toISOString(),
      }).eq("id", uploadRecord?.id);

      // 5. Ensure monthly_summary exists
      await sb.from("monthly_summary").upsert({
        client_id: clientId,
        period,
        year: parseInt(period.split("-")[0]),
        month: parseInt(period.split("-")[1]),
      }, { onConflict: "client_id,period" });

      // 6. Auto-recalculate monthly summary
      try {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        await fetch(`${baseUrl}/api/parse/recalculate?period=${period}&client_id=${clientId}`, { method: "POST" });
      } catch (recalcErr) {
        console.warn("Auto-recalculate failed (non-blocking):", recalcErr);
      }

      return NextResponse.json({
        success: true,
        file_type: fileType,
        period,
        rows_imported: rowsImported,
        result,
      });

    } catch (parseError: any) {
      console.error("Parse error:", parseError);
      await sb.from("file_uploads").update({
        status: "error",
        error_message: parseError.message,
      }).eq("id", uploadRecord?.id);

      return NextResponse.json({ error: "Parse failed", details: parseError.message }, { status: 500 });
    }

  } catch (err: any) {
    console.error("Upload error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
