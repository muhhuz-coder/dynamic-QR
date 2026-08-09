-- DropForeignKey
ALTER TABLE "audit_log" DROP CONSTRAINT "audit_log_admin_id_fkey";

-- AlterTable
ALTER TABLE "audit_log" ALTER COLUMN "admin_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;
