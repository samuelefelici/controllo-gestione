import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";

/**
 * DELETE /api/import/[batchId]
 *
 * Undo an import by deleting all rows associated with the given batch ID.
 * Thanks to ON DELETE CASCADE on import_batch_id FK, deleting the batch
 * automatically removes all related sales_by_category rows.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  try {
    const { batchId } = await params;

    if (!batchId) {
      return NextResponse.json({ error: "Missing batchId" }, { status: 400 });
    }

    const sb = getServiceSupabase();

    // Verify batch exists and hasn't been undone already
    const { data: batch, error: fetchError } = await sb
      .from("import_batches")
      .select("*")
      .eq("id", batchId)
      .single();

    if (fetchError || !batch) {
      return NextResponse.json({ error: "Batch non trovato" }, { status: 404 });
    }

    if (batch.undone_at) {
      return NextResponse.json({ error: "Questo import è già stato annullato" }, { status: 400 });
    }

    // Delete all rows linked to this batch based on file type
    const fileType = batch.file_type;
    let deleteError = null;

    if (fileType === "sales_by_category") {
      const { error } = await sb.from("sales_by_category").delete().eq("import_batch_id", batchId);
      deleteError = error;
    } else if (fileType === "bank_movements") {
      const { error } = await sb.from("bank_transactions").delete().eq("client_id", batch.client_id).eq("period", batch.period);
      deleteError = error;
    } else if (fileType === "amex_statement") {
      const { error } = await sb.from("amex_transactions").delete().eq("client_id", batch.client_id).eq("period", batch.period);
      deleteError = error;
    } else if (fileType === "payroll") {
      const { error } = await sb.from("payroll").delete().eq("client_id", batch.client_id).eq("period", batch.period);
      deleteError = error;
    } else if (fileType === "invoices") {
      const { error } = await sb.from("invoices").delete().eq("import_batch_id", batchId);
      deleteError = error;
    }

    if (deleteError) {
      console.error("Delete error:", deleteError);
      return NextResponse.json(
        { error: "Errore durante l'annullamento", details: deleteError.message },
        { status: 500 }
      );
    }

    // Mark batch as undone (soft-delete for audit trail)
    await sb
      .from("import_batches")
      .update({ undone_at: new Date().toISOString() })
      .eq("id", batchId);

    return NextResponse.json({
      success: true,
      batch_id: batchId,
      message: `Import annullato: ${batch.rows_imported} righe rimosse`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Import undo error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
