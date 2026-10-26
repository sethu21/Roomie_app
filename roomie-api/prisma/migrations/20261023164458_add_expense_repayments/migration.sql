-- CreateTable
CREATE TABLE "ExpenseRepayment" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "fromMemberId" TEXT NOT NULL,
    "toMemberId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseRepayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExpenseRepayment_expenseId_fromMemberId_idx" ON "ExpenseRepayment"("expenseId", "fromMemberId");

-- CreateIndex
CREATE INDEX "ExpenseRepayment_toMemberId_idx" ON "ExpenseRepayment"("toMemberId");

-- AddForeignKey
ALTER TABLE "ExpenseRepayment" ADD CONSTRAINT "ExpenseRepayment_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseRepayment" ADD CONSTRAINT "ExpenseRepayment_fromMemberId_fkey" FOREIGN KEY ("fromMemberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseRepayment" ADD CONSTRAINT "ExpenseRepayment_toMemberId_fkey" FOREIGN KEY ("toMemberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
