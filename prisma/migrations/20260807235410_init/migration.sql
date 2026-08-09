-- CreateEnum
CREATE TYPE "product_type" AS ENUM ('STAND', 'COIN', 'CARD');

-- CreateEnum
CREATE TYPE "scan_method" AS ENUM ('NFC_TAP', 'QR_SCAN');

-- CreateEnum
CREATE TYPE "device_type" AS ENUM ('MOBILE', 'DESKTOP', 'TABLET');

-- CreateTable
CREATE TABLE "admins" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" VARCHAR(50) NOT NULL DEFAULT 'admin',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qr_codes" (
    "id" UUID NOT NULL,
    "qr_name" VARCHAR(50) NOT NULL,
    "short_code" VARCHAR(20) NOT NULL,
    "qr_image_url" TEXT,
    "target_url" TEXT NOT NULL,
    "target_url_updated_at" TIMESTAMP(3),
    "product_type" "product_type",
    "batch_id" VARCHAR(50),
    "batch_name" VARCHAR(255),
    "total_scan_count" INTEGER NOT NULL DEFAULT 0,
    "last_scanned_at" TIMESTAMP(3),
    "last_scanned_location" VARCHAR(100),
    "last_scanned_by_device" "device_type",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qr_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qr_scan_events" (
    "id" UUID NOT NULL,
    "qr_id" UUID NOT NULL,
    "short_code" VARCHAR(20),
    "scan_timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scan_method" "scan_method",
    "device_type" "device_type",
    "device_os" VARCHAR(50),
    "browser" VARCHAR(100),
    "user_agent" TEXT,
    "ip_address" VARCHAR(45),
    "location_city" VARCHAR(100),
    "location_country" VARCHAR(100),
    "location_latitude" DECIMAL(10,8),
    "location_longitude" DECIMAL(11,8),
    "target_url_at_scan" TEXT,

    CONSTRAINT "qr_scan_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "admin_id" UUID NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "resource_type" VARCHAR(50) NOT NULL,
    "resource_id" UUID NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admins_email_key" ON "admins"("email");

-- CreateIndex
CREATE UNIQUE INDEX "qr_codes_qr_name_key" ON "qr_codes"("qr_name");

-- CreateIndex
CREATE UNIQUE INDEX "qr_codes_short_code_key" ON "qr_codes"("short_code");

-- CreateIndex
CREATE INDEX "qr_codes_batch_id_idx" ON "qr_codes"("batch_id");

-- CreateIndex
CREATE INDEX "qr_scan_events_qr_id_idx" ON "qr_scan_events"("qr_id");

-- CreateIndex
CREATE INDEX "qr_scan_events_scan_timestamp_idx" ON "qr_scan_events"("scan_timestamp");

-- CreateIndex
CREATE INDEX "audit_log_resource_type_resource_id_idx" ON "audit_log"("resource_type", "resource_id");

-- AddForeignKey
ALTER TABLE "qr_scan_events" ADD CONSTRAINT "qr_scan_events_qr_id_fkey" FOREIGN KEY ("qr_id") REFERENCES "qr_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
