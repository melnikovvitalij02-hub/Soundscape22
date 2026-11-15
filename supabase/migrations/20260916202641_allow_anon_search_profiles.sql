-- Allow anon (guest) users to search and view registered profiles
CREATE POLICY "profiles_select_all_anon" ON profiles
  FOR SELECT TO anon USING (true);

-- Allow anon to view friendships (to see existing relationships)
CREATE POLICY "friendships_select_all_anon" ON friendships
  FOR SELECT TO anon USING (true);
