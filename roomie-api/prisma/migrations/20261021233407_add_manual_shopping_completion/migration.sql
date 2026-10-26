-- AlterTable
ALTER TABLE "ContributionRequest" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'EUR';

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'EUR';
