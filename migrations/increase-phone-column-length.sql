-- Fix: value too long for type character varying(15)
-- Run this once against your PostgreSQL database (e.g. Supabase SQL editor or psql).
-- The error usually comes from the "phone" column storing full international numbers.

-- Increase phone to support full international numbers (e.g. +201234567890 = 13 chars; some numbers are longer)
ALTER TABLE users
  ALTER COLUMN phone TYPE varchar(30);

-- Optional: if you still get "value too long", increase country_code or username:
-- ALTER TABLE users ALTER COLUMN country_code TYPE varchar(20);
-- ALTER TABLE users ALTER COLUMN username TYPE varchar(50);
