-- CreateTable
CREATE TABLE "ShoppingItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" TEXT NOT NULL DEFAULT '1',
    "isPurchased" BOOLEAN NOT NULL DEFAULT false,
    "apartmentId" TEXT NOT NULL,
    "addedById" TEXT NOT NULL,
    "matchedReceiptItemId" TEXT,
    "purchasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShoppingItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShoppingItem_apartmentId_isPurchased_idx" ON "ShoppingItem"("apartmentId", "isPurchased");

-- CreateIndex
CREATE INDEX "ShoppingItem_addedById_idx" ON "ShoppingItem"("addedById");

-- AddForeignKey
ALTER TABLE "ShoppingItem" ADD CONSTRAINT "ShoppingItem_apartmentId_fkey" FOREIGN KEY ("apartmentId") REFERENCES "Apartment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingItem" ADD CONSTRAINT "ShoppingItem_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
