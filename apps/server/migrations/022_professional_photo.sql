-- Photo of each professional, shown on the agenda and in the team list (small square image).
alter table professionals
  add column photo bytea,
  add column photo_mime text check (photo_mime in ('image/jpeg', 'image/png', 'image/webp')),
  add check ((photo is null) = (photo_mime is null));
