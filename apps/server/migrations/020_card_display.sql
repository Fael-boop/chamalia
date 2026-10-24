-- What the business sees about its card in Configurações > Cobrança: brand and last 4 digits only
-- (allowed to keep; the full number and security code never reach us).
alter table card_subscriptions
  add column card_brand text check (length(card_brand) <= 30),
  add column card_last_four text check (card_last_four ~ '^[0-9]{4}$');
