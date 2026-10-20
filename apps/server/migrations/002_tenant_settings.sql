-- Per-client settings edited in the panel ("Configurações da Lia") and the
-- beauty & aesthetics niches.

alter table tenants drop constraint tenants_business_type_check;
alter table tenants add constraint tenants_business_type_check check (
  business_type in ('beauty_salon', 'barbershop', 'aesthetics', 'nails', 'aesthetic_clinic', 'clinic', 'other')
);

alter table tenants
  add column address text,
  -- How the assistant talks: 'friendly' (informal) or 'formal'.
  add column tone text not null default 'friendly' check (tone in ('friendly', 'formal')),
  add column use_emoji boolean not null default true,
  -- Free text the assistant may use to answer questions (payment, parking, policies...).
  add column extra_info text,
  -- Free text: situations the assistant must always hand over to the owner.
  add column handoff_rules text,
  -- Minimum notice for a booking and how far ahead customers can book.
  add column min_notice_minutes integer not null default 60 check (min_notice_minutes between 0 and 10080),
  add column booking_horizon_days integer not null default 60 check (booking_horizon_days between 1 and 365);
