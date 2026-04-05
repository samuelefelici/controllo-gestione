import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";

/**
 * POST /api/import/confirm
 *
 * Saves the user-reviewed (possibly edited) data to the database.
 * Creates an import_batch for audit trail / undo capability.
 *
 * JSON Body:
 *   - client_id: UUID
 *   - file_type: "sales_by_category" | ...
 *   - filename: original filename
 *   - period: "2026-01"
 *   - rows: array of row objects (matching the table schema)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { client_id, file_type, filename, period, rows } = body;

    if (!client_id || !file_type || !filename || !period || !rows?.length) {
      return NextResponse.json(
        { error: "Campi obbligatori: client_id, file_type, filename, period, rows" },
        { status: 400 }
      );
    }

    const sb = getServiceSupabase();

    // 1. Create import batch
    const { data: batch, error: batchError } = await sb
      .from("import_batches")
      .insert({
        client_id,
        file_type,
        filename,
        period,
        rows_imported: rows.length,
      })
      .select()
      .single();

    if (batchError || !batch) {
      console.error("Batch creation error:", batchError);
      return NextResponse.json(
        { error: "Impossibile creare il batch di importazione", details: batchError?.message },
        { status: 500 }
      );
    }

    // 2. Insert rows based on file type
    switch (file_type) {
      case "sales_by_category": {
        const insertRows = rows.map((row: any, idx: number) => ({
          client_id,
          import_batch_id: batch.id,
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

        // Insert in batches of 50
        for (let i = 0; i < insertRows.length; i += 50) {
          const chunk = insertRows.slice(i, i + 50);
          const { error: insertError } = await sb
            .from("sales_by_category")
            .insert(chunk);

          if (insertError) {
            // Rollback: delete the batch (CASCADE will remove any rows already inserted)
            await sb.from("import_batches").delete().eq("id", batch.id);
            console.error("Insert error:", insertError);
            return NextResponse.json(
              { error: "Errore durante il salvataggio", details: insertError.message },
              { status: 500 }
            );
          }
        }
        break;
      }

      default:
        await sb.from("import_batches").delete().eq("id", batch.id);
        return NextResponse.json(
          { error: `Tipo "${file_type}" non supportato` },
          { status: 400 }
        );
    }

    // 3. Ensure monthly_summary exists
    await sb.from("monthly_summary").upsert(
      {
        client_id,
        period,
        year: parseInt(period.split("-")[0]),
        month: parseInt(period.split("-")[1]),
      },
      { onConflict: "client_id,period" }
    );

    return NextResponse.json({
      success: true,
      batch_id: batch.id,
      rows_imported: rows.length,
      period,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Import confirm error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
