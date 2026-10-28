-- Member codes use 4 digits (M0001), so add a variant of gp_next_code() with a minimum width.
CREATE FUNCTION gp_next_code(prefix text, seq regclass, width int) RETURNS text
  LANGUAGE sql VOLATILE AS $$
    SELECT prefix || lpad(n::text, greatest(width, length(n::text)), '0')
    FROM (SELECT nextval(seq) AS n) AS next
  $$;

CREATE SEQUENCE member_code_seq;

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "MemberChannel" AS ENUM ('CMS', 'LINE');

-- CreateEnum
CREATE TYPE "LogaLinkStatus" AS ENUM ('NOT_LINKED', 'LINKED', 'ERROR');

-- CreateTable
CREATE TABLE "members" (
    "id" UUID NOT NULL,
    "community_id" UUID NOT NULL,
    "code" TEXT NOT NULL DEFAULT gp_next_code('M'::text, 'member_code_seq'::regclass, 4),
    "phone" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT,
    "status" "MemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "channel" "MemberChannel" NOT NULL DEFAULT 'CMS',
    "line_user_id" TEXT,
    "note" TEXT,
    "created_by_id" UUID,
    "loga_uid" TEXT,
    "loga_pcard_id" TEXT,
    "loga_link_status" "LogaLinkStatus" NOT NULL DEFAULT 'NOT_LINKED',
    "loga_link_error" TEXT,
    "loga_checked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "members_code_key" ON "members"("code");

-- CreateIndex
CREATE UNIQUE INDEX "members_line_user_id_key" ON "members"("line_user_id");

-- CreateIndex
CREATE INDEX "members_created_at_idx" ON "members"("created_at");

-- CreateIndex
CREATE INDEX "members_status_idx" ON "members"("status");

-- CreateIndex
CREATE UNIQUE INDEX "members_community_id_phone_key" ON "members"("community_id", "phone");

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Tie the code sequence to its column (TRUNCATE ... RESTART IDENTITY resets it in tests).
ALTER SEQUENCE member_code_seq OWNED BY members.code;
