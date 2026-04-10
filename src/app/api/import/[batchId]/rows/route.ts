import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";

/**
 * GET  /api/import/[batchId]/rows  — Fetch all rows for a batch
 * PUT  /api/import/[batchId]/rows  — Replace all rows for a batch (edit history)
 */

async function fetchBatchRows(sb: ReturnType<typeof getServiceSupabase>, batch: any) {
  const { file_type, client_id, period, id: batchId } = batch;

  switch (file_type) {
    case "sales_by_category": {
      const { data, error } = await sb
        .from("sales_by_category")
        .select("*")
        .eq("import_batch_id", batchId)
        .order("rank", { ascending: true });
      if (error) throw error;
      return data || [];
    }
    case "bank_movements": {
      const { data, error } = await sb
        .from("bank_transactions")
        .select("*")
        .eq("client_id", client_id)
        .eq("period", period)
        .order("transaction_date", { ascending: true });
      if (error) throw error;
      return data || [];
    }
    case "amex_statement": {
      const { data, error } = await sb
        .from("amex_transactions")
        .select("*")
        .eq("client_id", client_id)
        .eq("period", period)
        .order("operation_date", { ascending: true });
      if (error) throw error;
      return data || [];
    }
    case "payroll": {
      const { data, error } = await sb
        .from("payroll")
        .select("*")
        .eq("client_id", client_id)
        .eq("period", period)
        .order("employee_name", { ascending: true });
      if (error) throw error;
      return data || [];
    }
    case "invoices": {
      const { data, error } = await sb
        .from("invoices")
        .select("*")
        .eq("import_batch_id", batchId)
        .order("supplier_name", { ascending: true });
      if (error) throw error;
      return data || [];
    }
    default:
      return [];
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  try {
    const { batchId } = await params;
    const sb = getServiceSupabase();

    const { data: batch, error: batchError } = await sb
      .from("import_batches")
      .select("*")
      .eq("id", batchId)
      .single();

    if (batchError || !batch) {
      return NextResponse.json({ error: "Batch non trovato" }, { status: 404 });
    }

    if (batch.undone_at) {
      return NextResponse.json({ error: "Batch annullato" }, { status: 400 });
    }

    const rows = await fetchBatchRows(sb, batch);

    return NextResponse.json({
      success: true,
      file_type: batch.file_type,
      period: batch.period,
      rows,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Fetch batch rows error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  try {
    const { batchId } = await params;
    const body = await request.json();
    const { rows } = body;

    if (!rows || !Array.isArray(rows)) {
      return NextResponse.json({ error: "rows è obbligatorio" }, { status: 400 });
    }

    const sb = getServiceSupabase();

    const { data: batch, error: batchError } = await sb
      .from("import_batches")
      .select("*")
      .eq("id", batchId)
      .single();

    if (batchError || !batch) {
      return NextResponse.json({ error: "Batch non trovato" }, { status: 404 });
    }

    if (batch.undone_at) {
      return NextResponse.json({ error: "Batch annullato, impossibile modificare" }, { status: 400 });
    }

    const { file_type, client_id, period } = batch;

    // 1. Delete old rows
    switch (file_type) {
      case "sales_by_category": {
        const { error } = await sb
          .from("sales_by_category")
          .delete()
          .eq("import_batch_id", batchId);
        if (error) throw error;
        break;
      }
      case "bank_movements": {
        const { error } = await sb
          .from("bank_transactions")
          .delete()
          .eq("client_id", client_id)
          .eq("period", period);
        if (error) throw error;
        break;
      }
      case "amex_statement": {
        const { error } = await sb
          .from("amex_transactions")
          .delete()
          .eq("client_id", client_id)
          .eq("period", period);
        if (error) throw error;
        break;
      }
      case "payroll": {
        const { error } = await sb
          .from("payroll")
          .delete()
          .eq("client_id", client_id)
          .eq("period", period);
        if (error) throw error;
        break;
      }
      case "invoices": {
        const { error } = await sb
          .from("invoices")
          .delete()
          .eq("import_batch_id", batchId);
        if (error) throw error;
        break;
      }
    }

    // 2. Re-insert edited rows
    switch (file_type) {
      case "sales_by_category": {
        const insertRows = rows.map((row: any, idx: number) => ({
          client_id,
          import_batch_id: batchId,
          period,
          rank: row.rank ?? idx + 1,
          category_name: row.category_name,
          sold_quantity: row.sold_quantity ?? 0,
          net_sales: row.net_sales ?? 0,
          vat_amount: row.vat_amount ?? 0,
          sales_with_vat: row.sales_with_vat ?? 0,
          net_discount: row.net_discount ?? 0,
          discount_pct: row.discount_pct ?? 0,
        }));
        for (let i = 0; i < insertRows.length; i += 50) {
          const { error } = await sb.from("sales_by_category").insert(insertRows.slice(i, i + 50));
          if (error) throw error;
        }
        break;
      }
      case "bank_movements": {
        const insertRows = rows.map((row: any) => ({
          client_id,
          period,
          transaction_date: row.transaction_date,
          value_date: row.value_date || row.transaction_date,
          amount: row.amount ?? 0,
          description: (row.description || "").substring(0, 500),
          category: row.category || "",
          subcategory: row.subcategory || "",
          counterpart: row.counterpart || "",
          running_balance: row.running_balance ?? 0,
          raw_description: row.raw_description || row.description || "",
          cost_category: row.cost_category || "",
        }));
        for (let i = 0; i < insertRows.length; i += 50) {
          const { error } = await sb.from("bank_transactions").insert(insertRows.slice(i, i + 50));
          if (error) throw error;
        }
        break;
      }
      case "amex_statement": {
        const insertRows = rows.map((row: any) => {
          const opDate = row.operation_date || "";
          const rowPeriod = opDate.length >= 7 ? opDate.substring(0, 7) : period;
          return {
            client_id,
            period: rowPeriod,
            operation_date: row.operation_date,
            booking_date: row.booking_date || row.operation_date,
            description: (row.description || "").substring(0, 500),
            amount_eur: row.amount_eur ?? 0,
            category: row.category || "",
            cost_category: row.cost_category || "",
          };
        });
        for (let i = 0; i < insertRows.length; i += 50) {
          const { error } = await sb.from("amex_transactions").insert(insertRows.slice(i, i + 50));
          if (error) throw error;
        }
        break;
      }
      case "payroll": {
        const insertRows = rows.map((row: any) => {
          let hireDate: string | null = null;
          if (row.hire_date && typeof row.hire_date === "string" && row.hire_date.includes("/")) {
            const parts = row.hire_date.trim().split("/");
            if (parts.length === 3) {
              const yy = parseInt(parts[2]);
              const year = yy < 50 ? 2000 + yy : 1900 + yy;
              hireDate = `${year}-${parts[1]}-${parts[0]}`;
            }
          } else {
            hireDate = row.hire_date || null;
          }

          return {
            client_id,
            period,
            employee_code: row.employee_code ?? 0,
            employee_name: row.employee_name || "",
            role: row.role || "",
            part_time_pct: row.part_time_pct ?? null,
            hire_date: hireDate,
            hours_worked: row.hours_worked ?? 0,
            days_worked: row.days_worked ?? 0,
            gross_pay: row.gross_pay ?? 0,
            social_contributions: row.social_contributions ?? 0,
            irpef: row.irpef ?? 0,
            net_pay: row.net_pay ?? 0,
            tfr_month: row.tfr_month ?? 0,
            total_deductions: row.total_deductions ?? 0,
          };
        });
        for (let i = 0; i < insertRows.length; i += 50) {
          const { error } = await sb.from("payroll").insert(insertRows.slice(i, i + 50));
          if (error) throw error;
        }
        break;
      }
      case "invoices": {
        const insertRows = rows.map((row: any) => ({
          client_id,
          import_batch_id: batchId,
          period,
          supplier_name: row.supplier_name || "",
          category_name: row.category_name || "",
          amount: row.amount ?? 0,
          notes: row.notes || "",
        }));
        for (let i = 0; i < insertRows.length; i += 50) {
          const { error } = await sb.from("invoices").insert(insertRows.slice(i, i + 50));
          if (error) throw error;
        }
        break;
      }
    }

    // 3. Update batch rows_imported count
    await sb
      .from("import_batches")
      .update({ rows_imported: rows.length })
      .eq("id", batchId);

    return NextResponse.json({
      success: true,
      batch_id: batchId,
      rows_updated: rows.length,
      message: `${rows.length} righe aggiornate con successo`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Update batch rows error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
