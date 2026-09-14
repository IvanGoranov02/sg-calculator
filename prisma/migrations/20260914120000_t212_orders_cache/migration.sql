-- AlterTable
ALTER TABLE "Trading212Connection" ADD COLUMN "ordersCache" JSONB,
ADD COLUMN "ordersCachedAt" TIMESTAMP(3),
ADD COLUMN "ordersCacheError" TEXT,
ADD COLUMN "ordersCachePartial" BOOLEAN NOT NULL DEFAULT false;
