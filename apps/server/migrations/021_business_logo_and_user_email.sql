-- The business's logo, shown in the panel (menu and profile). Separate from the WhatsApp
-- profile photo of the assistant (assistant_photo).
alter table tenants
  add column logo bytea,
  add column logo_mime text check (logo_mime in ('image/jpeg', 'image/png', 'image/webp')),
  add check ((logo is null) = (logo_mime is null));

-- Contact e-mail of each person with access (shown in the profile; optional).
alter table tenant_users add column email text check (length(email) <= 254);
