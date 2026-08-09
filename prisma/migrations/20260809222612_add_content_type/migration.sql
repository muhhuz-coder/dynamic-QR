-- CreateEnum
CREATE TYPE "content_type" AS ENUM ('URL', 'TEXT', 'VCARD', 'WIFI');

-- AlterTable
ALTER TABLE "qr_codes" ADD COLUMN     "content_payload" JSONB,
ADD COLUMN     "content_type" "content_type" NOT NULL DEFAULT 'URL';
