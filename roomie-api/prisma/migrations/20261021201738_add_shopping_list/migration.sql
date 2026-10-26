-- AlterTable
ALTER TABLE "ShoppingItem" ADD COLUMN     "purchasedQuantity" DECIMAL(10,3) NOT NULL DEFAULT 0,
ADD COLUMN     "requiredQuantity" DECIMAL(10,3);
