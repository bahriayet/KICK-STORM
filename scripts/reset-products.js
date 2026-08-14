require("dotenv").config();
const db = require("../db");

const seed = [
  ["Volt Runner — Beta 01", "Lari / Jalan / Sehari-hari", "Best Seller", 1850000, "mono", 42, 5124],
  ["Night Runner — Mono 02", "All Black / Techwear", "New", 1450000, "void", 38, 2143],
  ["Reign Low — Storm 03", "Low Cut / Premium", "Limited", 2100000, "volt", 24, 987],
  ["Ghost Zero — White 04", "Monochrome / Clean", "Restock", 1250000, "ghost", 55, 3301],
  ["Hujan Runner — Rain 05", "Anti-air / Trail", "New", 1600000, "dark", 31, 876],
  ["Dawn Low — Cream 06", "Casual / Soft Tone", "Limited", 1350000, "cream", 20, 654]
];

console.log("Resetting local products...");
db.exec("DELETE FROM products; DELETE FROM sqlite_sequence WHERE name = 'products';");
const insert = db.prepare(
  "INSERT INTO products (name, tag, badge, price, variant, stock, sold) VALUES (?, ?, ?, ?, ?, ?, ?)"
);
seed.forEach((row) => insert.run(...row));
console.log("✓ Local products reset to original 6 items!");

async function syncTurso() {
  if (!process.env.TURSO_DATABASE_URL) return;
  try {
    const { createClient } = require("@libsql/client");
    const turso = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN
    });
    console.log("Resetting Turso cloud products...");
    await turso.execute("DELETE FROM products;");
    for (const row of seed) {
      await turso.execute({
        sql: "INSERT INTO products (name, tag, badge, price, variant, stock, sold) VALUES (?, ?, ?, ?, ?, ?, ?)",
        args: row
      });
    }
    console.log("✓ Turso cloud products reset to original 6 items!");
  } catch (err) {
    console.error("Turso reset error:", err.message);
  }
}

syncTurso();
