-- Files sent in a conversation (today: the price list), so the panel can show
-- them instead of only a text line. { "kind": "price_table", "name", "mime" }
alter table messages add column attachment jsonb;

-- Profile photo of the assistant's WhatsApp number (also shown in the panel).
alter table tenants
  add column assistant_photo bytea,
  add column assistant_photo_mime text check (assistant_photo_mime in ('image/jpeg', 'image/png', 'image/webp')),
  add check ((assistant_photo is null) = (assistant_photo_mime is null));
