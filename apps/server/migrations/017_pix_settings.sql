-- Where the agency receives subscription payments, read from the QR code of its bank app.
-- One row only. The payment page builds a Pix code with the exact amount from these fields.
create table agency_settings (
  id boolean primary key default true check (id),
  pix_key text check (length(pix_key) <= 77),
  pix_receiver_name text check (length(pix_receiver_name) <= 25),
  pix_city text check (length(pix_city) <= 15),
  updated_at timestamptz not null default now()
);
insert into agency_settings (id) values (true);
alter table agency_settings enable row level security;
