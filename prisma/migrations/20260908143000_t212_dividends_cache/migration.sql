-- AlterTable
ALTER TABLE "Trading212Connection" ADD COLUMN "dividendsCache" JSONB;
ALTER TABLE "Trading212Connection" ADD COLUMN "dividendsCachedAt" TIMESTAMP(3);
ALTER TABLE "Trading212Connection" ADD COLUMN "dividendsCacheError" TEXT;
ALTER TABLE "Trading212Connection" ADD COLUMN "dividendsCachePartial" BOOLEAN NOT NULL DEFAULT false;
