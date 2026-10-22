-- Rento v2 — additive schema. Safe to apply alongside the current application.
-- All monetary values are integer UZS. Local business date is Asia/Tashkent.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS rento_v2;
SET search_path = rento_v2, public;

CREATE TABLE IF NOT EXISTS accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL DEFAULT 'Rento',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS admins (
 account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
 login text NOT NULL DEFAULT 'Admin',
 password_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS categories (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES accounts ON DELETE CASCADE,
 name text NOT NULL, UNIQUE(account_id,name), UNIQUE(account_id,id)
);
CREATE TABLE IF NOT EXISTS branches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES accounts ON DELETE CASCADE,
 name text NOT NULL, address text NOT NULL DEFAULT '', phone text NOT NULL DEFAULT '',
 UNIQUE(account_id,id)
);
CREATE TABLE IF NOT EXISTS costumes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES accounts ON DELETE CASCADE,
 category_id uuid, name text NOT NULL, code text NOT NULL, size text NOT NULL DEFAULT '',
 age_from int, age_to int, condition text NOT NULL DEFAULT 'good' CHECK(condition IN ('new','good','worn','repair')),
 daily_price bigint NOT NULL DEFAULT 0 CHECK(daily_price>=0), deposit bigint NOT NULL DEFAULT 0 CHECK(deposit>=0),
 description text NOT NULL DEFAULT '', photo_url text, active boolean NOT NULL DEFAULT true,
 UNIQUE(account_id,code), UNIQUE(account_id,id),
 FOREIGN KEY(account_id,category_id) REFERENCES categories(account_id,id),
 CHECK(age_from IS NULL OR age_from BETWEEN 0 AND 18),
 CHECK(age_to IS NULL OR age_to BETWEEN 0 AND 18),
 CHECK(age_from IS NULL OR age_to IS NULL OR age_from<=age_to)
);
CREATE TABLE IF NOT EXISTS stock (
 account_id uuid NOT NULL REFERENCES accounts ON DELETE CASCADE, costume_id uuid NOT NULL, branch_id uuid NOT NULL,
 quantity int NOT NULL DEFAULT 0 CHECK(quantity>=0), PRIMARY KEY(account_id,costume_id,branch_id),
 FOREIGN KEY(account_id,costume_id) REFERENCES costumes(account_id,id),
 FOREIGN KEY(account_id,branch_id) REFERENCES branches(account_id,id)
);
CREATE TABLE IF NOT EXISTS clients (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES accounts ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('kindergarten','school','person')), name text NOT NULL,
 contact text NOT NULL DEFAULT '', phone text NOT NULL DEFAULT '', telegram text NOT NULL DEFAULT '',
 note text NOT NULL DEFAULT '', UNIQUE(account_id,id)
);
CREATE TABLE IF NOT EXISTS counters (
 account_id uuid PRIMARY KEY REFERENCES accounts ON DELETE CASCADE, next_booking int NOT NULL DEFAULT 1 CHECK(next_booking>0)
);
CREATE TABLE IF NOT EXISTS bookings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES accounts ON DELETE CASCADE,
 client_id uuid NOT NULL, branch_id uuid NOT NULL, code text NOT NULL, status text NOT NULL CHECK(status IN ('reserved','issued','returned','cancelled')),
 start_date date NOT NULL, end_date date NOT NULL, note text NOT NULL DEFAULT '', discount bigint NOT NULL DEFAULT 0 CHECK(discount>=0),
 extra_rent bigint NOT NULL DEFAULT 0 CHECK(extra_rent>=0), return_note text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(), returned_at timestamptz,
 UNIQUE(account_id,code), UNIQUE(account_id,id),
 FOREIGN KEY(account_id,client_id) REFERENCES clients(account_id,id),
 FOREIGN KEY(account_id,branch_id) REFERENCES branches(account_id,id),
 CHECK(end_date>=start_date)
);
CREATE TABLE IF NOT EXISTS booking_items (
 account_id uuid NOT NULL REFERENCES accounts ON DELETE CASCADE, booking_id uuid NOT NULL, costume_id uuid NOT NULL,
 quantity int NOT NULL CHECK(quantity>0), daily_price bigint NOT NULL CHECK(daily_price>=0), deposit_each bigint NOT NULL CHECK(deposit_each>=0),
 PRIMARY KEY(account_id,booking_id,costume_id),
 FOREIGN KEY(account_id,booking_id) REFERENCES bookings(account_id,id) ON DELETE CASCADE,
 FOREIGN KEY(account_id,costume_id) REFERENCES costumes(account_id,id)
);
CREATE TABLE IF NOT EXISTS payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES accounts ON DELETE CASCADE,
 booking_id uuid NOT NULL, kind text NOT NULL CHECK(kind IN ('rent','refund','deposit','deposit_return','forfeit')),
 method text NOT NULL CHECK(method IN ('cash','card','transfer')), amount bigint NOT NULL CHECK(amount>0),
 occurred_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(account_id,booking_id) REFERENCES bookings(account_id,id)
);
CREATE TABLE IF NOT EXISTS expenses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES accounts ON DELETE CASCADE,
 branch_id uuid, category text NOT NULL, amount bigint NOT NULL CHECK(amount>0), occurred_at timestamptz NOT NULL DEFAULT now(), note text NOT NULL DEFAULT '',
 FOREIGN KEY(account_id,branch_id) REFERENCES branches(account_id,id)
);
CREATE TABLE IF NOT EXISTS transfers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES accounts ON DELETE CASCADE,
 from_branch uuid NOT NULL, to_branch uuid NOT NULL, costume_id uuid NOT NULL, quantity int NOT NULL CHECK(quantity>0),
 occurred_at timestamptz NOT NULL DEFAULT now(), CHECK(from_branch<>to_branch),
 FOREIGN KEY(account_id,from_branch) REFERENCES branches(account_id,id),
 FOREIGN KEY(account_id,to_branch) REFERENCES branches(account_id,id),
 FOREIGN KEY(account_id,costume_id) REFERENCES costumes(account_id,id)
);
CREATE INDEX IF NOT EXISTS bookings_calendar_idx ON bookings(account_id,branch_id,start_date,end_date) WHERE status IN ('reserved','issued');
CREATE INDEX IF NOT EXISTS payments_account_date_idx ON payments(account_id,occurred_at);

-- Peak overlap, not the sum of bookings across the whole interval.
CREATE OR REPLACE FUNCTION availability(p_account uuid,p_branch uuid,p_costume uuid,p_start date,p_end date,p_exclude uuid DEFAULT NULL)
RETURNS integer LANGUAGE sql STABLE AS $$
 WITH daily AS (
   SELECT d::date day, COALESCE(SUM(bi.quantity),0)::int busy
   FROM generate_series(p_start,p_end,interval '1 day') d
   LEFT JOIN bookings b ON b.account_id=p_account AND b.branch_id=p_branch
      AND b.status IN ('reserved','issued') AND b.id IS DISTINCT FROM p_exclude
      AND d::date BETWEEN b.start_date AND b.end_date
   LEFT JOIN booking_items bi ON bi.account_id=b.account_id AND bi.booking_id=b.id AND bi.costume_id=p_costume
   GROUP BY d::date
 ), s AS (
   SELECT COALESCE(quantity,0) quantity FROM stock WHERE account_id=p_account AND branch_id=p_branch AND costume_id=p_costume
 )
 SELECT GREATEST(0,COALESCE((SELECT quantity FROM s),0)-COALESCE((SELECT MAX(busy) FROM daily),0))
$$;

-- Every booking mutation takes the same account-scoped transaction lock.
CREATE OR REPLACE FUNCTION create_booking(
 p_account uuid,p_client uuid,p_branch uuid,p_start date,p_end date,
 p_items jsonb,p_status text DEFAULT 'reserved',p_discount bigint DEFAULT 0,p_note text DEFAULT ''
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid; v_code text; v_counter int; it jsonb; v_costume uuid; v_qty int; v_price bigint; v_dep bigint; v_free int; v_total bigint:=0; v_days int;
BEGIN
 IF p_status NOT IN ('reserved','issued') THEN RAISE EXCEPTION 'Недопустимый статус заказа'; END IF;
 IF p_end<p_start THEN RAISE EXCEPTION 'Дата возврата раньше даты выдачи'; END IF;
 IF p_discount<0 THEN RAISE EXCEPTION 'Скидка не может быть отрицательной'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_account::text,0));
 IF NOT EXISTS(SELECT 1 FROM clients WHERE account_id=p_account AND id=p_client) THEN RAISE EXCEPTION 'Клиент не найден'; END IF;
 IF NOT EXISTS(SELECT 1 FROM branches WHERE account_id=p_account AND id=p_branch) THEN RAISE EXCEPTION 'Филиал не найден'; END IF;
 IF jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)=0 THEN RAISE EXCEPTION 'Добавьте хотя бы один костюм'; END IF;
 v_days := p_end-p_start+1;
 FOR it IN SELECT value FROM jsonb_array_elements(p_items) LOOP
   v_costume:=(it->>'costume_id')::uuid; v_qty:=(it->>'quantity')::int;
   IF v_qty<=0 THEN RAISE EXCEPTION 'Количество должно быть больше нуля'; END IF;
   SELECT daily_price,deposit INTO v_price,v_dep FROM costumes WHERE account_id=p_account AND id=v_costume AND active AND condition<>'repair' FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Костюм недоступен или скрыт'; END IF;
   v_free:=availability(p_account,p_branch,v_costume,p_start,p_end,NULL);
   IF v_free<v_qty THEN RAISE EXCEPTION 'Недостаточно костюмов: свободно %',v_free; END IF;
   v_total:=v_total+(v_days*v_qty*v_price);
 END LOOP;
 IF p_discount>v_total THEN RAISE EXCEPTION 'Скидка не больше суммы аренды'; END IF;
 INSERT INTO counters(account_id,next_booking) VALUES(p_account,2) ON CONFLICT(account_id) DO UPDATE SET next_booking=counters.next_booking+1 RETURNING next_booking-1 INTO v_counter;
 v_code:='R-'||lpad(v_counter::text,4,'0');
 INSERT INTO bookings(account_id,client_id,branch_id,code,status,start_date,end_date,note,discount)
 VALUES(p_account,p_client,p_branch,v_code,p_status,p_start,p_end,p_note,p_discount) RETURNING id INTO v_id;
 FOR it IN SELECT value FROM jsonb_array_elements(p_items) LOOP
   v_costume:=(it->>'costume_id')::uuid; v_qty:=(it->>'quantity')::int;
   SELECT daily_price,deposit INTO v_price,v_dep FROM costumes WHERE account_id=p_account AND id=v_costume;
   INSERT INTO booking_items(account_id,booking_id,costume_id,quantity,daily_price,deposit_each)
   VALUES(p_account,v_id,v_costume,v_qty,v_price,v_dep);
 END LOOP;
 RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION change_booking_status(p_account uuid,p_booking uuid,p_status text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_account::text,0));
 IF p_status='cancelled' THEN
   UPDATE bookings SET status='cancelled' WHERE account_id=p_account AND id=p_booking AND status='reserved';
   IF NOT FOUND THEN RAISE EXCEPTION 'Отменить можно только бронь'; END IF;
 ELSIF p_status='issued' THEN
   UPDATE bookings SET status='issued' WHERE account_id=p_account AND id=p_booking AND status='reserved';
   IF NOT FOUND THEN RAISE EXCEPTION 'Выдать можно только бронь'; END IF;
 ELSE RAISE EXCEPTION 'Используйте специальную операцию возврата'; END IF;
END $$;

CREATE OR REPLACE FUNCTION return_booking(p_account uuid,p_booking uuid,p_extra bigint,p_forfeit bigint,p_return_deposit boolean,p_method text,p_return_note text DEFAULT '')
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_deposit bigint; v_paid_deposit bigint; v_already_returned bigint; v_days_late int; v_daily bigint;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_account::text,0));
 IF p_extra<0 OR p_forfeit<0 THEN RAISE EXCEPTION 'Суммы не могут быть отрицательными'; END IF;
 SELECT COALESCE(SUM(quantity*deposit_each),0) INTO v_deposit FROM booking_items WHERE account_id=p_account AND booking_id=p_booking;
 SELECT COALESCE(SUM(amount) FILTER(WHERE kind='deposit'),0),COALESCE(SUM(amount) FILTER(WHERE kind IN ('deposit_return','forfeit')),0)
 INTO v_paid_deposit,v_already_returned FROM payments WHERE account_id=p_account AND booking_id=p_booking;
 IF p_forfeit>v_paid_deposit-v_already_returned THEN RAISE EXCEPTION 'Удержание больше залога на руках'; END IF;
 IF NOT EXISTS(SELECT 1 FROM bookings WHERE account_id=p_account AND id=p_booking AND status='issued') THEN RAISE EXCEPTION 'Возврат возможен только для выданного заказа'; END IF;
 UPDATE bookings SET status='returned',extra_rent=extra_rent+p_extra,return_note=p_return_note,returned_at=now()
 WHERE account_id=p_account AND id=p_booking;
 IF p_forfeit>0 THEN INSERT INTO payments(account_id,booking_id,kind,method,amount) VALUES(p_account,p_booking,'forfeit',p_method,p_forfeit); END IF;
 IF p_return_deposit THEN
   IF v_paid_deposit-v_already_returned-p_forfeit>0 THEN
     INSERT INTO payments(account_id,booking_id,kind,method,amount)
     VALUES(p_account,p_booking,'deposit_return',p_method,v_paid_deposit-v_already_returned-p_forfeit);
   END IF;
 END IF;
END $$;
COMMIT;
