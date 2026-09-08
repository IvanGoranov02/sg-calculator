-- CreateTable
CREATE TABLE "ManualPortfolioDividend" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "symbolYahoo" TEXT,
    "ticker" TEXT NOT NULL,
    "amount" DECIMAL(20,8) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "paidOn" DATE NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManualPortfolioDividend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ManualPortfolioDividend_userId_paidOn_idx" ON "ManualPortfolioDividend"("userId", "paidOn");

-- AddForeignKey
ALTER TABLE "ManualPortfolioDividend" ADD CONSTRAINT "ManualPortfolioDividend_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
