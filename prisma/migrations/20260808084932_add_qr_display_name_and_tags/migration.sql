-- AlterTable
ALTER TABLE "qr_codes" ADD COLUMN     "display_name" VARCHAR(255),
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
