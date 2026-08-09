-- AlterTable
ALTER TABLE "qr_codes" ADD COLUMN     "utm_enabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "org_settings" (
    "id" TEXT NOT NULL DEFAULT 'org',
    "company_name" VARCHAR(255),
    "country" VARCHAR(100),
    "time_zone" VARCHAR(100),
    "default_utm_source" VARCHAR(255),
    "default_utm_medium" VARCHAR(255),
    "default_utm_campaign" VARCHAR(255),
    "default_utm_term" VARCHAR(255),
    "default_utm_content" VARCHAR(255),
    "public_base_url" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_settings_pkey" PRIMARY KEY ("id")
);
