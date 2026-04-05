import { readFileSync } from "fs";
import { parseBankMovementsPDF } from "./src/lib/parsers/parse-bank";

async function main() {
  const buf = readFileSync("documenti/GEN 26 ListaMovimenti .pdf");
  const result = await parseBankMovementsPDF(buf);

  console.log("Period:", result.period);
  console.log("Total transactions:", result.transactions.length);
  console.log("---");

  // Print first 5 and last 5
  const txs = result.transactions;
  const show = [...txs.slice(0, 5), ...txs.slice(-5)];
  for (const tx of show) {
    console.log(
      `${tx.transaction_date} | ${tx.amount >= 0 ? "+" : ""}${tx.amount.toFixed(2)} | saldo=${tx.running_balance.toFixed(2)} | ${tx.category}/${tx.subcategory} | ${tx.description.substring(0, 80)}`
    );
  }

  // Aggregates
  const totalIn = txs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const totalOut = txs.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0);
  console.log("---");
  console.log(`Total IN:  +${totalIn.toFixed(2)}`);
  console.log(`Total OUT: ${totalOut.toFixed(2)}`);
  console.log(`Net:       ${(totalIn + totalOut).toFixed(2)}`);

  // Check for any with amount=0 (possible parsing errors)
  const zeros = txs.filter(t => t.amount === 0);
  if (zeros.length > 0) {
    console.log(`\n⚠️  ${zeros.length} transazioni con importo 0:`);
    zeros.forEach(t => console.log(`  ${t.transaction_date} | ${t.description.substring(0, 60)}`));
  }
}

main().catch(console.error);
