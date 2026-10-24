-- Pix charges created at Mercado Pago: paid ones are confirmed automatically (webhook + check).
alter table payments
  add column provider_payment_id text,
  add column provider_qr_code text,
  add column expires_at timestamptz;
create unique index payments_provider_idx on payments (provider_payment_id) where provider_payment_id is not null;
