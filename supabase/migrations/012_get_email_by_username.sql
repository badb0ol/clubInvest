-- Function to look up email by username (full_name), bypasses RLS
-- Used for login-by-username before the user is authenticated
CREATE OR REPLACE FUNCTION get_email_by_username(p_username TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT email FROM profiles WHERE lower(full_name) = lower(trim(p_username)) LIMIT 1;
$$;

-- Allow anonymous users to call this function
GRANT EXECUTE ON FUNCTION get_email_by_username(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_email_by_username(TEXT) TO authenticated;
