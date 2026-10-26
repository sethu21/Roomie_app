-- CreateEnum
CREATE TYPE "ExpenseSplitType" AS ENUM ('EQUAL', 'CUSTOM');

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "splitType" "ExpenseSplitType" NOT NULL DEFAULT 'EQUAL',
    "apartmentId" TEXT NOT NULL,
    "paidById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseShare" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContributionRequest" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "targetAmount" DECIMAL(10,2) NOT NULL,
    "apartmentId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContributionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contribution" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contribution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Expense_apartmentId_createdAt_idx" ON "Expense"("apartmentId", "createdAt");

-- CreateIndex
CREATE INDEX "Expense_paidById_idx" ON "Expense"("paidById");

-- CreateIndex
CREATE INDEX "ExpenseShare_memberId_idx" ON "ExpenseShare"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseShare_expenseId_memberId_key" ON "ExpenseShare"("expenseId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "ContributionRequest_expenseId_key" ON "ContributionRequest"("expenseId");

-- CreateIndex
CREATE INDEX "ContributionRequest_apartmentId_createdAt_idx" ON "ContributionRequest"("apartmentId", "createdAt");

-- CreateIndex
CREATE INDEX "Contribution_requestId_idx" ON "Contribution"("requestId");

-- CreateIndex
CREATE INDEX "Contribution_memberId_idx" ON "Contribution"("memberId");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_apartmentId_fkey" FOREIGN KEY ("apartmentId") REFERENCES "Apartment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseShare" ADD CONSTRAINT "ExpenseShare_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseShare" ADD CONSTRAINT "ExpenseShare_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionRequest" ADD CONSTRAINT "ContributionRequest_apartmentId_fkey" FOREIGN KEY ("apartmentId") REFERENCES "Apartment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionRequest" ADD CONSTRAINT "ContributionRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionRequest" ADD CONSTRAINT "ContributionRequest_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contribution" ADD CONSTRAINT "Contribution_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ContributionRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contribution" ADD CONSTRAINT "Contribution_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
