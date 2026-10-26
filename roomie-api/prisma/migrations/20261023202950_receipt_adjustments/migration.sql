-- CreateEnum
CREATE TYPE "ReceiptAdjustmentType" AS ENUM ('DISCOUNT', 'REFUND', 'DEPOSIT', 'CHARGE', 'TAX_ADJUSTMENT', 'OTHER');

-- CreateTable
CREATE TABLE "ReceiptAdjustment" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" "ReceiptAdjustmentType" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "alreadyIncluded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReceiptAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReceiptAdjustment_receiptId_idx" ON "ReceiptAdjustment"("receiptId");

-- AddForeignKey
ALTER TABLE "ReceiptAdjustment" ADD CONSTRAINT "ReceiptAdjustment_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
