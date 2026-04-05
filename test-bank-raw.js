const fs = require("fs");
const pdfParse = require("pdf-parse");

async function main() {
  const buf = fs.readFileSync("documenti/GEN 26 ListaMovimenti .pdf");
  const pdf = await pdfParse(buf);
  // Write raw text to file so we can inspect it
  fs.writeFileSync("bank-raw-text.txt", pdf.text);
  console.log("Pages:", pdf.numpages);
  console.log("Text length:", pdf.text.length);
  // Show first 3000 chars
  console.log("=== FIRST 3000 CHARS ===");
  console.log(pdf.text.substring(0, 3000));
  console.log("=== LAST 1000 CHARS ===");
  console.log(pdf.text.substring(pdf.text.length - 1000));
}
main().catch(console.error);
