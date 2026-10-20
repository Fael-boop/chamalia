-- Niches move from hardcoded code into the database, so the agency can add,
-- edit and remove them from the panel. Each niche carries its starter
-- services and starter business hours, used only when a new client is created.
create table niches (
  id uuid primary key default gen_random_uuid(),
  -- Also the value stored in tenants.business_type (see FK below).
  slug text not null unique check (slug ~ '^[a-z0-9_-]+$'),
  label text not null check (length(label) between 1 and 60),
  -- How the assistant refers to the place in messages ("o salão").
  place text not null check (length(place) between 1 and 40),
  customer_word text not null default 'cliente' check (customer_word in ('cliente', 'paciente')),
  starter_services jsonb not null default '[]',
  starter_hours jsonb not null default '[]',
  created_at timestamptz not null default now()
);
alter table niches enable row level security;

insert into niches (slug, label, place, customer_word, starter_services, starter_hours) values
  ('beauty_salon', 'Salão de beleza', 'salão', 'cliente',
   '[{"name":"Corte feminino","durationMinutes":60,"priceCents":null},
     {"name":"Escova","durationMinutes":45,"priceCents":null},
     {"name":"Hidratação","durationMinutes":60,"priceCents":null},
     {"name":"Corte masculino","durationMinutes":30,"priceCents":null}]',
   '[{"weekday":2,"opensAt":"09:00","closesAt":"18:00"},{"weekday":3,"opensAt":"09:00","closesAt":"18:00"},
     {"weekday":4,"opensAt":"09:00","closesAt":"18:00"},{"weekday":5,"opensAt":"09:00","closesAt":"18:00"},
     {"weekday":6,"opensAt":"09:00","closesAt":"18:00"}]'),
  ('barbershop', 'Barbearia', 'barbearia', 'cliente',
   '[{"name":"Corte masculino","durationMinutes":30,"priceCents":null},
     {"name":"Barba","durationMinutes":30,"priceCents":null},
     {"name":"Corte + barba","durationMinutes":60,"priceCents":null}]',
   '[{"weekday":2,"opensAt":"09:00","closesAt":"18:00"},{"weekday":3,"opensAt":"09:00","closesAt":"18:00"},
     {"weekday":4,"opensAt":"09:00","closesAt":"18:00"},{"weekday":5,"opensAt":"09:00","closesAt":"18:00"},
     {"weekday":6,"opensAt":"09:00","closesAt":"18:00"}]'),
  ('aesthetics', 'Estética', 'espaço', 'cliente',
   '[{"name":"Limpeza de pele","durationMinutes":60,"priceCents":null},
     {"name":"Design de sobrancelha","durationMinutes":30,"priceCents":null},
     {"name":"Depilação","durationMinutes":30,"priceCents":null}]',
   '[{"weekday":2,"opensAt":"09:00","closesAt":"18:00"},{"weekday":3,"opensAt":"09:00","closesAt":"18:00"},
     {"weekday":4,"opensAt":"09:00","closesAt":"18:00"},{"weekday":5,"opensAt":"09:00","closesAt":"18:00"},
     {"weekday":6,"opensAt":"09:00","closesAt":"18:00"}]'),
  ('nails', 'Manicure e pedicure', 'espaço', 'cliente',
   '[{"name":"Manicure","durationMinutes":45,"priceCents":null},
     {"name":"Pedicure","durationMinutes":45,"priceCents":null},
     {"name":"Pé e mão","durationMinutes":90,"priceCents":null}]',
   '[{"weekday":2,"opensAt":"09:00","closesAt":"18:00"},{"weekday":3,"opensAt":"09:00","closesAt":"18:00"},
     {"weekday":4,"opensAt":"09:00","closesAt":"18:00"},{"weekday":5,"opensAt":"09:00","closesAt":"18:00"},
     {"weekday":6,"opensAt":"09:00","closesAt":"18:00"}]'),
  ('aesthetic_clinic', 'Clínica estética', 'clínica', 'paciente',
   '[{"name":"Avaliação","durationMinutes":30,"priceCents":null}]',
   '[{"weekday":2,"opensAt":"09:00","closesAt":"18:00"},{"weekday":3,"opensAt":"09:00","closesAt":"18:00"},
     {"weekday":4,"opensAt":"09:00","closesAt":"18:00"},{"weekday":5,"opensAt":"09:00","closesAt":"18:00"},
     {"weekday":6,"opensAt":"09:00","closesAt":"18:00"}]'),
  ('clinic', 'Clínica', 'clínica', 'paciente',
   '[{"name":"Consulta","durationMinutes":30,"priceCents":null}]',
   '[{"weekday":2,"opensAt":"09:00","closesAt":"18:00"},{"weekday":3,"opensAt":"09:00","closesAt":"18:00"},
     {"weekday":4,"opensAt":"09:00","closesAt":"18:00"},{"weekday":5,"opensAt":"09:00","closesAt":"18:00"},
     {"weekday":6,"opensAt":"09:00","closesAt":"18:00"}]'),
  ('other', 'Outro', 'estabelecimento', 'cliente', '[]',
   '[{"weekday":2,"opensAt":"09:00","closesAt":"18:00"},{"weekday":3,"opensAt":"09:00","closesAt":"18:00"},
     {"weekday":4,"opensAt":"09:00","closesAt":"18:00"},{"weekday":5,"opensAt":"09:00","closesAt":"18:00"},
     {"weekday":6,"opensAt":"09:00","closesAt":"18:00"}]');

-- business_type now points at a row here instead of a fixed list, so the
-- agency can add niches without a new migration. Existing values already
-- match the slugs seeded above.
alter table tenants drop constraint tenants_business_type_check;
alter table tenants add constraint tenants_business_type_fkey
  foreign key (business_type) references niches (slug);
