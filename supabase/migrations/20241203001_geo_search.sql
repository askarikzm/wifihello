-- ============================================
-- WANCOM ISP - GEO HIERARCHY & NETWORK SEARCH
-- Migration: 20241203001_geo_search.sql
-- Adds PTA-style regional hierarchy tables, foreign
-- keys for OLT/ONU assets, and FTS vectors for
-- dual-mode OLT/ONU lookups.
-- ============================================

CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Helper to keep updated_at fields fresh
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

-- ============================================
-- GEO REGIONS
-- ============================================
CREATE TABLE IF NOT EXISTS public.geo_regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  pta_code text,
  sort_order int DEFAULT 0,
  latitude numeric(9,6),
  longitude numeric(9,6),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT geo_regions_code_key UNIQUE (code),
  CONSTRAINT geo_regions_pta_code_key UNIQUE (pta_code)
);

CREATE UNIQUE INDEX IF NOT EXISTS geo_regions_name_key
  ON public.geo_regions (lower(name));

ALTER TABLE public.geo_regions ENABLE ROW LEVEL SECURITY;

CREATE POLICY geo_regions_admin_select ON public.geo_regions
  FOR SELECT USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid()
    )
  );

CREATE POLICY geo_regions_service_manage ON public.geo_regions
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER geo_regions_touch_updated
BEFORE UPDATE ON public.geo_regions
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================
-- GEO CITIES
-- ============================================
CREATE TABLE IF NOT EXISTS public.geo_cities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id uuid NOT NULL REFERENCES public.geo_regions(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  pta_code text,
  sort_order int DEFAULT 0,
  latitude numeric(9,6),
  longitude numeric(9,6),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT geo_cities_code_key UNIQUE (region_id, code),
  CONSTRAINT geo_cities_name_key UNIQUE (region_id, name)
);

ALTER TABLE public.geo_cities ADD CONSTRAINT geo_cities_region_pair UNIQUE (id, region_id);

CREATE UNIQUE INDEX IF NOT EXISTS geo_cities_name_unique
  ON public.geo_cities(region_id, lower(name));

CREATE INDEX IF NOT EXISTS geo_cities_region_idx ON public.geo_cities(region_id);

ALTER TABLE public.geo_cities ENABLE ROW LEVEL SECURITY;

CREATE POLICY geo_cities_admin_select ON public.geo_cities
  FOR SELECT USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid()
    )
  );

CREATE POLICY geo_cities_service_manage ON public.geo_cities
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER geo_cities_touch_updated
BEFORE UPDATE ON public.geo_cities
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================
-- GEO DISTRICTS
-- ============================================
CREATE TABLE IF NOT EXISTS public.geo_districts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id uuid NOT NULL REFERENCES public.geo_regions(id) ON DELETE CASCADE,
  city_id uuid NOT NULL REFERENCES public.geo_cities(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  pta_code text,
  sort_order int DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT geo_districts_code_key UNIQUE (city_id, code),
  CONSTRAINT geo_districts_name_key UNIQUE (city_id, name)
);

ALTER TABLE public.geo_districts
  ADD CONSTRAINT geo_districts_city_region_fk
  FOREIGN KEY (city_id, region_id)
  REFERENCES public.geo_cities(id, region_id)
  ON DELETE CASCADE;

ALTER TABLE public.geo_districts ADD CONSTRAINT geo_districts_hierarchy_key UNIQUE (id, city_id, region_id);

CREATE INDEX IF NOT EXISTS geo_districts_city_idx ON public.geo_districts(city_id);
CREATE INDEX IF NOT EXISTS geo_districts_region_idx ON public.geo_districts(region_id);
CREATE UNIQUE INDEX IF NOT EXISTS geo_districts_name_unique
  ON public.geo_districts(city_id, lower(name));

ALTER TABLE public.geo_districts ENABLE ROW LEVEL SECURITY;

CREATE POLICY geo_districts_admin_select ON public.geo_districts
  FOR SELECT USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid()
    )
  );

CREATE POLICY geo_districts_service_manage ON public.geo_districts
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER geo_districts_touch_updated
BEFORE UPDATE ON public.geo_districts
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================
-- GEO AREAS
-- ============================================
CREATE TABLE IF NOT EXISTS public.geo_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id uuid NOT NULL REFERENCES public.geo_regions(id) ON DELETE CASCADE,
  city_id uuid NOT NULL REFERENCES public.geo_cities(id) ON DELETE CASCADE,
  district_id uuid NOT NULL REFERENCES public.geo_districts(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  pta_code text,
  sort_order int DEFAULT 0,
  latitude numeric(9,6),
  longitude numeric(9,6),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT geo_areas_code_key UNIQUE (district_id, code),
  CONSTRAINT geo_areas_name_key UNIQUE (district_id, name)
);

ALTER TABLE public.geo_areas
  ADD CONSTRAINT geo_areas_district_hierarchy_fk
  FOREIGN KEY (district_id, city_id, region_id)
  REFERENCES public.geo_districts(id, city_id, region_id)
  ON DELETE CASCADE;

ALTER TABLE public.geo_areas ADD CONSTRAINT geo_areas_hierarchy_key UNIQUE (id, district_id, city_id, region_id);

CREATE INDEX IF NOT EXISTS geo_areas_district_idx ON public.geo_areas(district_id);
CREATE INDEX IF NOT EXISTS geo_areas_city_idx ON public.geo_areas(city_id);
CREATE INDEX IF NOT EXISTS geo_areas_region_idx ON public.geo_areas(region_id);
CREATE UNIQUE INDEX IF NOT EXISTS geo_areas_name_unique
  ON public.geo_areas(district_id, lower(name));

ALTER TABLE public.geo_areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY geo_areas_admin_select ON public.geo_areas
  FOR SELECT USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid()
    )
  );

CREATE POLICY geo_areas_service_manage ON public.geo_areas
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER geo_areas_touch_updated
BEFORE UPDATE ON public.geo_areas
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================
-- EXISTING TABLE UPDATES (OLT / ONU)
-- ============================================
ALTER TABLE public.olt_devices ADD COLUMN IF NOT EXISTS region_id uuid;
ALTER TABLE public.olt_devices ADD COLUMN IF NOT EXISTS city_id uuid;
ALTER TABLE public.olt_devices ADD COLUMN IF NOT EXISTS district_id uuid;
ALTER TABLE public.olt_devices ADD COLUMN IF NOT EXISTS area_id uuid;
ALTER TABLE public.olt_devices ADD COLUMN IF NOT EXISTS site_label text;
ALTER TABLE public.olt_devices ADD COLUMN IF NOT EXISTS olt_search_vector tsvector NOT NULL DEFAULT ''::tsvector;

ALTER TABLE public.olt_devices
  ADD CONSTRAINT olt_devices_region_fk FOREIGN KEY (region_id)
  REFERENCES public.geo_regions(id) ON DELETE SET NULL;

ALTER TABLE public.olt_devices
  ADD CONSTRAINT olt_devices_city_fk FOREIGN KEY (city_id)
  REFERENCES public.geo_cities(id) ON DELETE SET NULL;

ALTER TABLE public.olt_devices
  ADD CONSTRAINT olt_devices_district_fk FOREIGN KEY (district_id)
  REFERENCES public.geo_districts(id) ON DELETE SET NULL;

ALTER TABLE public.olt_devices
  ADD CONSTRAINT olt_devices_area_fk FOREIGN KEY (area_id)
  REFERENCES public.geo_areas(id) ON DELETE SET NULL;

ALTER TABLE public.olt_devices
  ADD CONSTRAINT olt_devices_city_region_fk
  FOREIGN KEY (city_id, region_id)
  REFERENCES public.geo_cities(id, region_id)
  ON DELETE SET NULL;

ALTER TABLE public.olt_devices
  ADD CONSTRAINT olt_devices_district_hierarchy_fk
  FOREIGN KEY (district_id, city_id, region_id)
  REFERENCES public.geo_districts(id, city_id, region_id)
  ON DELETE SET NULL;

ALTER TABLE public.olt_devices
  ADD CONSTRAINT olt_devices_area_hierarchy_fk
  FOREIGN KEY (area_id, district_id, city_id, region_id)
  REFERENCES public.geo_areas(id, district_id, city_id, region_id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS olt_devices_region_idx ON public.olt_devices(region_id);
CREATE INDEX IF NOT EXISTS olt_devices_city_idx ON public.olt_devices(city_id);
CREATE INDEX IF NOT EXISTS olt_devices_district_idx ON public.olt_devices(district_id);
CREATE INDEX IF NOT EXISTS olt_devices_area_idx ON public.olt_devices(area_id);

ALTER TABLE public.onu_mapping ADD COLUMN IF NOT EXISTS mac_address text;
ALTER TABLE public.onu_mapping ADD COLUMN IF NOT EXISTS region_id uuid;
ALTER TABLE public.onu_mapping ADD COLUMN IF NOT EXISTS city_id uuid;
ALTER TABLE public.onu_mapping ADD COLUMN IF NOT EXISTS district_id uuid;
ALTER TABLE public.onu_mapping ADD COLUMN IF NOT EXISTS area_id uuid;
ALTER TABLE public.onu_mapping ADD COLUMN IF NOT EXISTS installation_address text;
ALTER TABLE public.onu_mapping ADD COLUMN IF NOT EXISTS last_inspected_at timestamptz;
ALTER TABLE public.onu_mapping ADD COLUMN IF NOT EXISTS status_note text;
ALTER TABLE public.onu_mapping ADD COLUMN IF NOT EXISTS onu_search_vector tsvector NOT NULL DEFAULT ''::tsvector;

ALTER TABLE public.onu_mapping
  ADD CONSTRAINT onu_mapping_region_fk FOREIGN KEY (region_id)
  REFERENCES public.geo_regions(id) ON DELETE SET NULL;

ALTER TABLE public.onu_mapping
  ADD CONSTRAINT onu_mapping_city_fk FOREIGN KEY (city_id)
  REFERENCES public.geo_cities(id) ON DELETE SET NULL;

ALTER TABLE public.onu_mapping
  ADD CONSTRAINT onu_mapping_district_fk FOREIGN KEY (district_id)
  REFERENCES public.geo_districts(id) ON DELETE SET NULL;

ALTER TABLE public.onu_mapping
  ADD CONSTRAINT onu_mapping_area_fk FOREIGN KEY (area_id)
  REFERENCES public.geo_areas(id) ON DELETE SET NULL;

ALTER TABLE public.onu_mapping
  ADD CONSTRAINT onu_mapping_city_region_fk
  FOREIGN KEY (city_id, region_id)
  REFERENCES public.geo_cities(id, region_id)
  ON DELETE SET NULL;

ALTER TABLE public.onu_mapping
  ADD CONSTRAINT onu_mapping_district_hierarchy_fk
  FOREIGN KEY (district_id, city_id, region_id)
  REFERENCES public.geo_districts(id, city_id, region_id)
  ON DELETE SET NULL;

ALTER TABLE public.onu_mapping
  ADD CONSTRAINT onu_mapping_area_hierarchy_fk
  FOREIGN KEY (area_id, district_id, city_id, region_id)
  REFERENCES public.geo_areas(id, district_id, city_id, region_id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS onu_mapping_region_idx ON public.onu_mapping(region_id);
CREATE INDEX IF NOT EXISTS onu_mapping_city_idx ON public.onu_mapping(city_id);
CREATE INDEX IF NOT EXISTS onu_mapping_district_idx ON public.onu_mapping(district_id);
CREATE INDEX IF NOT EXISTS onu_mapping_area_idx ON public.onu_mapping(area_id);
CREATE INDEX IF NOT EXISTS onu_mapping_customer_idx ON public.onu_mapping(customer_id);

CREATE UNIQUE INDEX IF NOT EXISTS onu_mapping_olt_serial_key
  ON public.onu_mapping(olt_id, serial)
  WHERE serial IS NOT NULL;

-- ============================================
-- FULL-TEXT SEARCH VECTORS
-- ============================================
CREATE OR REPLACE FUNCTION public.refresh_olt_search_vector()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_region text;
  v_city text;
  v_district text;
  v_area text;
BEGIN
  SELECT name INTO v_region FROM public.geo_regions WHERE id = NEW.region_id;
  SELECT name INTO v_city FROM public.geo_cities WHERE id = NEW.city_id;
  SELECT name INTO v_district FROM public.geo_districts WHERE id = NEW.district_id;
  SELECT name INTO v_area FROM public.geo_areas WHERE id = NEW.area_id;

  NEW.olt_search_vector :=
    setweight(to_tsvector('simple', coalesce(unaccent(NEW.hostname), '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(unaccent(NEW.vendor), '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(NEW.mgmt_ip::text, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(unaccent(NEW.site_label), '')), 'C');

  IF v_region IS NOT NULL THEN
    NEW.olt_search_vector := NEW.olt_search_vector || setweight(to_tsvector('simple', unaccent(v_region)), 'D');
  END IF;

  IF v_city IS NOT NULL THEN
    NEW.olt_search_vector := NEW.olt_search_vector || setweight(to_tsvector('simple', unaccent(v_city)), 'D');
  END IF;

  IF v_district IS NOT NULL THEN
    NEW.olt_search_vector := NEW.olt_search_vector || setweight(to_tsvector('simple', unaccent(v_district)), 'D');
  END IF;

  IF v_area IS NOT NULL THEN
    NEW.olt_search_vector := NEW.olt_search_vector || setweight(to_tsvector('simple', unaccent(v_area)), 'D');
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_onu_search_vector()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_customer record;
  v_region text;
  v_city text;
  v_district text;
  v_area text;
  v_port_label text;
BEGIN
  SELECT full_name, account_no, address INTO v_customer
  FROM public.customers
  WHERE id = NEW.customer_id;

  SELECT name INTO v_region FROM public.geo_regions WHERE id = NEW.region_id;
  SELECT name INTO v_city FROM public.geo_cities WHERE id = NEW.city_id;
  SELECT name INTO v_district FROM public.geo_districts WHERE id = NEW.district_id;
  SELECT name INTO v_area FROM public.geo_areas WHERE id = NEW.area_id;

  v_port_label := concat_ws('/', NEW.frame, NEW.slot, NEW.port, NEW.onu_id);

  NEW.onu_search_vector :=
    setweight(to_tsvector('simple', coalesce(unaccent(NEW.serial), '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(unaccent(NEW.mac_address), '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(unaccent(v_port_label), '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(unaccent(NEW.status_note), '')), 'D');

  IF v_customer.full_name IS NOT NULL THEN
    NEW.onu_search_vector := NEW.onu_search_vector || setweight(to_tsvector('simple', unaccent(v_customer.full_name)), 'B');
  END IF;

  IF v_customer.account_no IS NOT NULL THEN
    NEW.onu_search_vector := NEW.onu_search_vector || setweight(to_tsvector('simple', v_customer.account_no), 'B');
  END IF;

  IF v_customer.address IS NOT NULL THEN
    NEW.onu_search_vector := NEW.onu_search_vector || setweight(to_tsvector('simple', unaccent(v_customer.address)), 'C');
  END IF;

  IF v_region IS NOT NULL THEN
    NEW.onu_search_vector := NEW.onu_search_vector || setweight(to_tsvector('simple', unaccent(v_region)), 'D');
  END IF;

  IF v_city IS NOT NULL THEN
    NEW.onu_search_vector := NEW.onu_search_vector || setweight(to_tsvector('simple', unaccent(v_city)), 'D');
  END IF;

  IF v_district IS NOT NULL THEN
    NEW.onu_search_vector := NEW.onu_search_vector || setweight(to_tsvector('simple', unaccent(v_district)), 'D');
  END IF;

  IF v_area IS NOT NULL THEN
    NEW.onu_search_vector := NEW.onu_search_vector || setweight(to_tsvector('simple', unaccent(v_area)), 'D');
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER olt_devices_search_vector_trg
BEFORE INSERT OR UPDATE ON public.olt_devices
FOR EACH ROW EXECUTE FUNCTION public.refresh_olt_search_vector();

CREATE TRIGGER onu_mapping_search_vector_trg
BEFORE INSERT OR UPDATE ON public.onu_mapping
FOR EACH ROW EXECUTE FUNCTION public.refresh_onu_search_vector();

CREATE INDEX IF NOT EXISTS olt_devices_search_vector_idx
  ON public.olt_devices USING gin (olt_search_vector);

CREATE INDEX IF NOT EXISTS onu_mapping_search_vector_idx
  ON public.onu_mapping USING gin (onu_search_vector);

-- ============================================
-- BASELINE GEO SEED DATA (PTA-REFERENCED)
-- ============================================
INSERT INTO public.geo_regions (code, name, pta_code, sort_order)
VALUES
  ('ICT', 'Islamabad Capital Territory', 'ICT', 10),
  ('PB', 'Punjab', 'PB', 20),
  ('SD', 'Sindh', 'SD', 30),
  ('KP', 'Khyber Pakhtunkhwa', 'KP', 40)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    pta_code = EXCLUDED.pta_code,
    sort_order = EXCLUDED.sort_order;

WITH region AS (
  SELECT id FROM public.geo_regions WHERE code = 'ICT'
)
INSERT INTO public.geo_cities (region_id, code, name, sort_order)
SELECT id, 'ISB', 'Islamabad', 10 FROM region
ON CONFLICT (region_id, code) DO UPDATE SET name = EXCLUDED.name;

WITH region AS (
  SELECT id FROM public.geo_regions WHERE code = 'PB'
)
INSERT INTO public.geo_cities (region_id, code, name, sort_order)
SELECT id, 'RWP', 'Rawalpindi', 15 FROM region
ON CONFLICT (region_id, code) DO UPDATE SET name = EXCLUDED.name;

WITH region AS (
  SELECT id FROM public.geo_regions WHERE code = 'PB'
)
INSERT INTO public.geo_cities (region_id, code, name, sort_order)
SELECT id, 'LHE', 'Lahore', 20 FROM region
ON CONFLICT (region_id, code) DO UPDATE SET name = EXCLUDED.name;

WITH region AS (
  SELECT id FROM public.geo_regions WHERE code = 'SD'
)
INSERT INTO public.geo_cities (region_id, code, name, sort_order)
SELECT id, 'KHI', 'Karachi', 10 FROM region
ON CONFLICT (region_id, code) DO UPDATE SET name = EXCLUDED.name;

WITH region AS (
  SELECT id FROM public.geo_regions WHERE code = 'KP'
)
INSERT INTO public.geo_cities (region_id, code, name, sort_order)
SELECT id, 'PEW', 'Peshawar', 10 FROM region
ON CONFLICT (region_id, code) DO UPDATE SET name = EXCLUDED.name;

-- Districts
WITH city AS (
  SELECT c.id, c.region_id FROM public.geo_cities c
  JOIN public.geo_regions r ON r.id = c.region_id
  WHERE c.code = 'ISB' AND r.code = 'ICT'
)
INSERT INTO public.geo_districts (region_id, city_id, code, name, sort_order)
SELECT region_id, id, 'ISB-D1', 'Islamabad District', 10 FROM city
ON CONFLICT (city_id, code) DO UPDATE SET name = EXCLUDED.name;

WITH city AS (
  SELECT c.id, c.region_id FROM public.geo_cities c
  JOIN public.geo_regions r ON r.id = c.region_id
  WHERE c.code = 'RWP' AND r.code = 'PB'
)
INSERT INTO public.geo_districts (region_id, city_id, code, name, sort_order)
SELECT region_id, id, 'RWP-D1', 'Rawalpindi District', 10 FROM city
ON CONFLICT (city_id, code) DO UPDATE SET name = EXCLUDED.name;

WITH city AS (
  SELECT c.id, c.region_id FROM public.geo_cities c
  JOIN public.geo_regions r ON r.id = c.region_id
  WHERE c.code = 'LHE' AND r.code = 'PB'
)
INSERT INTO public.geo_districts (region_id, city_id, code, name, sort_order)
SELECT region_id, id, 'LHE-D1', 'Lahore District', 10 FROM city
ON CONFLICT (city_id, code) DO UPDATE SET name = EXCLUDED.name;

WITH city AS (
  SELECT c.id, c.region_id FROM public.geo_cities c
  JOIN public.geo_regions r ON r.id = c.region_id
  WHERE c.code = 'KHI' AND r.code = 'SD'
)
INSERT INTO public.geo_districts (region_id, city_id, code, name, sort_order)
SELECT region_id, id, 'KHI-D1', 'Karachi District', 10 FROM city
ON CONFLICT (city_id, code) DO UPDATE SET name = EXCLUDED.name;

WITH city AS (
  SELECT c.id, c.region_id FROM public.geo_cities c
  JOIN public.geo_regions r ON r.id = c.region_id
  WHERE c.code = 'PEW' AND r.code = 'KP'
)
INSERT INTO public.geo_districts (region_id, city_id, code, name, sort_order)
SELECT region_id, id, 'PEW-D1', 'Peshawar District', 10 FROM city
ON CONFLICT (city_id, code) DO UPDATE SET name = EXCLUDED.name;

-- Areas
WITH district AS (
  SELECT d.id, d.city_id, d.region_id
  FROM public.geo_districts d
  JOIN public.geo_cities c ON c.id = d.city_id
  WHERE d.code = 'ISB-D1' AND c.code = 'ISB'
)
INSERT INTO public.geo_areas (region_id, city_id, district_id, code, name, sort_order)
SELECT region_id, city_id, id, 'ISB-A-BLUE', 'Blue Area', 10 FROM district
ON CONFLICT (district_id, code) DO UPDATE SET name = EXCLUDED.name;

WITH district AS (
  SELECT d.id, d.city_id, d.region_id
  FROM public.geo_districts d
  JOIN public.geo_cities c ON c.id = d.city_id
  WHERE d.code = 'RWP-D1' AND c.code = 'RWP'
)
INSERT INTO public.geo_areas (region_id, city_id, district_id, code, name, sort_order)
SELECT region_id, city_id, id, 'RWP-A-BAHRIA', 'Bahria Town', 10 FROM district
ON CONFLICT (district_id, code) DO UPDATE SET name = EXCLUDED.name;

WITH district AS (
  SELECT d.id, d.city_id, d.region_id
  FROM public.geo_districts d
  JOIN public.geo_cities c ON c.id = d.city_id
  WHERE d.code = 'LHE-D1' AND c.code = 'LHE'
)
INSERT INTO public.geo_areas (region_id, city_id, district_id, code, name, sort_order)
SELECT region_id, city_id, id, 'LHE-A-GULBERG', 'Gulberg', 10 FROM district
ON CONFLICT (district_id, code) DO UPDATE SET name = EXCLUDED.name;

WITH district AS (
  SELECT d.id, d.city_id, d.region_id
  FROM public.geo_districts d
  JOIN public.geo_cities c ON c.id = d.city_id
  WHERE d.code = 'KHI-D1' AND c.code = 'KHI'
)
INSERT INTO public.geo_areas (region_id, city_id, district_id, code, name, sort_order)
SELECT region_id, city_id, id, 'KHI-A-DHA', 'DHA Phase 6', 10 FROM district
ON CONFLICT (district_id, code) DO UPDATE SET name = EXCLUDED.name;

WITH district AS (
  SELECT d.id, d.city_id, d.region_id
  FROM public.geo_districts d
  JOIN public.geo_cities c ON c.id = d.city_id
  WHERE d.code = 'PEW-D1' AND c.code = 'PEW'
)
INSERT INTO public.geo_areas (region_id, city_id, district_id, code, name, sort_order)
SELECT region_id, city_id, id, 'PEW-A-UNIVERSITY', 'University Town', 10 FROM district
ON CONFLICT (district_id, code) DO UPDATE SET name = EXCLUDED.name;

-- ============================================
-- MAP EXISTING OLT REGIONS INTO NEW HIERARCHY
-- ============================================
INSERT INTO public.geo_regions (code, name)
SELECT DISTINCT upper(regexp_replace(trim(region), '[^a-zA-Z0-9]+', '_', 'g')),
       initcap(trim(region))
FROM public.olt_devices
WHERE region IS NOT NULL AND trim(region) <> ''
ON CONFLICT (code) DO NOTHING;

UPDATE public.olt_devices o
SET region_id = (SELECT id FROM public.geo_regions WHERE code = 'ICT'),
    city_id = (SELECT id FROM public.geo_cities WHERE code = 'ISB'),
    district_id = (SELECT id FROM public.geo_districts WHERE code = 'ISB-D1'),
    area_id = (SELECT id FROM public.geo_areas WHERE code = 'ISB-A-BLUE'),
    site_label = COALESCE(site_label, 'Islamabad POP')
WHERE region ILIKE 'central%';

UPDATE public.olt_devices o
SET region_id = (SELECT id FROM public.geo_regions WHERE code = 'PB'),
    city_id = (SELECT id FROM public.geo_cities WHERE code = 'RWP'),
    district_id = (SELECT id FROM public.geo_districts WHERE code = 'RWP-D1'),
    area_id = (SELECT id FROM public.geo_areas WHERE code = 'RWP-A-BAHRIA'),
    site_label = COALESCE(site_label, 'Rawalpindi POP')
WHERE region ILIKE 'north%';

UPDATE public.olt_devices o
SET region_id = (SELECT id FROM public.geo_regions WHERE code = 'SD'),
    city_id = (SELECT id FROM public.geo_cities WHERE code = 'KHI'),
    district_id = (SELECT id FROM public.geo_districts WHERE code = 'KHI-D1'),
    area_id = (SELECT id FROM public.geo_areas WHERE code = 'KHI-A-DHA'),
    site_label = COALESCE(site_label, 'Karachi POP')
WHERE region ILIKE 'south%';

UPDATE public.olt_devices o
SET region_id = (SELECT id FROM public.geo_regions WHERE code = 'PB'),
    city_id = (SELECT id FROM public.geo_cities WHERE code = 'LHE'),
    district_id = (SELECT id FROM public.geo_districts WHERE code = 'LHE-D1'),
    area_id = (SELECT id FROM public.geo_areas WHERE code = 'LHE-A-GULBERG'),
    site_label = COALESCE(site_label, 'Lahore POP')
WHERE region ILIKE 'east%';

-- Align existing ONU rows to the same areas when unset
UPDATE public.onu_mapping m
SET region_id = o.region_id,
    city_id = o.city_id,
    district_id = o.district_id,
    area_id = o.area_id,
    installation_address = COALESCE(installation_address, c.address)
FROM public.olt_devices o
JOIN public.customers c ON c.id = m.customer_id
WHERE m.olt_id = o.id
  AND (m.region_id IS NULL OR m.city_id IS NULL OR m.district_id IS NULL OR m.area_id IS NULL);

-- Default MAC for legacy demo sample if missing
UPDATE public.onu_mapping
SET mac_address = '00:11:22:33:44:55'
WHERE mac_address IS NULL;

-- Backfill search vectors
UPDATE public.olt_devices SET hostname = hostname;
UPDATE public.onu_mapping SET serial = serial;
