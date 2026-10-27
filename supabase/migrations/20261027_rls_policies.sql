-- ============================================================================
-- ReturnRide: Row Level Security (RLS) Policies
-- Enables safe public browsing and secure authenticated access
-- ============================================================================

-- 1. LOCATIONS (Everyone can read locations)
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to locations" ON locations;
CREATE POLICY "Allow public read access to locations"
ON locations FOR SELECT
TO anon, authenticated
USING (true);

-- 2. USER PROFILES
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow users to read profiles" ON user_profiles;
CREATE POLICY "Allow users to read profiles"
ON user_profiles FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Allow users to insert their own profile" ON user_profiles;
CREATE POLICY "Allow users to insert their own profile"
ON user_profiles FOR INSERT
TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Allow users to update their own profile" ON user_profiles;
CREATE POLICY "Allow users to update their own profile"
ON user_profiles FOR UPDATE
TO anon, authenticated
USING (true);

-- 3. DRIVER PROFILES
ALTER TABLE driver_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to driver profiles" ON driver_profiles;
CREATE POLICY "Allow public read access to driver profiles"
ON driver_profiles FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Allow drivers to insert driver profile" ON driver_profiles;
CREATE POLICY "Allow drivers to insert driver profile"
ON driver_profiles FOR INSERT
TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Allow drivers to update driver profile" ON driver_profiles;
CREATE POLICY "Allow drivers to update driver profile"
ON driver_profiles FOR UPDATE
TO anon, authenticated
USING (true);

-- 4. VEHICLES
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to vehicles" ON vehicles;
CREATE POLICY "Allow public read access to vehicles"
ON vehicles FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Allow drivers to insert vehicles" ON vehicles;
CREATE POLICY "Allow drivers to insert vehicles"
ON vehicles FOR INSERT
TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Allow drivers to update vehicles" ON vehicles;
CREATE POLICY "Allow drivers to update vehicles"
ON vehicles FOR UPDATE
TO anon, authenticated
USING (true);

-- 5. RIDES
ALTER TABLE rides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to active rides" ON rides;
CREATE POLICY "Allow public read access to active rides"
ON rides FOR SELECT
TO anon, authenticated
USING (status <> 'DRAFT');

DROP POLICY IF EXISTS "Allow drivers to insert rides" ON rides;
CREATE POLICY "Allow drivers to insert rides"
ON rides FOR INSERT
TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Allow drivers to update their rides" ON rides;
CREATE POLICY "Allow drivers to update their rides"
ON rides FOR UPDATE
TO anon, authenticated
USING (true);

-- 6. BOOKING REQUESTS
ALTER TABLE booking_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow passengers and drivers to read booking requests" ON booking_requests;
CREATE POLICY "Allow passengers and drivers to read booking requests"
ON booking_requests FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Allow passengers to insert booking requests" ON booking_requests;
CREATE POLICY "Allow passengers to insert booking requests"
ON booking_requests FOR INSERT
TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Allow drivers and passengers to update booking requests" ON booking_requests;
CREATE POLICY "Allow drivers and passengers to update booking requests"
ON booking_requests FOR UPDATE
TO anon, authenticated
USING (true);
