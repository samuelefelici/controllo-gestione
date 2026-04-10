/**
 * Shared column definitions for all file types.
 * Used both in parse-preview and history edit.
 */

export interface ColumnDef {
  key: string;
  label: string;
  type: "text" | "number" | "currency" | "percent" | "select";
  editable: boolean;
}

export const COLUMN_DEFS: Record<string, ColumnDef[]> = {
  sales_by_category: [
    { key: "rank", label: "#", type: "number", editable: false },
    { key: "category_name", label: "Categoria", type: "text", editable: true },
    { key: "sold_quantity", label: "Qta", type: "number", editable: true },
    { key: "net_sales", label: "Netto €", type: "currency", editable: true },
    { key: "vat_amount", label: "IVA €", type: "currency", editable: true },
    { key: "sales_with_vat", label: "Lordo €", type: "currency", editable: true },
    { key: "net_discount", label: "Sconto €", type: "currency", editable: true },
    { key: "discount_pct", label: "Sconto %", type: "percent", editable: true },
  ],
  bank_movements: [
    { key: "transaction_date", label: "Data", type: "text", editable: true },
    { key: "description", label: "Descrizione", type: "text", editable: false },
    { key: "counterpart", label: "Controparte", type: "text", editable: false },
    { key: "amount", label: "Importo €", type: "currency", editable: true },
    { key: "cost_category", label: "Macrocategoria", type: "select", editable: true },
    { key: "running_balance", label: "Saldo €", type: "currency", editable: false },
  ],
  amex_statement: [
    { key: "operation_date", label: "Data Op.", type: "text", editable: true },
    { key: "booking_date", label: "Data Reg.", type: "text", editable: true },
    { key: "description", label: "Descrizione", type: "text", editable: true },
    { key: "amount_eur", label: "Importo €", type: "currency", editable: true },
    { key: "category", label: "Categoria", type: "text", editable: true },
  ],
  payroll: [
    { key: "employee_code", label: "Cod.", type: "number", editable: true },
    { key: "employee_name", label: "Nome", type: "text", editable: true },
    { key: "role", label: "Ruolo", type: "text", editable: true },
    { key: "part_time_pct", label: "PT %", type: "percent", editable: true },
    { key: "hire_date", label: "Assunzione", type: "text", editable: true },
    { key: "hours_worked", label: "Ore", type: "number", editable: true },
    { key: "days_worked", label: "Giorni", type: "number", editable: true },
    { key: "gross_pay", label: "Lordo €", type: "currency", editable: true },
    { key: "social_contributions", label: "Contributi €", type: "currency", editable: true },
    { key: "irpef", label: "IRPEF €", type: "currency", editable: true },
    { key: "net_pay", label: "Netto €", type: "currency", editable: true },
    { key: "tfr_month", label: "TFR €", type: "currency", editable: true },
    { key: "total_deductions", label: "Trattenute €", type: "currency", editable: true },
  ],
  invoices: [
    { key: "supplier_name", label: "Fornitore", type: "text", editable: true },
    { key: "category_name", label: "Categoria", type: "text", editable: true },
    { key: "amount", label: "Totale €", type: "currency", editable: true },
    { key: "notes", label: "Note", type: "text", editable: true },
  ],
};
