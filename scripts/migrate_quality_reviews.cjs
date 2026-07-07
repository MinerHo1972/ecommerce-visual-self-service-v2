// Migration: create image_quality_reviews table if it is missing.
const mysql = require("mysql2/promise");
const fs = require("fs");
const path = require("path");

function loadLocalEnv() {
  for (const fileName of [".env.local", ".env"]) {
    const filePath = path.join(process.cwd(), fileName);
    if (!fs.existsSync(filePath)) continue;

    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index <= 0) continue;

      const key = trimmed.slice(0, index).trim();
      const rawValue = trimmed.slice(index + 1).trim();
      if (process.env[key] !== undefined) continue;
      process.env[key] = rawValue.replace(/^[']|[']$/g, "").replace(/^[\"]|[\"]$/g, "");
    }
  }
}

async function tableExists(pool) {
  const [rows] = await pool.query("SHOW TABLES LIKE 'image_quality_reviews'");
  return Array.isArray(rows) && rows.length > 0;
}

async function main() {
  loadLocalEnv();

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for image_quality_reviews migration");
  }

  const pool = mysql.createPool({ uri: process.env.DATABASE_URL, connectionLimit: 2 });

  try {
    if (await tableExists(pool)) {
      console.log(JSON.stringify({ ok: true, migrated: false, tableExists: true, message: "image_quality_reviews table already exists" }, null, 2));
      return;
    }

    const sqlPath = path.join(process.cwd(), "db", "005_image_quality_reviews.sql");
    const sql = fs.readFileSync(sqlPath, "utf8");
    await pool.execute(sql);

    console.log(JSON.stringify({ ok: true, migrated: true, tableExists: await tableExists(pool) }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exit(1);
});
