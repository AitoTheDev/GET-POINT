-- Session 7: Staff and Community Manager can open the Activity Log ("view" shows only their
-- own actions; "manage", which Admin has, shows everyone's). Applies to the seeded system roles.
INSERT INTO "role_permissions" ("role_id", "menu", "can_view", "can_manage")
SELECT "id", 'ACTIVITY_LOG', true, false FROM "roles" WHERE "key" IN ('STAFF', 'COMMUNITY_MANAGER')
ON CONFLICT ("role_id", "menu") DO UPDATE SET "can_view" = true;
