ALTER TABLE generated_images
  MODIFY COLUMN status ENUM('queued','running','succeeded','failed','archived','deleted') NOT NULL DEFAULT 'succeeded';
