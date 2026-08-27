-- Assign admin role to your user
UPDATE profiles
SET roles = ARRAY['admin']::user_role[]
-- Replace with YOUR auth.users id:
WHERE id = 'YOUR_USER_ID_HERE';