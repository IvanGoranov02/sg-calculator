-- CreateTable
CREATE TABLE "PortfolioAccountSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "totalValue" DECIMAL(20,8) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortfolioAccountSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualPortfolioMonthlyValue" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "amount" DECIMAL(20,8) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManualPortfolioMonthlyValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PortfolioAccountSnapshot_userId_capturedAt_idx" ON "PortfolioAccountSnapshot"("userId", "capturedAt");

-- CreateIndex
CREATE INDEX "ManualPortfolioMonthlyValue_userId_idx" ON "ManualPortfolioMonthlyValue"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ManualPortfolioMonthlyValue_userId_month_key" ON "ManualPortfolioMonthlyValue"("userId", "month");

-- AddForeignKey
ALTER TABLE "PortfolioAccountSnapshot" ADD CONSTRAINT "PortfolioAccountSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualPortfolioMonthlyValue" ADD CONSTRAINT "ManualPortfolioMonthlyValue_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
