const db = require("./db");

const purgeExpiredTokens = db.prepare("DELETE FROM admin_tokens WHERE expires_at <= datetime('now')");
const purgeOldCancelledOrders = db.prepare("DELETE FROM orders WHERE status = 'cancelled' AND created_at < date('now', '-30 days')");

const countTokens = purgeExpiredTokens.run();
const countOrders = purgeOldCancelledOrders.run();

console.log("Purge completed:");
console.log("  - Token admin kedaluwarsa dihapus:", countTokens.changes, "baris");
console.log("  - Pesanan cancelled tua (30+ hari) dihapus:", countOrders.changes, "baris");
console.log("  - Sisa token admin:", db.prepare("SELECT COUNT(*) AS n FROM admin_tokens").get().n);
console.log("  - Sisa pesanan cancelled:", db.prepare("SELECT COUNT(*) AS n FROM orders WHERE status = 'cancelled'").get().n);