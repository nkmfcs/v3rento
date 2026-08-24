-- Несколько адресов у клиента + нормализация старых яндекс-доставок в обычный адрес.

ALTER TABLE clients ADD COLUMN IF NOT EXISTS addresses TEXT;

UPDATE clients
   SET addresses = CASE
         WHEN address IS NOT NULL AND btrim(address) <> '' THEN json_build_array(btrim(address))::text
         ELSE '[]'
       END
 WHERE addresses IS NULL OR btrim(addresses) = '';

-- Демо-адреса для витрины «Карнавал» (если ещё пусто).
UPDATE clients SET address = 'Чиланзар, 9 квартал, д.14',
                   addresses = '["Чиланзар, 9 квартал, д.14"]'
 WHERE name = 'Шохрух М.' AND (address IS NULL OR btrim(address) = '');

UPDATE clients SET address = 'Юнусабад, 4 квартал, д/с «Болажон»',
                   addresses = '["Юнусабад, 4 квартал, д/с «Болажон»","Мирзо-Улугбек, филиал на Буюк Ипак Йули"]'
 WHERE name = 'Д/с «Болажон»' AND (address IS NULL OR btrim(address) = '');

UPDATE clients SET address = 'Яккасарай, ул. Шота Руставели 45',
                   addresses = '["Яккасарай, ул. Шота Руставели 45"]'
 WHERE name = 'Школа №64' AND (address IS NULL OR btrim(address) = '');

UPDATE clients SET address = 'Мирзо-Улугбек, ул. Буюк Ипак Йули 12',
                   addresses = '["Мирзо-Улугбек, ул. Буюк Ипак Йули 12"]'
 WHERE name = 'Азиза Р.' AND (address IS NULL OR btrim(address) = '');

UPDATE clients SET address = 'Сергели, массив 7, д.22',
                   addresses = '["Сергели, массив 7, д.22"]'
 WHERE name = 'Камила Т.' AND (address IS NULL OR btrim(address) = '');

UPDATE clients SET address = 'Чиланзар, 21 квартал, д.8',
                   addresses = '["Чиланзар, 21 квартал, д.8"]'
 WHERE name = 'Нигора А.' AND (address IS NULL OR btrim(address) = '');

-- Старые «яндекс»-заказы оставляем с адресом, без такси-статуса.
UPDATE orders
   SET delivery_type = 'addr'
 WHERE delivery_type IN ('yandex', 'courier')
   AND delivery_addr IS NOT NULL
   AND btrim(delivery_addr) <> '';
