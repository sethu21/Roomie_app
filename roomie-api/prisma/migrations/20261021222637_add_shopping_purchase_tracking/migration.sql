-- CreateTable
CREATE TABLE "ShoppingPurchase" (
    "id" TEXT NOT NULL,
    "shoppingItemId" TEXT NOT NULL,
    "receiptItemId" TEXT NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShoppingPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShoppingPurchase_receiptItemId_idx" ON "ShoppingPurchase"("receiptItemId");

-- CreateIndex
CREATE UNIQUE INDEX "ShoppingPurchase_shoppingItemId_receiptItemId_key" ON "ShoppingPurchase"("shoppingItemId", "receiptItemId");

-- AddForeignKey
ALTER TABLE "ShoppingPurchase" ADD CONSTRAINT "ShoppingPurchase_shoppingItemId_fkey" FOREIGN KEY ("shoppingItemId") REFERENCES "ShoppingItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingPurchase" ADD CONSTRAINT "ShoppingPurchase_receiptItemId_fkey" FOREIGN KEY ("receiptItemId") REFERENCES "ReceiptItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
