require("dotenv").config();
const db = require("../db");

async function main() {
  console.log("Connecting to database...");
  await db.run("UPDATE orders SET lat = -6.229746, lng = 106.829518, status = 'paid', address = 'Jl. Jend. Sudirman Kav. 52, SCBD, Jakarta Selatan' WHERE id = 1");
  await db.run("UPDATE orders SET lat = -6.175392, lng = 106.827153, status = 'shipped', courier_lat = -6.185000, courier_lng = 106.830000, address = 'Jl. Medan Merdeka Barat No. 12, Gambir, Jakarta Pusat' WHERE id = 2");
  await db.run("UPDATE orders SET lat = -6.301985, lng = 106.774431, status = 'awaiting_payment', address = 'Jl. TB Simatupang No. 30, Cilandak, Jakarta Selatan' WHERE id = 3");
  
  const orders = await db.all("SELECT id, customer_name, status, lat, lng, address FROM orders ORDER BY id ASC");
  console.log("Orders successfully updated with coordinates:");
  console.log(JSON.stringify(orders, null, 2));
  process.exit(0);
}

main().catch(err => {
  console.error("Error updating orders:", err);
  process.exit(1);
});
