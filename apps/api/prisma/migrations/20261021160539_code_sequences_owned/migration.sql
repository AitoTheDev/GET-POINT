-- Tie each code sequence to its column so TRUNCATE ... RESTART IDENTITY resets numbering
-- (used by the e2e tests) and the sequence is dropped together with the column.
ALTER SEQUENCE community_code_seq OWNED BY communities.code;
ALTER SEQUENCE location_code_seq OWNED BY locations.code;
ALTER SEQUENCE shop_code_seq OWNED BY shops.code;
