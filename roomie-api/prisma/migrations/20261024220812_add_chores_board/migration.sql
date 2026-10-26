-- CreateEnum
CREATE TYPE "ChoreFrequency" AS ENUM ('ONCE', 'DAILY', 'WEEKLY');

-- CreateEnum
CREATE TYPE "BoardNoteType" AS ENUM ('NOTICE', 'REMINDER', 'QUESTION');

-- CreateTable
CREATE TABLE "Chore" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "frequency" "ChoreFrequency" NOT NULL DEFAULT 'ONCE',
    "dueAt" TIMESTAMP(3),
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "apartmentId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "assignedToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Chore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoardNote" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "type" "BoardNoteType" NOT NULL DEFAULT 'REMINDER',
    "apartmentId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoardNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Chore_apartmentId_isCompleted_idx" ON "Chore"("apartmentId", "isCompleted");

-- CreateIndex
CREATE INDEX "Chore_assignedToId_idx" ON "Chore"("assignedToId");

-- CreateIndex
CREATE INDEX "BoardNote_apartmentId_createdAt_idx" ON "BoardNote"("apartmentId", "createdAt");

-- AddForeignKey
ALTER TABLE "Chore" ADD CONSTRAINT "Chore_apartmentId_fkey" FOREIGN KEY ("apartmentId") REFERENCES "Apartment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chore" ADD CONSTRAINT "Chore_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chore" ADD CONSTRAINT "Chore_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardNote" ADD CONSTRAINT "BoardNote_apartmentId_fkey" FOREIGN KEY ("apartmentId") REFERENCES "Apartment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardNote" ADD CONSTRAINT "BoardNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
