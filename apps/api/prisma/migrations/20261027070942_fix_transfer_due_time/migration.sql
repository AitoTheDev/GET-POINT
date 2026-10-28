-- The previous migration set "due now" with CURRENT_TIMESTAMP. On a database whose time zone
-- isn't UTC (e.g. Asia/Bangkok) that stores local time in this UTC column, i.e. hours in the
-- future. Waiting transfers never tried yet are due now (in UTC, as the app stores times).
UPDATE "point_transactions"
SET "next_attempt_at" = (now() AT TIME ZONE 'UTC')
WHERE "transfer_status" = 'PENDING'
  AND "attempts" = 0
  AND "next_attempt_at" > (now() AT TIME ZONE 'UTC');
