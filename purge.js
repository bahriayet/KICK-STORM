const db = require("./db");

(async () => {
  try {
    const countTokens = await db.run("DELETE FROM admin_tokens WHERE expires_at <= datetime('now')");
    const countOrders = await db.run("DELETE FROM orders WHERE status = 'cancelled' AND created_at < date('now', '-30 days')");

    const tokensRes = await db.get("SELECT COUNT(*) AS n FROM admin_tokens");
    const ordersRes = await db.get("SELECT COUNT(*) AS n FROM orders WHERE status = 'cancelled'");

    console.log("Purge completed:");
    console.log("  - Token admin kedaluwarsa dihapus:", countTokens.changes, "baris");
    console.log("  - Pesanan cancelled tua (30+ hari) dihapus:", countOrders.changes, "baris");
    console.log("  - Sisa token admin:", tokensRes?.n || 0);
    console.log("  - Sisa pesanan cancelled:", ordersRes?.n || 0);
  } catch (err) {
    console.error("Purge error:", err.message);
  } finally {
    await db.close();
  }
})();