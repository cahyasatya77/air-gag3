-- Skema MySQL / MariaDB (InnoDB, utf8mb4). Aman dijalankan berulang (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(150) NOT NULL,
  roles VARCHAR(255) NOT NULL,   -- JSON array, mis. ["pengurus","pemilik"]
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- status: normal = bayar sesuai meteran; tidak_pakai = tidak memakai air, bayar flat; nonaktif = tidak ditagih
CREATE TABLE IF NOT EXISTS houses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  no_rumah VARCHAR(20) NOT NULL UNIQUE,
  sort_no INT NOT NULL,
  owner_name VARCHAR(150) NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'normal' CHECK (status IN ('normal','tidak_pakai','nonaktif')),
  user_id INT NULL,
  notes VARCHAR(500) NOT NULL DEFAULT '',
  phone VARCHAR(20) NOT NULL DEFAULT '',
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Aturan tarif berversi; berlaku mulai periode effective_from (YYYY-MM)
CREATE TABLE IF NOT EXISTS tariffs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  effective_from CHAR(7) NOT NULL UNIQUE CHECK (effective_from REGEXP '^[0-9]{4}-[0-9]{2}$'),
  abodemen_m3 INT NOT NULL,
  abodemen_nominal INT NOT NULL,
  tambahan_per_m3 INT NOT NULL,
  flat_nominal INT NOT NULL,
  kas_jimpitan INT NOT NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- period = bulan pemakaian (YYYY-MM). Meter akhir dicatat tgl 5 bulan berikutnya.
CREATE TABLE IF NOT EXISTS bills (
  id INT AUTO_INCREMENT PRIMARY KEY,
  house_id INT NOT NULL,
  period CHAR(7) NOT NULL CHECK (period REGEXP '^[0-9]{4}-[0-9]{2}$'),
  meter_awal DECIMAL(12,3) NULL,
  meter_akhir DECIMAL(12,3) NULL,
  usage_m3 DECIMAL(12,3) NULL,    -- pemakaian terhitung (sebelum justifikasi)
  billed_m3 DECIMAL(12,3) NULL,   -- pemakaian yang ditagihkan (setelah justifikasi)
  amount INT NOT NULL DEFAULT 0,  -- nominal tagihan
  flat BOOLEAN NOT NULL DEFAULT FALSE,
  tariff_id INT NULL,
  meter_awal_next DECIMAL(12,3) NULL, -- jika meteran diganti: awal periode berikutnya
  recorded_by INT NULL,
  recorded_at DATETIME NULL,
  UNIQUE KEY uq_bill (house_id, period),
  KEY idx_bills_period (period),
  FOREIGN KEY (house_id) REFERENCES houses(id),
  FOREIGN KEY (tariff_id) REFERENCES tariffs(id),
  FOREIGN KEY (recorded_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS adjustments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  bill_id INT NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('meter_rusak','ganti_meteran','pemutusan','lainnya')),
  override_m3 DECIMAL(12,3) NULL,
  override_amount INT NULL,
  meter_awal_next DECIMAL(12,3) NULL,
  reason VARCHAR(500) NOT NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Rekening bendahara; tiap perubahan = baris baru (riwayat tidak ditimpa), yang berlaku = id terbesar
CREATE TABLE IF NOT EXISTS bank_accounts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  bank VARCHAR(60) NOT NULL,
  account_no VARCHAR(40) NOT NULL,
  holder VARCHAR(100) NOT NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  bill_id INT NOT NULL,
  amount INT NOT NULL CHECK (amount > 0),
  paid_at DATE NOT NULL DEFAULT (CURRENT_DATE),
  note VARCHAR(255) NOT NULL DEFAULT '',
  method VARCHAR(10) NOT NULL DEFAULT 'tunai' CHECK (method IN ('tunai','transfer')),
  received_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (bill_id) REFERENCES bills(id),
  FOREIGN KEY (received_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Buku kas: fund 'jimpitan' | 'air'; in dari pembayaran (otomatis), out = pengeluaran
CREATE TABLE IF NOT EXISTS cash_entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fund VARCHAR(10) NOT NULL CHECK (fund IN ('jimpitan','air')),
  direction VARCHAR(3) NOT NULL CHECK (direction IN ('in','out')),
  amount INT NOT NULL CHECK (amount > 0),
  entry_date DATE NOT NULL DEFAULT (CURRENT_DATE),
  category VARCHAR(100) NOT NULL DEFAULT '',
  description VARCHAR(500) NOT NULL DEFAULT '',
  payment_id INT NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_cash_date (entry_date),
  FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- old_data / new_data = JSON (teks); dibaca aplikasi sebagai kolom "before" / "after"
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  username VARCHAR(100) NULL,
  action VARCHAR(60) NOT NULL,
  entity VARCHAR(60) NOT NULL,
  entity_id VARCHAR(60) NULL,
  old_data LONGTEXT NULL,
  new_data LONGTEXT NULL,
  ip VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Periode tagihan dibuat manual oleh pengurus
CREATE TABLE IF NOT EXISTS periods (
  period CHAR(7) PRIMARY KEY,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Notulen pertemuan bulanan: satu notulen berisi beberapa poin (judul + isi teks kaya/HTML hasil sanitasi)
CREATE TABLE IF NOT EXISTS meeting_notes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  meeting_date DATE NOT NULL,
  location VARCHAR(200) NOT NULL DEFAULT '',
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by INT NULL,
  updated_at DATETIME NULL,
  KEY idx_notes_date (meeting_date),
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS meeting_note_points (
  id INT AUTO_INCREMENT PRIMARY KEY,
  note_id INT NOT NULL,
  sort_no INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  content MEDIUMTEXT NULL,
  KEY idx_points_note (note_id, sort_no),
  FOREIGN KEY (note_id) REFERENCES meeting_notes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
