-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('REPAYMENT_REQUEST', 'REPAYMENT_CONFIRMED', 'REPAYMENT_REJECTED', 'EXPENSE_ADDED', 'SHOPPING_UPDATED', 'CHORE_ASSIGNED');

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "apartmentId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "targetScreen" TEXT,
    "targetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_recipientId_isRead_createdAt_idx" ON "Notification"("recipientId", "isRead", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_apartmentId_createdAt_idx" ON "Notification"("apartmentId", "createdAt");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_apartmentId_fkey" FOREIGN KEY ("apartmentId") REFERENCES "Apartment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
