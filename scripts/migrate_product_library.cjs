// Migration: create product_library table
const mysql = require("mysql2/promise");

async function main() {
  const pool = mysql.createPool({
    uri: process.env.DATABASE_URL,
    connectionLimit: 4,
  });

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS product_library (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL DEFAULT '',
      tags JSON DEFAULT NULL,
      oss_key VARCHAR(512) NOT NULL DEFAULT '',
      thumbnail_url VARCHAR(1024) NOT NULL DEFAULT '',
      status ENUM('active','inactive','archived') NOT NULL DEFAULT 'active',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  const [rows] = await pool.query("SHOW TABLES LIKE 'product_library'");
  console.log("Migration OK:", JSON.stringify(rows));
  await pool.end();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
