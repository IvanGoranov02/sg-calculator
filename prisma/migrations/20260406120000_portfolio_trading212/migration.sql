-- CreateEnum
CREATE TYPE "Trading212Environment" AS ENUM ('demo', 'live');

-- CreateEnum
CREATE TYPE "PortfolioHoldingSource" AS ENUM ('manual', 't212');

-- CreateTable
CREATE TABLE "Trading212Connection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "environment" "Trading212Environment" NOT NULL DEFAULT 'demo',
    "apiKeyEnc" TEXT NOT NULL,
    "apiSecretEnc" TEXT NOT NULL,
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trading212Connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioHolding" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "symbolYahoo" TEXT NOT NULL,
    "symbolT212" TEXT,
    "quantity" DECIMAL(20,8) NOT NULL,
    "avgPrice" DECIMAL(20,8) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "source" "PortfolioHoldingSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioHolding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Trading212Connection_userId_key" ON "Trading212Connection"("userId");

-- CreateIndex
CREATE INDEX "PortfolioHolding_userId_idx" ON "PortfolioHolding"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioHolding_userId_symbolYahoo_source_key" ON "PortfolioHolding"("userId", "symbolYahoo", "source");

-- AddForeignKey
ALTER TABLE "Trading212Connection" ADD CONSTRAINT "Trading212Connection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioHolding" ADD CONSTRAINT "PortfolioHolding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
