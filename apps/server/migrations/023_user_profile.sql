-- More about each person with access: how they like to be called, a contact phone and a photo
-- (shown on the avatar in the top bar). All optional.
alter table tenant_users
  add column nickname text check (length(nickname) <= 40),
  add column phone text check (phone ~ '^[0-9]{10,15}$'),
  add column photo bytea,
  add column photo_mime text check (photo_mime in ('image/jpeg', 'image/png', 'image/webp')),
  add check ((photo is null) = (photo_mime is null));
