-- Product library table (separate from template_library and references)
CREATE TABLE IF NOT EXISTS product_library (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL DEFAULT '',
  tags JSON DEFAULT NULL,
  oss_key VARCHAR(512) NOT NULL DEFAULT '',
  thumbnail_url VARCHAR(1024) NOT NULL DEFAULT '',
  status ENUM('active','inactive','archived') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
