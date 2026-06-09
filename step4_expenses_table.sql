CREATE TABLE IF NOT EXISTS expenses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  line_item_id  uuid        NOT NULL REFERENCES line_items(id)  ON DELETE CASCADE,
  submitted_by  uuid        NOT NULL REFERENCES users(id)       ON DELETE CASCADE,
  month         date        NOT NULL,
  amount        numeric(15,2) NOT NULL DEFAULT 0,
  description   text,
  status        text        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','approved','rejected')),
  source        text        NOT NULL DEFAULT 'manual',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS expenses_line_item_month_idx
  ON expenses (line_item_id, month);

CREATE INDEX IF NOT EXISTS expenses_submitted_by_idx
  ON expenses (submitted_by);
