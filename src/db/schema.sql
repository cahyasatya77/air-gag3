CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  roles TEXT[] NOT NULL CHECK (cardinality(roles) > 0 AND roles <@ ARRAY['administrator','pengurus','pemilik']),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- status: normal = bayar sesuai meteran; tidak_pakai = tidak memakai air, bayar flat; nonaktif = tidak ditagih
CREATE TABLE IF NOT EXISTS houses (
  id SERIAL PRIMARY KEY,
  no_rumah TEXT NOT NULL UNIQUE,
  sort_no INT NOT NULL,
  owner_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'normal' CHECK (status IN ('normal','tidak_pakai','nonaktif')),
  user_id INT REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT NOT NULL DEFAULT ''
);

-- Aturan tarif berversi; berlaku mulai periode effective_from (YYYY-MM)
CREATE TABLE IF NOT EXISTS tariffs (
  id SERIAL PRIMARY KEY,
  effective_from TEXT NOT NULL UNIQUE CHECK (effective_from ~ '^\d{4}-\d{2}$'),
  abodemen_m3 INT NOT NULL,
  abodemen_nominal INT NOT NULL,
  tambahan_per_m3 INT NOT NULL,
  flat_nominal INT NOT NULL,
  kas_jimpitan INT NOT NULL,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- period = bulan pemakaian (YYYY-MM). Meter akhir dicatat tgl 5 bulan berikutnya.
CREATE TABLE IF NOT EXISTS bills (
  id SERIAL PRIMARY KEY,
  house_id INT NOT NULL REFERENCES houses(id),
  period TEXT NOT NULL CHECK (period ~ '^\d{4}-\d{2}$'),
  meter_awal NUMERIC,
  meter_akhir NUMERIC,
  usage_m3 NUMERIC,               -- pemakaian terhitung (sebelum justifikasi)
  billed_m3 NUMERIC,              -- pemakaian yang ditagihkan (setelah justifikasi)
  amount INT NOT NULL DEFAULT 0,  -- nominal tagihan
  flat BOOLEAN NOT NULL DEFAULT FALSE,
  tariff_id INT REFERENCES tariffs(id),
  meter_awal_next NUMERIC,        -- jika meteran diganti: awal periode berikutnya
  recorded_by INT REFERENCES users(id),
  recorded_at TIMESTAMPTZ,
  UNIQUE (house_id, period)
);

CREATE TABLE IF NOT EXISTS adjustments (
  id SERIAL PRIMARY KEY,
  bill_id INT NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('meter_rusak','ganti_meteran','pemutusan','lainnya')),
  override_m3 NUMERIC,
  override_amount INT,
  meter_awal_next NUMERIC,
  reason TEXT NOT NULL,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  bill_id INT NOT NULL REFERENCES bills(id),
  amount INT NOT NULL CHECK (amount > 0),
  paid_at DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT NOT NULL DEFAULT '',
  received_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Buku kas: fund 'jimpitan' | 'air'; in dari pembayaran (otomatis), out = pengeluaran
CREATE TABLE IF NOT EXISTS cash_entries (
  id SERIAL PRIMARY KEY,
  fund TEXT NOT NULL CHECK (fund IN ('jimpitan','air')),
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  amount INT NOT NULL CHECK (amount > 0),
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  category TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  payment_id INT REFERENCES payments(id) ON DELETE CASCADE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id INT,
  username TEXT,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  before JSONB,
  after JSONB,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bills_period ON bills (period);
CREATE INDEX IF NOT EXISTS idx_cash_date ON cash_entries (entry_date);

ALTER TABLE houses ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '';

-- Migrasi: satu pengguna boleh punya banyak peran (kolom role tunggal -> roles[])
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='role') THEN
    ALTER TABLE users ADD COLUMN IF NOT EXISTS roles TEXT[];
    UPDATE users SET roles = ARRAY[role] WHERE roles IS NULL;
    ALTER TABLE users ALTER COLUMN roles SET NOT NULL;
    ALTER TABLE users DROP COLUMN role;
    ALTER TABLE users ADD CONSTRAINT users_roles_check
      CHECK (cardinality(roles) > 0 AND roles <@ ARRAY['administrator','pengurus','pemilik']);
  END IF;
END $$;
