-- Automatic card debit (Mercado Pago subscriptions), acceptance of the Terms, and access records.

-- Each card charge of a subscription is a payment too.
alter table payments drop constraint payments_method_check;
alter table payments add constraint payments_method_check check (method in ('pix', 'manual', 'card'));

-- A business's automatic debit at Mercado Pago (a "preapproval"). The card itself never reaches
-- us: it is typed into Mercado Pago's secure fields and we only keep their subscription id.
create table card_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  provider_id text not null unique,
  status text not null check (status in ('pending', 'authorized', 'paused', 'cancelled')),
  -- 1 = charged every month, 12 = once a year.
  frequency_months integer not null check (frequency_months in (1, 12)),
  amount_cents integer not null check (amount_cents > 0),
  payer_email text not null check (length(payer_email) <= 254),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz
);
-- At most one live automatic debit per business.
create unique index card_subscriptions_live_idx on card_subscriptions (tenant_id) where status in ('pending', 'authorized', 'paused');
alter table card_subscriptions enable row level security;

-- Who accepted which version of the Terms and Privacy Policy, and when (proof for both sides).
alter table tenants
  add column billing_email text check (length(billing_email) <= 254),
  add column terms_version text,
  add column terms_accepted_at timestamptz;

-- Marco Civil da Internet (Lei 12.965/2014, art. 15): application access records (date, time and IP)
-- must be kept for 6 months. Logins only; removed after 12 months.
create table access_logs (
  id bigint generated always as identity primary key,
  role text not null check (role in ('admin', 'owner')),
  tenant_user_id uuid references tenant_users (id) on delete set null,
  ip text not null,
  created_at timestamptz not null default now()
);
create index access_logs_created_idx on access_logs (created_at);
alter table access_logs enable row level security;
