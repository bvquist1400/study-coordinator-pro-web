-- RLS for sites, site_members, and studies (defense in depth)
-- Goal: allow members to read site + membership data directly; restrict writes to owners.

-- Enable RLS (safe if already enabled)
ALTER TABLE IF EXISTS sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS site_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS studies ENABLE ROW LEVEL SECURITY;

-- Helpers: conditional policy creation
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'site_members' AND policyname = 'site_members_select_for_members'
  ) THEN
    CREATE POLICY site_members_select_for_members ON site_members
      FOR SELECT USING (
        site_id IN (
          SELECT site_id FROM site_members sm2 WHERE sm2.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'site_members' AND policyname = 'site_members_insert_by_owner'
  ) THEN
    CREATE POLICY site_members_insert_by_owner ON site_members
      FOR INSERT WITH CHECK (
        EXISTS (
          SELECT 1 FROM site_members owners
          WHERE owners.site_id = site_members.site_id
            AND owners.user_id = auth.uid()
            AND owners.role = 'owner'
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'site_members' AND policyname = 'site_members_update_by_owner'
  ) THEN
    CREATE POLICY site_members_update_by_owner ON site_members
      FOR UPDATE USING (
        EXISTS (
          SELECT 1 FROM site_members owners
          WHERE owners.site_id = site_members.site_id
            AND owners.user_id = auth.uid()
            AND owners.role = 'owner'
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'site_members' AND policyname = 'site_members_delete_by_owner'
  ) THEN
    CREATE POLICY site_members_delete_by_owner ON site_members
      FOR DELETE USING (
        EXISTS (
          SELECT 1 FROM site_members owners
          WHERE owners.site_id = site_members.site_id
            AND owners.user_id = auth.uid()
            AND owners.role = 'owner'
        )
      );
  END IF;
END $$;

-- Sites: allow members to see their sites; restrict writes (no direct insert/update/delete via client)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'sites' AND policyname = 'sites_select_for_members'
  ) THEN
    CREATE POLICY sites_select_for_members ON sites
      FOR SELECT USING (
        id IN (SELECT site_id FROM site_members WHERE user_id = auth.uid())
      );
  END IF;
END $$;

-- Studies: allow select if member of the owning site OR legacy ownership by user
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'studies' AND policyname = 'studies_select_for_members_or_owner'
  ) THEN
    CREATE POLICY studies_select_for_members_or_owner ON studies
      FOR SELECT USING (
        (site_id IS NOT NULL AND site_id IN (SELECT site_id FROM site_members WHERE user_id = auth.uid()))
        OR (site_id IS NULL AND user_id = auth.uid())
      );
  END IF;
END $$;

-- Note: Service role bypasses RLS automatically; server-side routes use service role.
