-- CreateEnum
CREATE TYPE "ReceiptStatus" AS ENUM ('OPEN', 'FINALIZED');

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "store" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "total" DECIMAL(10,2) NOT NULL,
    "status" "ReceiptStatus" NOT NULL DEFAULT 'OPEN',
    "apartmentId" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "expenseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceiptItem" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "totalPrice" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReceiptItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceiptClaim" (
    "id" TEXT NOT NULL,
    "receiptItemId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReceiptClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_expenseId_key" ON "Receipt"("expenseId");

-- CreateIndex
CREATE INDEX "Receipt_apartmentId_status_idx" ON "Receipt"("apartmentId", "status");

-- CreateIndex
CREATE INDEX "Receipt_uploaderId_idx" ON "Receipt"("uploaderId");

-- CreateIndex
CREATE INDEX "ReceiptItem_receiptId_idx" ON "ReceiptItem"("receiptId");

-- CreateIndex
CREATE INDEX "ReceiptClaim_memberId_idx" ON "ReceiptClaim"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "ReceiptClaim_receiptItemId_memberId_key" ON "ReceiptClaim"("receiptItemId", "memberId");

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_apartmentId_fkey" FOREIGN KEY ("apartmentId") REFERENCES "Apartment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptItem" ADD CONSTRAINT "ReceiptItem_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptClaim" ADD CONSTRAINT "ReceiptClaim_receiptItemId_fkey" FOREIGN KEY ("receiptItemId") REFERENCES "ReceiptItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptClaim" ADD CONSTRAINT "ReceiptClaim_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
