# Smart World SRLS — Business Intelligence

Dashboard gestionale per l'analisi dell'andamento aziendale di Smart World SRLS (Money Transfer, vendita elettronica, biglietteria, luggage storage, riparazioni).

## Stack

- **Next.js 15** (App Router) — Frontend + API
- **Supabase** — PostgreSQL + Storage
- **Vercel** — Hosting
- **Recharts** — Grafici
- **pdf-parse / xlsx** — Parsing documenti

## Setup Rapido

### 1. Supabase

1. Vai su [supabase.com](https://supabase.com) → New Project
2. Apri **SQL Editor** → incolla tutto il contenuto di `supabase/schema.sql` → Run
3. Vai su **Storage** → Create bucket: `documents` (public: OFF)
4. Copia da **Settings > API**: Project URL, anon key, service_role key

### 2. Progetto Locale

```bash
git clone https://github.com/TUO-USER/smartworld-bi.git
cd smartworld-bi
cp .env.local.example .env.local
# Compila .env.local con le chiavi Supabase
npm install
npm run dev
```

### 3. Deploy su Vercel

```bash
npm i -g vercel
vercel
# Aggiungi le env vars nel dashboard Vercel
```

## Flusso Operativo Mensile

1. Apri la homepage → seleziona il periodo (es. `2026-02`)
2. Carica i 4 documenti:
   - **Vendite per Categoria** → PDF export da Erply (Sales by Category)
   - **Movimenti Bancari** → XLS export da Banca Popolare Pugliese
   - **Estratto Conto Amex** → PDF da American Express
   - **Cedolini Paga** → PDF da TeamSystem
3. Il sistema parsa automaticamente ogni file e popola il database
4. Vai su `/dashboard` per vedere KPI, grafici, profitto netto

## API Endpoints

| Metodo | Endpoint | Descrizione |
|--------|----------|-------------|
| POST | `/api/upload` | Upload + parse automatico di un documento |
| GET | `/api/data?period=2026-01` | Tutti i dati dashboard per un periodo |
| POST | `/api/parse/recalculate?period=2026-01` | Ricalcola profitto netto |

## Tipi di File Supportati

| Tipo | Formato | Sorgente |
|------|---------|----------|
| `sales_by_category` | PDF | Erply YESTORE |
| `bank_movements` | XLS | BPP Lista Movimenti |
| `amex_statement` | PDF | American Express |
| `payroll` | PDF | TeamSystem Cedolini |

## Struttura Database

- `monthly_summary` — Riepilogo mensile (ricavi, spese, profitto)
- `revenue_lines` — Dettaglio ricavi per fonte (WU, RIA, MG, prodotti...)
- `expense_lines` — Dettaglio spese per categoria
- `sales_by_category` — Vendite per categoria da Erply
- `bank_transactions` — Movimenti bancari categorizzati
- `amex_transactions` — Spese carta Amex
- `payroll` — Cedolini dipendenti
- `file_uploads` — Tracking file caricati
