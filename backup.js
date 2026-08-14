require("dotenv").config();
const path = require("path");
const fs = require("fs");
const db = require("./db");

const dataDir = path.join(__dirname, "data");
const backupDir = path.join(dataDir, "backups");
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
const dest = path.join(backupDir, `kickstorm-${stamp}.db`);

db.backup(dest)
  .then(() => {
    console.log(`Backup tersimpan: ${dest}`);

    const KEEP = 14;
    const backups = fs.readdirSync(backupDir)
      .filter((f) => /^kickstorm-.*\.db$/.test(f))
      .sort();
    const remove = backups.length - KEEP;
    if (remove > 0) {
      for (const f of backups.slice(0, remove)) {
        fs.unlinkSync(path.join(backupDir, f));
      }
      console.log(`Backup lama dibersihkan: ${remove} file`);
    }
  })
  .catch((err) => {
    console.error("Backup gagal:", err.message);
    process.exitCode = 1;
  })
  .finally(() => db.close());