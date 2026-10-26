import { Ionicons } from '@expo/vector-icons';
import {
  useFocusEffect,
  useRouter,
} from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApartment } from '../../context/ApartmentContext';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://10.106.217.165:3000';
type Currency = 'EUR' | 'CZK';

function normalizeCurrency(value: unknown): Currency | null {
  const raw = String(value ?? '').trim().toUpperCase();
  if (['EUR', '€', 'EURO', 'EUROS'].includes(raw)) return 'EUR';
  if (['CZK', 'KČ', 'KČ.', 'KC', 'CZ', 'CZECH KORUNA'].includes(raw)) return 'CZK';
  return null;
}

function formatMoney(amount: number | string, currency: Currency) {
  const value = Number(amount);
  return currency === 'EUR' ? `€${value.toFixed(2)}` : `${value.toFixed(2)} Kč`;
}

type Member = {
  id: string;
  name: string;
};

type Share = {
  id: string;
  memberId: string;
  amount: number;
  member: Member;
};

type Contribution = {
  id: string;
  memberId: string;
  amount: number;
  member: Member;
};

type ContributionRequest = {
  currency?: string;
  id: string;
  title: string;
  targetAmount: number;
  contributedAmount: number;
  remainingAmount: number;
  createdBy: Member;
  contributions: Contribution[];
};

type Expense = {
  currency?: string;
  id: string;
  title: string;
  amount: number;
  splitType: 'EQUAL' | 'CUSTOM';
  paidBy: Member;
  shares: Share[];
  createdAt: string;
};

type ReceiptClaim = {
  id: string;
  memberId: string;
  member: Member;
};

type ReceiptItem = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  claims: ReceiptClaim[];
};

type Receipt = {
  id: string;
  store: string | null;
  currency: string;
  total: number;
  status: string;
  createdAt: string;
  uploader: Member;
  items: ReceiptItem[];
};

type MoneyData = {
  apartment: {
    id: string;
    name: string;
    code: string;
  };
  members: Member[];
  expenses: Expense[];
  contributionRequests: ContributionRequest[];
  receipts: Receipt[];
};

type Repayment = {
  id: string;
  status: 'PENDING' | 'CONFIRMED' | 'REJECTED';
  amount: number;
  createdAt: string;
  fromMember: Member;
  toMember: Member;
};

type Debt = {
  expenseId: string;
  expenseTitle: string;
  currency: string;
  createdAt: string;
  fromMember: Member;
  toMember: Member;
  originalAmount: number;
  repaidAmount: number;
  pendingAmount: number;
  remainingAmount: number;
  repayments: Repayment[];
};

type SplitType = 'EQUAL' | 'CUSTOM';

export default function MoneyScreen() {
  const moneyScrollRef = useRef<ScrollView>(null);
  const transactionsY = useRef(0);

  function openDebts() {
    setMoneyWorkspace('debts');
    setActiveTab('debts');
    requestAnimationFrame(() => {
      moneyScrollRef.current?.scrollTo({
        y: Math.max(0, transactionsY.current - 12),
        animated: true,
      });
    });
  }


  const [selectedSettlement, setSelectedSettlement] = useState<string | null>(null);
  const [moneyWorkspace, setMoneyWorkspace] = useState<'expenses' | 'debts' | 'contributions' | 'insights' | null>(null);
  const [activeSpendingView, setActiveSpendingView] =
    useState<'chart' | 'calendar' | null>(null);
  const router = useRouter();

  const { session, loading: sessionLoading } = useApartment();

  const code = session?.code ?? '';
  const apartmentName = session?.apartmentName ?? '';
  const memberId = session?.memberId ?? '';
  const memberName = session?.memberName ?? '';



  const [data, setData] = useState<MoneyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState<Currency>('EUR');
  const [showSpendingDetails, setShowSpendingDetails] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );

  const [selectedSpendingDate, setSelectedSpendingDate] = useState<string | null>(null);

  const [showAllExpenses, setShowAllExpenses] = useState(false);

  const [expandedExpenseId, setExpandedExpenseId] = useState<string | null>(null);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [debtLoading, setDebtLoading] = useState(false);
  const [repaymentInputs, setRepaymentInputs] = useState<Record<string, string>>({});

  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showContributionForm, setShowContributionForm] = useState(false);

  const [expenseTitle, setExpenseTitle] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [paidById, setPaidById] = useState('');
  const [splitType, setSplitType] = useState<SplitType>('EQUAL');
  const [customShares, setCustomShares] = useState<Record<string, string>>(
    {},
  );

  const [requestTitle, setRequestTitle] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [contributionInputs, setContributionInputs] = useState<
    Record<string, string>
  >({});

  const [activeTab, setActiveTab] = useState<'expenses' | 'contributions' | 'debts'>(
    'expenses',
  );


  const loadMoney = useCallback(async (showSpinner = true) => {
    // Wait until the apartment session is available
    if (!code || !memberId) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (showSpinner) setLoading(true);

    try {
      const response = await fetch(
        `${API_URL}/api/apartments/${encodeURIComponent(code)}/money`,
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Could not load apartment finances.');
      }

      setData(result);

      // Keep debts in sync whenever the dashboard refreshes.
      setDebtLoading(true);
      try {
        const debtResponse = await fetch(
          `${API_URL}/api/apartments/${encodeURIComponent(code)}/debts?memberId=${encodeURIComponent(memberId)}`,
        );
        const debtResult = await debtResponse.json();
        if (!debtResponse.ok) {
          throw new Error(debtResult.error || 'Could not load debts.');
        }
        setDebts(Array.isArray(debtResult.debts) ? debtResult.debts : []);
      } catch (debtError) {
        console.warn('Could not refresh debts:', debtError);
        setDebts([]);
      } finally {
        setDebtLoading(false);
      }

      if (result.members?.length && !paidById) {
        setPaidById(memberId || result.members[0].id);
      }
    } catch (error) {
      Alert.alert(
        'Could not load Money',
        error instanceof Error
          ? error.message
          : 'Check your connection and try again.',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [code, memberId, paidById]);


  useFocusEffect(
    useCallback(() => {
      if (!sessionLoading && code && memberId) {
        loadMoney();
      }
    }, [sessionLoading, code, memberId, loadMoney])
  );

  function updateCustomShare(id: string, value: string) {
    setCustomShares((previous) => ({ ...previous, [id]: value }));
  }

  async function submitExpense() {
    if (!data) return;

    if (!expenseTitle.trim() || !expenseAmount.trim() || !paidById) {
      Alert.alert('Missing information', 'Enter a title, amount and payer.');
      return;
    }

    const amount = Number(expenseAmount.replace(',', '.'));

    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Invalid amount', 'Enter a valid amount greater than zero.');
      return;
    }

    let shares: { memberId: string; amount: number }[] | undefined;

    if (splitType === 'CUSTOM') {
      shares = data.members.map((member) => ({
        memberId: member.id,
        amount: Number((customShares[member.id] || '0').replace(',', '.')),
      }));

      if (
        shares.some(
          (share) => !Number.isFinite(share.amount) || share.amount < 0,
        )
      ) {
        Alert.alert('Invalid shares', 'Enter a valid amount for each roommate.');
        return;
      }

      const sharesTotal = shares.reduce((sum, share) => sum + share.amount, 0);

      if (Math.round(sharesTotal * 100) !== Math.round(amount * 100)) {
        Alert.alert(
          'Amounts do not match',
          `The roommate shares total ${formatMoney(sharesTotal, selectedCurrency)}, but the expense is ${formatMoney(amount, selectedCurrency)}.`,
        );
        return;
      }
    }

    setSaving(true);

    try {
      const response = await fetch(
        `${API_URL}/api/apartments/${encodeURIComponent(code)}/expenses`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: expenseTitle.trim(),
            amount,
            paidById,
            currency: selectedCurrency,
            splitType,
            ...(splitType === 'CUSTOM' ? { customShares: shares } : {}),
          }),
        },
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Could not add expense.');
      }

      setExpenseTitle('');
      setExpenseAmount('');
      setCustomShares({});
      setSplitType('EQUAL');
      setShowExpenseForm(false);

      await loadMoney(false);
      Alert.alert('Expense added', 'Your expense was saved successfully.');
    } catch (error) {
      Alert.alert(
        'Could not add expense',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setSaving(false);
    }
  }


  async function deleteReceipt(receiptId: string) {
    Alert.alert(
      'Delete receipt?',
      'This will permanently delete the receipt, its products, and all roommate claims. This cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);

            try {
              const response = await fetch(
                `${API_URL}/api/receipts/${encodeURIComponent(receiptId)}`,
                {
                  method: 'DELETE',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    apartmentCode: code,
                    memberId,
                  }),
                },
              );

              const result = await response.json();

              if (!response.ok) {
                throw new Error(
                  result.error || 'Could not delete receipt.',
                );
              }

              await loadMoney(false);

              Alert.alert(
                'Receipt deleted',
                'The receipt and its claims have been removed.',
              );
            } catch (error) {
              Alert.alert(
                'Could not delete receipt',
                error instanceof Error
                  ? error.message
                  : 'Please try again.',
              );
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  }


  async function submitContributionRequest() {
    if (!requestTitle.trim() || !targetAmount.trim()) {
      Alert.alert('Missing information', 'Enter a title and target amount.');
      return;
    }

    const amount = Number(targetAmount.replace(',', '.'));

    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Invalid amount', 'Enter a valid target amount.');
      return;
    }

    setSaving(true);

    try {
      const response = await fetch(
        `${API_URL}/api/apartments/${encodeURIComponent(code)}/contribution-requests`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: requestTitle.trim(),
            targetAmount: amount,
            createdById: memberId,
            currency: selectedCurrency,
          }),
        },
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Could not create contribution request.');
      }

      setRequestTitle('');
      setTargetAmount('');
      setShowContributionForm(false);

      await loadMoney(false);
      Alert.alert('Request created', 'Your contribution target is ready.');
    } catch (error) {
      Alert.alert(
        'Could not create request',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function submitContribution(requestId: string) {
    const amountText = contributionInputs[requestId]?.trim();

    if (!amountText) {
      Alert.alert('Enter amount', 'Enter how much you want to contribute.');
      return;
    }

    const amount = Number(amountText.replace(',', '.'));

    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Invalid amount', 'Enter a valid positive amount.');
      return;
    }

    setSaving(true);

    try {
      const response = await fetch(
        `${API_URL}/api/apartments/${encodeURIComponent(code)}/contribution-requests/${encodeURIComponent(requestId)}/contributions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ memberId, amount }),
        },
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Could not record contribution.');
      }

      setContributionInputs((previous) => ({
        ...previous,
        [requestId]: '',
      }));

      await loadMoney(false);
      Alert.alert('Contribution saved', 'Your contribution was recorded.');
    } catch (error) {
      Alert.alert(
        'Could not record contribution',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function submitRepayment(debt: Debt) {
    if (debt.fromMember.id !== memberId) {
      Alert.alert('Not your debt', 'Only the roommate who owes this expense can record a repayment.');
      return;
    }
    const key = `${debt.expenseId}:${debt.fromMember.id}`;
    const raw = (repaymentInputs[key] ?? '').trim().replace(',', '.');
    if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
      Alert.alert('Invalid amount', 'Enter a repayment with up to two decimal places.');
      return;
    }
    const cents = Math.round(Number(raw) * 100);
    const availableAmount =
      Number(debt.remainingAmount) - Number(debt.pendingAmount);

    const remainingCents = Math.round(availableAmount * 100);
    if (!Number.isSafeInteger(cents) || cents <= 0 || cents > remainingCents) {
      Alert.alert('Invalid repayment amount', `Enter an amount greater than zero and no more than ${formatMoney(Math.max(0, availableAmount), selectedCurrency)}.`);
      return;
    }

    Alert.alert(
      'Confirm repayment',
      `Have you already paid ${formatMoney(cents / 100, selectedCurrency)} to ${debt.toMember.name} for ${debt.expenseTitle}? This records a payment; it does not send money.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Record payment',
          onPress: async () => {
            setSaving(true);
            try {
              const response = await fetch(
                `${API_URL}/api/apartments/${encodeURIComponent(code)}/expenses/${encodeURIComponent(debt.expenseId)}/repayments`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ memberId, fromMemberId: memberId, amount: cents / 100 }),
                },
              );
              const result = await response.json();
              if (!response.ok) throw new Error(result.error || 'Could not record payment.');
              setRepaymentInputs((previous) => ({ ...previous, [key]: '' }));
              await loadMoney(false);
              Alert.alert('Awaiting confirmation', 'Your repayment request was sent to the original payer.');
            } catch (error) {
              Alert.alert('Payment not recorded', error instanceof Error ? error.message : 'Please try again.');
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  }


  async function decideRepayment(
    repaymentId: string,
    decision: 'CONFIRMED' | 'REJECTED'
  ) {
    Alert.alert(
      decision === 'CONFIRMED'
        ? 'Confirm receipt?'
        : 'Reject payment?',
      decision === 'CONFIRMED'
        ? 'Confirm only if you actually received this money.'
        : 'Reject this payment request? The roommate can submit it again.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: decision === 'CONFIRMED'
            ? 'Confirm received'
            : 'Reject',
          onPress: async () => {
            setSaving(true);

            try {
              const response = await fetch(
                `${API_URL}/api/apartments/${encodeURIComponent(code)}/repayments/${encodeURIComponent(repaymentId)}/decision`,
                {
                  method: 'PATCH',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    memberId,
                    decision,
                  }),
                }
              );

              const result = await response.json();

              if (!response.ok) {
                throw new Error(
                  result.error || 'Could not update repayment.'
                );
              }

              await loadMoney(false);

              Alert.alert(
                'Updated',
                decision === 'CONFIRMED'
                  ? 'Payment confirmed. The debt has been updated.'
                  : 'Payment rejected. The debt remains unchanged.'
              );
            } catch (error) {
              Alert.alert(
                'Unable to update',
                error instanceof Error
                  ? error.message
                  : 'Please try again.'
              );
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  }


  const visibleDebts = debts.filter(
    (debt) => normalizeCurrency(debt.currency) === selectedCurrency,
  );
  const myDebts = visibleDebts.filter((debt) => debt.fromMember.id === memberId);
  const owedToMe = visibleDebts
    .filter((debt) => debt.toMember.id === memberId)
    .sort((a, b) => {
      // Check whether each debt has a pending repayment.
      const aPending = a.repayments.some(
        (payment) => payment.status === 'PENDING'
      );

      const bPending = b.repayments.some(
        (payment) => payment.status === 'PENDING'
      );

      // Pending confirmation requests always appear first.
      if (aPending !== bPending) {
        return aPending ? -1 : 1;
      }

      // Otherwise, show newer expenses first.
      return (
        new Date(b.createdAt).getTime() -
        new Date(a.createdAt).getTime()
      );
    });
  const pendingRepayments = debts.flatMap((debt) =>
    debt.toMember.id === memberId
      ? debt.repayments
        .filter((payment) => payment.status === 'PENDING')
        .map((payment) => ({
          ...payment,
          expenseTitle: debt.expenseTitle,
          currency: normalizeCurrency(debt.currency) ?? 'EUR',
        }))
      : []
  );

  const pendingCount = pendingRepayments.length;
  const paymentActivity = debts
    .flatMap((debt) =>
      debt.repayments
        .filter(
          (payment) =>
            payment.fromMember.id === memberId ||
            payment.toMember.id === memberId
        )
        .map((payment) => ({
          ...payment,
          expenseTitle: debt.expenseTitle,
          currency: normalizeCurrency(debt.currency) ?? 'EUR',
          isSender: payment.fromMember.id === memberId,
        }))
    )
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() -
        new Date(a.createdAt).getTime()
    );
  // Group outstanding debts by roommate while preserving individual expenses.
  const debtsByRoommate = myDebts.reduce<Record<string, { member: Member; debts: Debt[]; total: number }>>(
    (groups, debt) => {
      const id = debt.toMember.id;
      if (!groups[id]) groups[id] = { member: debt.toMember, debts: [], total: 0 };
      groups[id].debts.push(debt);
      groups[id].total += Number(debt.remainingAmount);
      return groups;
    },
    {},
  );
  const roommateDebtGroups = Object.values(debtsByRoommate).sort((a, b) => b.total - a.total);

  const totalIOwe = myDebts.reduce((sum, debt) => sum + Number(debt.remainingAmount), 0);
  const totalOwedToMe = owedToMe.reduce((sum, debt) => sum + Number(debt.remainingAmount), 0);

  // Only expenses are included in spending totals. A finalized receipt
  // already creates an expense, so adding receipt totals would double-count it.
  const visibleExpenses = (data?.expenses ?? []).filter(
    (expense) =>
      normalizeCurrency(expense.currency ?? 'EUR') === selectedCurrency &&
      expense.shares.length > 0,
  );
  const visibleReceipts = (data?.receipts ?? []).filter(
    (receipt) => normalizeCurrency(receipt.currency) === selectedCurrency,
  );
  const visibleRequests = (data?.contributionRequests ?? []).filter(
    (request) => normalizeCurrency(request.currency ?? 'EUR') === selectedCurrency,
  );
  const roommateSpending = (data?.members ?? []).map((member) => {
    const amountPaid = visibleExpenses
      .filter((expense) => expense.paidBy?.id === member.id)
      .reduce((sum, expense) => sum + Number(expense.amount), 0);

    const personalShare = visibleExpenses.reduce((sum, expense) => {
      const share = expense.shares.find(
        (item) => item.memberId === member.id
      );

      return sum + Number(share?.amount ?? 0);
    }, 0);

    return {
      ...member,
      amountPaid,
      personalShare,
    };
  });

  const peopleWhoOweMe = owedToMe.filter(
    (debt) => Number(debt.remainingAmount) > 0
  );
  const dateKey = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

  const sortedExpenses = [...visibleExpenses].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() -
      new Date(a.createdAt).getTime()
  );

  const expensesByDate = sortedExpenses.filter(
    (expense) =>
      expense.createdAt &&
      dateKey(new Date(expense.createdAt)) === selectedSpendingDate
  );

  const recentExpenses = showAllExpenses
    ? sortedExpenses
    : sortedExpenses.slice(0, 3);

  const calendarYear = calendarMonth.getFullYear();
  const calendarMonthIndex = calendarMonth.getMonth();

  const calendarDays = new Date(
    calendarYear,
    calendarMonthIndex + 1,
    0
  ).getDate();

  const calendarOffset =
    (new Date(calendarYear, calendarMonthIndex, 1).getDay() + 6) % 7;

  const dailySpending = sortedExpenses.reduce<Record<string, number>>(
    (result, expense) => {
      if (!expense.createdAt) return result;

      const key = dateKey(new Date(expense.createdAt));

      result[key] = (result[key] ?? 0) + Number(expense.amount);

      return result;
    },
    {}
  );

  const lastSevenDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));

    const key = dateKey(date);

    return {
      key,
      label: date.toLocaleDateString('en-US', { weekday: 'short' }),
      amount: dailySpending[key] ?? 0,
    };
  });

  const maximumDailySpending = Math.max(
    1,
    ...lastSevenDays.map((day) => day.amount)
  );

  const totalExpenses = visibleExpenses.reduce(
    (sum, expense) => sum + Number(expense.amount),
    0,
  );
  const myExpenses = visibleExpenses.reduce((sum, expense) => {
    const myShare = expense.shares
      .filter((share) => share.memberId === memberId)
      .reduce((shareSum, share) => shareSum + Number(share.amount), 0);
    return sum + myShare;
  }, 0);

  // ==========================================
  // CUSTOM SPLIT CALCULATIONS
  // ==========================================

  const expenseTotalCents = Math.round(
    (Number(expenseAmount.replace(',', '.')) || 0) * 100
  );

  const allocatedCents = (data?.members ?? []).reduce(
    (total, member) => {
      const value = Number(
        (customShares[member.id] ?? '0').replace(',', '.')
      );

      return total + (
        Number.isFinite(value)
          ? Math.round(value * 100)
          : 0
      );
    },
    0
  );

  const remainingCents = expenseTotalCents - allocatedCents;

  const isCustomSplitValid =
    expenseTotalCents > 0 &&
    remainingCents === 0 &&
    (data?.members ?? []).length > 0 &&
    (data?.members ?? []).every((member) => {
      const amount = customShares[member.id] ?? '';
      const value = Number(amount.replace(',', '.'));

      return (
        amount.trim() !== '' &&
        Number.isFinite(value) &&
        value >= 0 &&
        Math.round(value * 100) === value * 100
      );
    });

  if (loading && !data) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#065F46" />
          <Text style={styles.muted}>Loading your apartment finances...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        ref={moneyScrollRef}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadMoney(false);
            }}
            tintColor="#065F46"
          />
        }
      >


        <View pointerEvents="none" style={moneyGlass.ambientOrbTop} />
        <View pointerEvents="none" style={moneyGlass.ambientOrbBottom} />
        <View style={moneyGlass.brandRow}>
          <View style={moneyGlass.brandIcon}><Ionicons name="wallet-outline" size={21} color="#FFFFFF" /></View>
          <Text style={moneyGlass.brand}>roomie<Text style={{ color: '#065F46' }}>.</Text></Text>
          <View style={{ flex: 1 }} />
          <Pressable style={moneyGlass.apartmentPill} onPress={() => router.navigate('/(tabs)')} accessibilityLabel="Go to Home">
            <Ionicons name="home-outline" size={13} color="#065F46" />
            <Text style={moneyGlass.apartmentText} numberOfLines={1}>{apartmentName || 'Shared apartment'}</Text>
          </Pressable>
        </View>
        <View style={moneyGlass.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={moneyGlass.heading}>Money <Text style={{ color: '#065F46' }}>✦</Text></Text>
            <Text style={moneyGlass.subtitle}>Everything your home spends, in one place.</Text>
          </View>
          <Pressable style={moneyGlass.currencyPill} onPress={() => setSelectedCurrency(v => v === 'EUR' ? 'CZK' : 'EUR')} accessibilityLabel="Switch currency">
            <Text style={moneyGlass.currencyText}>{selectedCurrency === 'EUR' ? '€ EUR' : 'Kč CZK'}</Text>
            <Ionicons name="chevron-down" size={13} color="#065F46" />
          </Pressable>
        </View>
        {moneyWorkspace !== null && (
          <Pressable onPress={() => { setMoneyWorkspace(null); setShowExpenseForm(false); setShowContributionForm(false); }} style={redesign.backButton}>
            <Ionicons name="arrow-back" size={18} color="#065F46" /><Text style={redesign.backText}>Back to overview</Text>
          </Pressable>
        )}
        {moneyWorkspace === null && (
          <>
            <View style={redesign.hero}>
              <View pointerEvents="none" style={moneyGlass.heroOrb} />
              <View pointerEvents="none" style={moneyGlass.heroSheen} />
              <View style={redesign.heroTop}>
                <Text style={redesign.heroEyebrow}>YOUR MONEY SNAPSHOT</Text>
                <Ionicons name="wallet-outline" size={21} color="#D1FAE5" />
              </View>
              <Text style={redesign.heroHeadline}>
                {Math.abs(totalIOwe - totalOwedToMe) < 0.005
                  ? 'All settled up!'
                  : totalIOwe > totalOwedToMe
                  ? 'You have a balance to settle'
                  : 'You are owed money'}
              </Text>
              <Text style={redesign.heroCaption}>
                {Math.abs(totalIOwe - totalOwedToMe) < 0.005
                  ? 'Your outstanding balances are even.'
                  : `Net difference: ${formatMoney(Math.abs(totalIOwe - totalOwedToMe), selectedCurrency)}`}
              </Text>
              <View style={redesign.heroStats}>
                <Pressable style={redesign.heroStat} onPress={openDebts}>
                  <Text style={redesign.heroStatLabel}>You owe</Text>
                  <Text style={redesign.heroStatValue} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(totalIOwe, selectedCurrency)}</Text>
                </Pressable>
                <Pressable style={redesign.heroStat} onPress={openDebts}>
                  <Text style={redesign.heroStatLabel}>Owed to you</Text>
                  <Text style={redesign.heroStatValue} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(totalOwedToMe, selectedCurrency)}</Text>
                </Pressable>
              </View>
              <Pressable style={settleDesign.heroCTA} onPress={openDebts}>
                <Text style={settleDesign.heroCTAText}>View balances & settle up</Text>
                <Ionicons name="arrow-forward" size={18} color="#065F46" />
              </Pressable>
            </View>

            <Pressable style={settleDesign.spendingCard} onPress={() => { setMoneyWorkspace('insights'); setShowSpendingDetails(true); }}>
              <View style={settleDesign.spendingIcon}><Ionicons name="stats-chart-outline" size={22} color="#065F46" /></View>
              <View style={{ flex: 1 }}>
                <Text style={settleDesign.spendingEyebrow}>APARTMENT SPENDING</Text>
                <Text style={settleDesign.spendingAmount}>{formatMoney(totalExpenses, selectedCurrency)}</Text>
                <Text style={settleDesign.spendingMeta}>Your share: {formatMoney(myExpenses, selectedCurrency)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#065F46" />
            </Pressable>

            {pendingCount > 0 && (
              <>
                <View style={redesign.sectionHeadingRow}><Text style={redesign.sectionTitle}>Needs attention</Text></View>
                <Pressable style={redesign.attentionCard} onPress={() => { setSelectedCurrency(pendingRepayments[0].currency); openDebts(); }}>
                  <View style={redesign.attentionIcon}><Ionicons name="time-outline" size={22} color="#AD762F" /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={redesign.attentionTitle}>{pendingCount} payment {pendingCount === 1 ? 'confirmation' : 'confirmations'}</Text>
                    <Text style={redesign.attentionSubtitle}>{pendingRepayments[0].fromMember.name} recorded {formatMoney(pendingRepayments[0].amount, pendingRepayments[0].currency)}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#AD762F" />
                </Pressable>
              </>
            )}

            <Text style={redesign.sectionTitle}>Manage money</Text>
            <View style={moneyTheme.workspaceRow}>
              <Pressable style={moneyTheme.workspaceButton} onPress={() => { setMoneyWorkspace('expenses'); setActiveTab('expenses'); }}>
                <Ionicons name="receipt-outline" size={19} color="#065F46" />
                <Text style={moneyTheme.workspaceText}>Expenses</Text>
              </Pressable>
              <Pressable style={moneyTheme.workspaceButton} onPress={() => { setMoneyWorkspace('contributions'); setActiveTab('contributions'); }}>
                <Ionicons name="people-outline" size={19} color="#065F46" />
                <Text style={moneyTheme.workspaceText}>Contributions</Text>
              </Pressable>
              <Pressable style={moneyTheme.workspaceButton} onPress={() => { setMoneyWorkspace('insights'); setActiveSpendingView('chart'); }}>
                <Ionicons name="stats-chart-outline" size={19} color="#065F46" />
                <Text style={moneyTheme.workspaceText}>Insights</Text>
              </Pressable>
            </View>

            <View style={redesign.sectionHeadingRow}>
              <Text style={redesign.sectionTitle}>Recent expenses</Text>
              <Pressable onPress={() => { setMoneyWorkspace('expenses'); setActiveTab('expenses'); }}><Text style={redesign.linkText}>View all →</Text></Pressable>
            </View>
            <View style={redesign.activityCard}>
              {sortedExpenses.slice(0, 3).length ? sortedExpenses.slice(0, 3).map((expense, index) => (
                <View key={expense.id} style={[redesign.activityRow, index > 0 && redesign.activityDivider]}>
                  <View style={redesign.activityIcon}><Ionicons name="receipt-outline" size={20} color="#065F46" /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={redesign.activityTitle} numberOfLines={1}>{expense.title}</Text>
                    <Text style={redesign.activityMeta} numberOfLines={1}>Paid by {expense.paidBy?.id === memberId ? 'you' : expense.paidBy?.name || 'roommate'} · {new Date(expense.createdAt).toLocaleDateString()}</Text>
                  </View>
                  <Text style={redesign.activityAmount}>{formatMoney(expense.amount, selectedCurrency)}</Text>
                </View>
              )) : <Text style={redesign.emptyText}>No expenses in {selectedCurrency} yet.</Text>}
            </View>
          </>
        )}
        {moneyWorkspace === 'insights' && (<>
        <View style={styles.moneySectionRow}>
          <Text style={styles.moneySectionTitle}>Apartment spending</Text>
          <Text style={styles.moneySectionHint}>SHARED HOME</Text>
        </View>

        <Pressable
          style={styles.moneySpendingCard}
          onPress={() => setShowSpendingDetails((previous) => !previous)}
        >
          <View style={styles.moneySpendingIcon}>
            <Ionicons name="receipt-outline" size={22} color="#065F46" />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.moneySpendingLabel}>
              {data?.apartment.name || apartmentName}
            </Text>

            <Text style={styles.moneySpendingAmount}>
              {formatMoney(totalExpenses, selectedCurrency)}
            </Text>

            <Text style={styles.moneySpendingMeta}>
              Your share: {formatMoney(myExpenses, selectedCurrency)}
            </Text>
          </View>

          <Ionicons
            name={showSpendingDetails ? 'chevron-up' : 'chevron-down'}
            size={20}
            color="#065F46"
          />
        </Pressable>

        {showSpendingDetails && (
          <View style={styles.moneySpendingDetails}>
            <Text style={styles.moneyDetailHeading}>Spending by roommate</Text>

            {roommateSpending.map((member) => (
              <View key={member.id} style={styles.moneyMemberRow}>
                <View style={styles.moneyMemberAvatar}>
                  <Text style={styles.moneyMemberInitial}>
                    {member.name.charAt(0).toUpperCase()}
                  </Text>
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.moneyMemberName}>
                    {member.name}
                    {member.id === memberId ? ' (You)' : ''}
                  </Text>

                  <Text style={styles.moneyDetailNote}>
                    Paid: {formatMoney(member.amountPaid, selectedCurrency)}
                  </Text>
                </View>

                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.moneyMemberAmount}>
                    {formatMoney(member.personalShare, selectedCurrency)}
                  </Text>
                  <Text style={styles.moneyDetailNote}>Their share</Text>
                </View>
              </View>
            ))}

            <View style={styles.moneyOwedPanel}>
              <Text style={styles.moneyDetailHeading}>Who owes you</Text>

              {peopleWhoOweMe.length > 0 ? (
                peopleWhoOweMe.map((debt) => (
                  <View
                    key={`${debt.expenseId}:${debt.fromMember.id}`}
                    style={styles.moneyOwedRow}
                  >
                    <Text style={styles.moneyMemberName}>
                      {debt.fromMember.name}
                    </Text>

                    <Text style={styles.moneyOwedAmount}>
                      {formatMoney(debt.remainingAmount, selectedCurrency)}
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={styles.moneyDetailNote}>
                  Nobody currently owes you.
                </Text>
              )}
            </View>
          </View>
        )}

        <View style={styles.spendingToolsRow}>
          <Pressable
            style={[
              styles.spendingToolButton,
              { backgroundColor: '#EEEAFE' },
              activeSpendingView === 'chart' && styles.spendingToolActive,
            ]}
            onPress={() =>
              setActiveSpendingView(
                activeSpendingView === 'chart' ? null : 'chart'
              )
            }
          >
            <Ionicons
              name="stats-chart-outline"
              size={26}
              color="#065F46"
            />

            <Text style={styles.spendingToolTitle}>
              Spending activity
            </Text>

            <Text style={styles.spendingToolSubtitle}>
              View spending trends
            </Text>

            <Ionicons
              name={activeSpendingView === 'chart' ? 'chevron-up' : 'arrow-forward'}
              size={18}
              color="#065F46"
            />
          </Pressable>

          <Pressable
            style={[
              styles.spendingToolButton,
              { backgroundColor: '#E6F8EF' },
              activeSpendingView === 'calendar' && styles.spendingToolActive,
            ]}
            onPress={() =>
              setActiveSpendingView(
                activeSpendingView === 'calendar' ? null : 'calendar'
              )
            }
          >
            <Ionicons
              name="calendar-outline"
              size={26}
              color="#178B67"
            />

            <Text style={styles.spendingToolTitle}>
              Expense calendar
            </Text>

            <Text style={styles.spendingToolSubtitle}>
              Browse by date
            </Text>

            <Ionicons
              name={activeSpendingView === 'calendar' ? 'chevron-up' : 'arrow-forward'}
              size={18}
              color="#178B67"
            />
          </Pressable>
        </View>


        {/* Interactive spending chart */}
        {activeSpendingView === 'chart' && (
          <View style={styles.spendingVisualCard}>
            <View style={styles.visualHeader}>
              <Text style={styles.moneyDetailHeading}>Spending activity</Text>
              <Text style={styles.visualSubtitle}>LAST 7 DAYS</Text>
            </View>
            <View style={styles.spendingChart}>
              {lastSevenDays.map((day) => (
                <Pressable
                  key={day.key}
                  style={styles.chartColumn}
                  onPress={() => {
                    setSelectedSpendingDate(day.key);
                    const chosen = new Date(`${day.key}T12:00:00`);
                    setCalendarMonth(new Date(chosen.getFullYear(), chosen.getMonth(), 1));
                  }}
                >
                  <View style={styles.chartBarTrack}>
                    <View style={[styles.chartBar, {
                      height: `${day.amount > 0 ? Math.max(8, day.amount / maximumDailySpending * 100) : 2}%`,
                      backgroundColor: selectedSpendingDate === day.key ? '#065F46' : '#C8BFFF',
                    }]} />
                  </View>
                  <Text style={styles.chartDay}>{day.label}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.visualFooter}>Tap a bar to explore daily expenses</Text>
          </View>
        )}

        {/* Interactive expense calendar */}
        {activeSpendingView === 'calendar' && (
          <View style={styles.spendingVisualCard}>
            <View style={styles.visualHeader}>
              <Text style={styles.moneyDetailHeading}>Expense calendar</Text>
              <View style={styles.calendarNavigation}>
                <Pressable onPress={() => setCalendarMonth(new Date(calendarYear, calendarMonthIndex - 1, 1))}>
                  <Ionicons name="chevron-back" size={19} color="#065F46" />
                </Pressable>
                <Text style={styles.calendarMonthText}>
                  {calendarMonth.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                </Text>
                <Pressable onPress={() => setCalendarMonth(new Date(calendarYear, calendarMonthIndex + 1, 1))}>
                  <Ionicons name="chevron-forward" size={19} color="#065F46" />
                </Pressable>
              </View>
            </View>
            <View style={styles.calendarGrid}>
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => (
                <View key={`heading-${index}`} style={styles.calendarCell}>
                  <Text style={styles.calendarWeekday}>{day}</Text>
                </View>
              ))}
              {Array.from({ length: calendarOffset }, (_, index) => (
                <View key={`empty-${index}`} style={styles.calendarCell} />
              ))}
              {Array.from({ length: calendarDays }, (_, index) => {
                const day = index + 1;
                const key = dateKey(new Date(calendarYear, calendarMonthIndex, day));
                const hasExpense = (dailySpending[key] ?? 0) > 0;
                const selected = selectedSpendingDate === key;
                return (
                  <Pressable
                    key={key}
                    style={[styles.calendarCell, selected && styles.calendarSelected]}
                    onPress={() => setSelectedSpendingDate(key)}
                  >
                    <Text style={[styles.calendarDay, selected && { color: '#FFFFFF' }]}>{day}</Text>
                    {hasExpense && <View style={[styles.calendarDot, selected && { backgroundColor: '#FFFFFF' }]} />}
                  </Pressable>
                );
              })}
            </View>
            {selectedSpendingDate && (
              <View style={styles.selectedDatePanel}>
                <View style={styles.visualHeader}>
                  <Text style={styles.moneyDetailHeading}>
                    {new Date(`${selectedSpendingDate}T12:00:00`).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </Text>
                  <Pressable onPress={() => { setSelectedSpendingDate(null); setExpandedExpenseId(null); }}>
                    <Ionicons name="close-circle" size={22} color="#77758C" />
                  </Pressable>
                </View>
                {expensesByDate.length === 0 ? (
                  <Text style={styles.moneyDetailNote}>No expenses recorded on this date.</Text>
                ) : expensesByDate.map((expense) => (
                  <Pressable
                    key={expense.id}
                    style={styles.calendarExpenseRow}
                    onPress={() => setExpandedExpenseId(expandedExpenseId === expense.id ? null : expense.id)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.moneyMemberName}>{expense.title}</Text>
                      <Text style={styles.moneyDetailNote}>Paid by {expense.paidBy?.name || 'Roommate'}</Text>
                    </View>
                    <Text style={styles.moneyMemberAmount}>{formatMoney(expense.amount, selectedCurrency)}</Text>
                    <Ionicons name={expandedExpenseId === expense.id ? 'chevron-up' : 'chevron-down'} size={16} color="#77758C" />
                    {expandedExpenseId === expense.id && (
                      <View style={{ width: '100%', marginTop: 10 }}>
                        {expense.shares.map((share) => (
                          <View key={share.id} style={styles.moneyOwedRow}>
                            <Text style={styles.moneyDetailNote}>{share.member?.name || 'Roommate'}</Text>
                            <Text style={styles.moneyMemberName}>{formatMoney(share.amount, selectedCurrency)}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        )}

        </>)}
        {moneyWorkspace !== null && moneyWorkspace !== 'insights' && (<>
        <View style={styles.moneySectionRow}>
          <Text style={styles.moneySectionTitle}>Transactions</Text>
          <Text style={styles.moneySectionHint}>MANAGE TOGETHER</Text>
        </View>

        <View
          style={styles.premiumTabsContainer}
          onLayout={(event) => { transactionsY.current = event.nativeEvent.layout.y; }}
        >
          {([
            { key: 'expenses', label: 'Expenses', icon: 'receipt-outline' },
            { key: 'contributions', label: 'Contributions', icon: 'people-outline' },
            { key: 'debts', label: 'Debts', icon: 'wallet-outline' },
          ] as const).map((tab) => {
            const isActive = activeTab === tab.key;

            return (
              <Pressable
                key={tab.key}
                style={[
                  styles.premiumTab,
                  isActive && styles.premiumTabActive,
                ]}
                onPress={() => setActiveTab(tab.key)}
              >
                <Ionicons
                  name={tab.icon}
                  size={19}
                  color={isActive ? '#FFFFFF' : '#85839A'}
                />

                <Text
                  style={[
                    styles.premiumTabText,
                    isActive && styles.premiumTabTextActive,
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {tab.label}
                </Text>

                {tab.key === 'debts' && pendingCount > 0 && (
                  <View style={styles.premiumTabBadge}>
                    <Text style={styles.premiumTabBadgeText}>
                      {pendingCount > 99 ? '99+' : pendingCount}
                    </Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>

        {activeTab === 'expenses' ? (
          <>
            <Pressable
              style={styles.addExpenseCard}
              onPress={() => setShowExpenseForm((value) => !value)}
              accessibilityRole="button"
              accessibilityLabel={showExpenseForm ? 'Cancel adding expense' : 'Add new expense'}
            >
              <View style={styles.addExpenseIconBox}>
                <Ionicons
                  name={showExpenseForm ? 'close' : 'add'}
                  size={27}
                  color="#FFFFFF"
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.addExpenseTitle}>
                  {showExpenseForm ? 'Cancel new expense' : 'Add new expense'}
                </Text>

                <Text style={styles.addExpenseSubtitle}>
                  {showExpenseForm
                    ? 'Close the expense form'
                    : 'Split a payment with roommates'}
                </Text>
              </View>

              <Ionicons
                name={showExpenseForm ? 'chevron-up' : 'arrow-forward'}
                size={21}
                color="#FFFFFF"
              />
            </Pressable>

            {showExpenseForm && (
              <View style={styles.formCard}>
                <Text style={styles.sectionHeading}>New expense · {selectedCurrency}</Text>

                <Text style={styles.inputLabel}>EXPENSE NAME</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Groceries"
                  placeholderTextColor="#9298A6"
                  value={expenseTitle}
                  onChangeText={setExpenseTitle}
                />

                <Text style={styles.inputLabel}>TOTAL AMOUNT ({selectedCurrency})</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0.00"
                  placeholderTextColor="#9298A6"
                  value={expenseAmount}
                  onChangeText={setExpenseAmount}
                  keyboardType="decimal-pad"
                />

                <Text style={styles.premiumFormSectionTitle}>Who paid?</Text>

                <View style={styles.payerGrid}>
                  {(data?.members ?? []).map((member) => {
                    const selected = paidById === member.id;

                    return (
                      <Pressable
                        key={member.id}
                        style={[
                          styles.payerCard,
                          selected && styles.payerCardSelected,
                        ]}
                        onPress={() => setPaidById(member.id)}
                      >
                        <View
                          style={[
                            styles.payerAvatar,
                            selected && styles.payerAvatarSelected,
                          ]}
                        >
                          <Text
                            style={[
                              styles.payerInitial,
                              selected && { color: '#FFFFFF' },
                            ]}
                          >
                            {member.name.charAt(0).toUpperCase()}
                          </Text>
                        </View>

                        <Text
                          style={styles.payerName}
                          numberOfLines={1}
                        >
                          {member.id === memberId ? 'You' : member.name}
                        </Text>

                        {selected && (
                          <Ionicons
                            name="checkmark-circle"
                            size={18}
                            color="#065F46"
                          />
                        )}
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={styles.premiumFormSectionTitle}>How to split?</Text>

                <View style={styles.premiumSplitRow}>
                  <Pressable
                    style={[
                      styles.premiumSplitCard,
                      splitType === 'EQUAL' && styles.premiumSplitSelected,
                    ]}
                    onPress={() => setSplitType('EQUAL')}
                  >
                    <Ionicons
                      name="people-outline"
                      size={23}
                      color={splitType === 'EQUAL' ? '#065F46' : '#85839A'}
                    />

                    <Text style={styles.premiumSplitTitle}>
                      Split equally
                    </Text>

                    <Text style={styles.premiumSplitSubtitle}>
                      Same share for everyone
                    </Text>

                    {splitType === 'EQUAL' && (
                      <Ionicons name="checkmark-circle" size={18} color="#065F46" />
                    )}
                  </Pressable>

                  <Pressable
                    style={[
                      styles.premiumSplitCard,
                      splitType === 'CUSTOM' && styles.premiumSplitSelected,
                    ]}
                    onPress={() => setSplitType('CUSTOM')}
                  >
                    <Ionicons
                      name="options-outline"
                      size={23}
                      color={splitType === 'CUSTOM' ? '#065F46' : '#85839A'}
                    />

                    <Text style={styles.premiumSplitTitle}>
                      Custom split
                    </Text>

                    <Text style={styles.premiumSplitSubtitle}>
                      Set individual amounts
                    </Text>

                    {splitType === 'CUSTOM' && (
                      <Ionicons name="checkmark-circle" size={18} color="#065F46" />
                    )}
                  </Pressable>
                </View>

                {splitType === 'EQUAL' ? (
                  <Text style={styles.helper}>
                    The amount will be divided between all apartment members.
                    Any extra cents are allocated fairly.
                  </Text>
                ) : (
                  <>
                    <Text style={styles.helper}>
                      Enter each roommate's share. Use 0 for anyone who owes
                      nothing. All amounts must add up to the total.
                    </Text>
                    <View style={styles.splitSummaryCard}>
                      <Text style={styles.splitSummaryLabel}>TOTAL EXPENSE</Text>

                      <Text style={styles.splitSummaryTotal}>
                        {formatMoney(expenseTotalCents / 100, selectedCurrency)}
                      </Text>

                      <View style={styles.splitSummaryDivider} />

                      <View style={styles.splitSummaryRow}>
                        <Text style={styles.splitSummaryMuted}>
                          Amount allocated
                        </Text>
                        <Text style={styles.splitSummaryValue}>
                          {formatMoney(allocatedCents / 100, selectedCurrency)}
                        </Text>
                      </View>

                      <View style={styles.splitProgressTrack}>
                        <View
                          style={[
                            styles.splitProgressFill,
                            {
                              width: `${expenseTotalCents > 0
                                ? Math.min(
                                  100,
                                  Math.max(0, (allocatedCents / expenseTotalCents) * 100)
                                )
                                : 0
                                }%`,
                            },
                          ]}
                        />
                      </View>

                      <View style={styles.splitSummaryRow}>
                        <Text style={styles.splitSummaryMuted}>
                          Remaining to allocate
                        </Text>
                        <Text
                          style={[
                            styles.splitRemainingValue,
                            remainingCents !== 0 && { color: '#C96A57' },
                          ]}
                        >
                          {formatMoney(remainingCents / 100, selectedCurrency)}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.premiumFormSectionTitle}>
                      Roommate shares
                    </Text>

                    {(data?.members ?? []).map((member) => (
                      <View key={member.id} style={styles.customShareCard}>
                        <View style={styles.customShareAvatar}>
                          <Text style={styles.customShareInitial}>
                            {member.name.charAt(0).toUpperCase()}
                          </Text>
                        </View>

                        <View style={{ flex: 1 }}>
                          <Text style={styles.customShareName}>
                            {member.id === memberId ? 'You' : member.name}
                          </Text>
                          <Text style={styles.customShareHint}>
                            Custom amount
                          </Text>
                        </View>

                        <View style={styles.customShareInputWrap}>
                          <Text style={styles.customShareCurrency}>
                            {selectedCurrency === 'EUR' ? '€' : 'Kč'}
                          </Text>

                          <TextInput
                            style={styles.customShareInput}
                            placeholder="0.00"
                            placeholderTextColor="#AAA6B8"
                            keyboardType="decimal-pad"
                            value={customShares[member.id] ?? ''}
                            onChangeText={(value) =>
                              updateCustomShare(member.id, value)
                            }
                          />
                        </View>
                      </View>
                    ))}

                    <View style={styles.splitValidationRow}>
                      <Ionicons
                        name={
                          isCustomSplitValid
                            ? 'checkmark-circle'
                            : 'alert-circle-outline'
                        }
                        size={19}
                        color={isCustomSplitValid ? '#178B67' : '#C96A57'}
                      />

                      <Text
                        style={[
                          styles.splitValidationText,
                          {
                            color: isCustomSplitValid ? '#178B67' : '#C96A57',
                          },
                        ]}
                      >
                        {isCustomSplitValid
                          ? 'All shares are allocated correctly'
                          : 'Shares must equal the total expense'}
                      </Text>
                    </View>
                  </>
                )}

                <Pressable
                  style={[
                    styles.premiumSaveExpenseButton,
                    (saving || (splitType === 'CUSTOM' && !isCustomSplitValid)) &&
                    styles.premiumSaveExpenseDisabled,
                  ]}
                  disabled={
                    saving || (splitType === 'CUSTOM' && !isCustomSplitValid)
                  }
                  onPress={submitExpense}
                >
                  {saving ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons
                        name="checkmark-circle-outline"
                        size={22}
                        color="#FFFFFF"
                      />

                      <Text style={styles.premiumSaveExpenseText}>
                        Save expense
                      </Text>

                      <Ionicons
                        name="arrow-forward"
                        size={19}
                        color="#FFFFFF"
                      />
                    </>
                  )}
                </Pressable>
              </View>
            )}
            <Text style={styles.sectionHeading}>Smart Receipt Claims</Text>
            {(data?.receipts ?? []).some((receipt) => !normalizeCurrency(receipt.currency)) && (
              <Text style={styles.helper}>
                Some older receipts have an unrecognized currency and are hidden until corrected.
              </Text>
            )}

            {visibleReceipts.length ? (
              visibleReceipts.map((receipt) => (
                <View key={receipt.id} style={styles.premiumReceiptCard}>
                  <Pressable
                    style={styles.premiumReceiptMain}
                    onPress={() => router.push(`/receipt/${receipt.id}` as never)}
                    accessibilityRole="button"
                    accessibilityLabel={`Open receipt from ${receipt.store || 'shop'}`}
                  >
                    <View style={styles.premiumReceiptIcon}>
                      <Ionicons name="receipt-outline" size={24} color="#065F46" />
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={styles.premiumReceiptTitle} numberOfLines={1}>
                        {receipt.store || 'Receipt'}
                      </Text>

                      <Text style={styles.premiumReceiptSubtitle} numberOfLines={1}>
                        Uploaded by {receipt.uploader?.name || 'Roommate'}
                      </Text>

                      <Text style={styles.premiumReceiptDate}>
                        {receipt.createdAt
                          ? new Date(receipt.createdAt).toLocaleDateString()
                          : ''}
                      </Text>
                    </View>

                    <View style={{ alignItems: 'flex-end', gap: 7 }}>
                      <Text style={styles.premiumReceiptAmount}>
                        {formatMoney(receipt.total, selectedCurrency)}
                      </Text>
                      <Ionicons name="chevron-forward" size={18} color="#065F46" />
                    </View>
                  </Pressable>

                  <View style={styles.premiumReceiptFooter}>
                    <View style={styles.premiumReceiptBadge}>
                      <Ionicons name="sparkles-outline" size={14} color="#065F46" />
                      <Text style={styles.premiumReceiptBadgeText}>Smart receipt</Text>
                    </View>

                    {receipt.uploader?.id === memberId && receipt.status === 'OPEN' ? (
                      <Pressable
                        disabled={saving}
                        onPress={() => deleteReceipt(receipt.id)}
                        style={styles.premiumReceiptDelete}
                      >
                        <Ionicons name="trash-outline" size={15} color="#C96A57" />
                        <Text style={styles.premiumReceiptDeleteText}>Delete</Text>
                      </Pressable>
                    ) : (
                      <Pressable
                        onPress={() => router.push(`/receipt/${receipt.id}` as never)}
                      >
                        <Text style={styles.premiumReceiptView}>View items →</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              ))
            ) : (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No saved receipts yet</Text>
                <Text style={styles.muted}>
                  Scan and save a receipt to see its products and roommate claims here.
                </Text>
              </View>
            )}



            <Text style={styles.sectionHeading}>Previous expenses</Text>

            {/* Regular expenses */}
            {recentExpenses.map((expense) => {
              const expanded = expandedExpenseId === expense.id;

              return (
                <View key={`expense-${expense.id}`} style={styles.premiumExpenseCard}>
                  <Pressable
                    style={styles.premiumExpenseMain}
                    onPress={() =>
                      setExpandedExpenseId(expanded ? null : expense.id)
                    }
                    accessibilityRole="button"
                  >
                    <View style={styles.premiumExpenseIcon}>
                      <Ionicons name="cart-outline" size={22} color="#178B67" />
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={styles.premiumExpenseTitle} numberOfLines={1}>
                        {expense.title}
                      </Text>

                      <Text style={styles.premiumExpenseSubtitle} numberOfLines={1}>
                        Paid by {expense.paidBy?.name || 'Roommate'}
                      </Text>

                      <Text style={styles.premiumExpenseDate}>
                        {expense.createdAt
                          ? new Date(expense.createdAt).toLocaleDateString()
                          : ''}
                      </Text>
                    </View>

                    <View style={{ alignItems: 'flex-end', gap: 7 }}>
                      <Text style={styles.premiumExpenseAmount}>
                        {formatMoney(expense.amount, selectedCurrency)}
                      </Text>

                      <Ionicons
                        name={expanded ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color="#77758C"
                      />
                    </View>
                  </Pressable>

                  {expanded && (
                    <View style={styles.premiumExpenseDetails}>
                      <View style={styles.premiumExpenseSplitBadge}>
                        <Text style={styles.premiumExpenseSplitText}>
                          {expense.splitType === 'EQUAL'
                            ? 'Equal split'
                            : 'Custom split'}
                        </Text>
                      </View>

                      {expense.shares.map((share) => (
                        <View key={share.id} style={styles.premiumExpenseShareRow}>
                          <Text style={styles.premiumExpenseShareName}>
                            {share.member?.name || 'Roommate'}
                          </Text>

                          <Text style={styles.premiumExpenseShareAmount}>
                            {formatMoney(Number(share.amount), selectedCurrency)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
            {sortedExpenses.length > 3 && (
              <Pressable
                style={styles.viewAllExpensesButton}
                onPress={() => setShowAllExpenses((previous) => !previous)}
              >
                <Text style={styles.viewAllExpensesText}>
                  {showAllExpenses ? 'Show less' : 'View all expenses'}
                </Text>

                <Ionicons
                  name={showAllExpenses ? 'chevron-up' : 'chevron-down'}
                  size={17}
                  color="#065F46"
                />
              </Pressable>
            )}

            {/* Empty state */}
            {visibleExpenses.length === 0 &&
              visibleReceipts.length === 0 && (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>No expenses yet</Text>
                  <Text style={styles.muted}>
                    Add an expense or upload a receipt to start tracking
                    apartment spending.
                  </Text>
                </View>
              )}

          </>
        ) : activeTab === 'debts' ? (
          <>
            <Text style={settleDesign.heading}>Settle up with roommates</Text>
            <Text style={settleDesign.description}>See who owes whom. Roomie records payments you make outside the app.</Text>
            {debtLoading && <ActivityIndicator color="#065F46" />}
            {pendingRepayments.filter(p => p.currency === selectedCurrency).length > 0 && (
              <View style={settleDesign.attentionBox}>
                <Text style={settleDesign.attentionHeading}>Payments to review</Text>
                {pendingRepayments.filter(p => p.currency === selectedCurrency).map(payment => (
                  <View key={payment.id} style={settleDesign.approvalCard}>
                    <Text style={settleDesign.personTitle}>{payment.fromMember.name} says they paid {formatMoney(payment.amount, selectedCurrency)}</Text>
                    <Text style={settleDesign.detailMuted}>For {payment.expenseTitle}. Confirm only if you received the money.</Text>
                    <View style={settleDesign.actionButtons}>
                      <Pressable disabled={saving} onPress={() => decideRepayment(payment.id,'CONFIRMED')} style={settleDesign.primarySmall}><Text style={settleDesign.primarySmallText}>I received it</Text></Pressable>
                      <Pressable disabled={saving} onPress={() => decideRepayment(payment.id,'REJECTED')} style={settleDesign.secondarySmall}><Text style={settleDesign.secondarySmallText}>Not received</Text></Pressable>
                    </View>
                  </View>
                ))}
              </View>
            )}
            <Text style={settleDesign.groupHeading}>You owe</Text>
            {roommateDebtGroups.length === 0 && <Text style={settleDesign.empty}>You're all caught up in {selectedCurrency}.</Text>}
            {roommateDebtGroups.map(group => (
              <View key={group.member.id} style={settleDesign.personCard}>
                <Pressable onPress={() => setSelectedSettlement(v => v === group.member.id ? null : group.member.id)} style={settleDesign.personRow}>
                  <View style={settleDesign.avatar}><Text style={settleDesign.avatarText}>{group.member.name.charAt(0).toUpperCase()}</Text></View>
                  <View style={{flex:1}}><Text style={settleDesign.personTitle}>{group.member.name}</Text><Text style={settleDesign.detailMuted}>You owe · {group.debts.length} expense{group.debts.length === 1 ? '' : 's'}</Text><Text style={settleDesign.personAmount}>{formatMoney(group.total, selectedCurrency)}</Text></View>
                  <View style={settleDesign.settlePill}><Text style={settleDesign.settlePillText}>{selectedSettlement === group.member.id ? 'Close' : 'Settle'}</Text></View>
                </Pressable>
                {selectedSettlement === group.member.id && (
                  <View style={settleDesign.detailArea}>
                    <Text style={settleDesign.detailHeading}>What you owe {group.member.name}</Text>
                    <Text style={settleDesign.detailMuted}>Choose an expense below after you've paid. Payments are confirmed by {group.member.name}.</Text>
                    {group.debts.map(debt => {
                      const key = `${debt.expenseId}:${debt.fromMember.id}`;
                      const available = Math.max(0, Number(debt.remainingAmount) - Number(debt.pendingAmount || 0));
                      return <View key={key} style={settleDesign.expenseItem}>
                        <View style={settleDesign.expenseTop}><Text style={settleDesign.expenseTitle}>{debt.expenseTitle}</Text><Text style={settleDesign.expenseAmount}>{formatMoney(debt.remainingAmount, selectedCurrency)}</Text></View>
                        {Number(debt.pendingAmount || 0) > 0 && <Text style={settleDesign.pendingText}>{formatMoney(debt.pendingAmount, selectedCurrency)} awaiting confirmation</Text>}
                        {available > 0 && <>
                          <Text style={settleDesign.fieldLabel}>Amount you've already paid (max {formatMoney(available, selectedCurrency)})</Text>
                          <View style={settleDesign.payRow}>
                            <TextInput style={settleDesign.amountInput} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor="#AAA4B9" value={repaymentInputs[key] ?? ''} onChangeText={v => setRepaymentInputs(old => ({...old,[key]:v}))}/>
                            <Pressable onPress={() => setRepaymentInputs(old => ({...old,[key]:available.toFixed(2)}))} style={settleDesign.fullPill}><Text style={settleDesign.fullPillText}>Full</Text></Pressable>
                          </View>
                          <Pressable disabled={saving} onPress={() => submitRepayment(debt)} style={settleDesign.confirmButton}><Text style={settleDesign.confirmText}>I've paid {group.member.name}</Text><Ionicons name="arrow-forward" color="#FFFFFF" size={17}/></Pressable>
                        </>}
                      </View>;
                    })}
                    <Text style={settleDesign.disclaimer}>Roomie doesn't transfer money. This only tells your roommate that you've paid them.</Text>
                  </View>
                )}
              </View>
            ))}
            <Text style={settleDesign.groupHeading}>Owed to you</Text>
            {owedToMe.length === 0 && <Text style={settleDesign.empty}>Nobody owes you in {selectedCurrency}.</Text>}
            {Object.values(owedToMe.reduce<Record<string,{member:Member,total:number,count:number}>>((acc,debt) => { const id=debt.fromMember.id; if(!acc[id]) acc[id]={member:debt.fromMember,total:0,count:0};acc[id].total+=Number(debt.remainingAmount);acc[id].count++;return acc;},{})).map(group => (
              <View key={group.member.id} style={settleDesign.personRowCard}>
                <View style={[settleDesign.avatar,{backgroundColor:'#E5F4EB'}]}><Text style={[settleDesign.avatarText,{color:'#32835D'}]}>{group.member.name.charAt(0).toUpperCase()}</Text></View>
                <View style={{flex:1}}><Text style={settleDesign.personTitle}>{group.member.name}</Text><Text style={settleDesign.detailMuted}>Owes you · {group.count} expense{group.count === 1 ? '' : 's'}</Text></View>
                <Text style={settleDesign.owedAmount}>{formatMoney(group.total, selectedCurrency)}</Text>
              </View>
            ))}
            <Text style={settleDesign.groupHeading}>Payment activity</Text>
            {paymentActivity.filter(p => p.currency === selectedCurrency).slice(0,12).map(payment => (
              <View key={payment.id} style={settleDesign.historyRow}>
                <View style={{flex:1}}><Text style={settleDesign.personTitle}>{payment.isSender ? `To ${payment.toMember.name}` : `From ${payment.fromMember.name}`}</Text><Text style={settleDesign.detailMuted}>{payment.expenseTitle} · {new Date(payment.createdAt).toLocaleDateString()}</Text></View>
                <View style={{alignItems:'flex-end'}}><Text style={settleDesign.expenseAmount}>{formatMoney(payment.amount, selectedCurrency)}</Text><Text style={[settleDesign.detailMuted,{color:payment.status==='CONFIRMED'?'#26805A':payment.status==='REJECTED'?'#B85B51':'#A77B38'}]}>{payment.status === 'CONFIRMED' ? 'Confirmed' : payment.status === 'REJECTED' ? 'Not confirmed' : 'Waiting'}</Text></View>
              </View>
            ))}
          </>
        ) : (
          <>
            <Pressable
  style={styles.addContributionCard}
  onPress={() => setShowContributionForm((value) => !value)}
>
  <View style={styles.addContributionIcon}>
    <Ionicons
      name={showContributionForm ? 'close' : 'add'}
      size={26}
      color="#FFFFFF"
    />
  </View>

  <View style={{ flex: 1 }}>
    <Text style={styles.addContributionTitle}>
      {showContributionForm
        ? 'Cancel new target'
        : 'Create contribution target'}
    </Text>

    <Text style={styles.addContributionSubtitle}>
      {showContributionForm
        ? 'Close the contribution form'
        : 'Collect money together for shared plans'}
    </Text>
  </View>

  <Ionicons
    name={showContributionForm ? 'chevron-up' : 'arrow-forward'}
    size={20}
    color="#FFFFFF"
  />
</Pressable>

            {showContributionForm && (
              <View style={styles.formCard}>
                <Text style={styles.sectionHeading}>New contribution target · {selectedCurrency}</Text>

                <Text style={styles.inputLabel}>WHAT IS IT FOR?</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Party food"
                  placeholderTextColor="#9298A6"
                  value={requestTitle}
                  onChangeText={setRequestTitle}
                />

                <Text style={styles.inputLabel}>TARGET AMOUNT ({selectedCurrency})</Text>
                <TextInput
                  style={styles.input}
                  placeholder="100.00"
                  placeholderTextColor="#9298A6"
                  value={targetAmount}
                  onChangeText={setTargetAmount}
                  keyboardType="decimal-pad"
                />

                <Pressable
                  style={[styles.primaryButton, saving && styles.disabled]}
                  disabled={saving}
                  onPress={submitContributionRequest}
                >
                  {saving ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Create target</Text>
                  )}
                </Pressable>
              </View>
            )}

            <Text style={styles.sectionHeading}>Contribution targets</Text>

            {visibleRequests.length ? (
  visibleRequests.map((request) => {
    const progress =
      request.targetAmount > 0
        ? Math.min(
            Math.max(request.contributedAmount / request.targetAmount, 0),
            1
          )
        : 0;

    const completed = request.remainingAmount <= 0;

    return (
      <View key={request.id} style={styles.premiumContributionCard}>

        {/* Header */}
        <View style={styles.contributionHeader}>
          <View style={styles.contributionIconBox}>
            <Ionicons
              name="people-outline"
              size={23}
              color="#065F46"
            />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.contributionTitle}>
              {request.title}
            </Text>

            <Text style={styles.contributionSubtitle}>
              Started by {request.createdBy?.name || 'Roommate'}
            </Text>
          </View>

          {completed && (
            <Ionicons
              name="checkmark-circle"
              size={24}
              color="#178B67"
            />
          )}
        </View>

        {/* Amount collected */}
        <View style={styles.contributionAmountPanel}>
          <Text style={styles.contributionAmountLabel}>
            TOTAL COLLECTED
          </Text>

          <Text style={styles.contributionAmount}>
            {formatMoney(request.contributedAmount, selectedCurrency)}
          </Text>

          <Text style={styles.contributionTargetText}>
            of {formatMoney(request.targetAmount, selectedCurrency)} target
          </Text>

          <View style={styles.contributionProgressTrack}>
            <View
              style={[
                styles.contributionProgressFill,
                { width: `${progress * 100}%` },
              ]}
            />
          </View>

          <View style={styles.contributionProgressFooter}>
            <Text style={styles.contributionProgressPercent}>
              {Math.round(progress * 100)}% collected
            </Text>

            <Text style={styles.contributionRemaining}>
              {completed
                ? 'Target reached!'
                : `${formatMoney(request.remainingAmount, selectedCurrency)} left`}
            </Text>
          </View>
        </View>

        {/* Contributions from roommates */}
        {request.contributions.length > 0 && (
          <View style={styles.contributionMembersSection}>
            <Text style={styles.contributionSectionLabel}>
              CONTRIBUTIONS
            </Text>

            {request.contributions.map((contribution) => (
              <View
                key={contribution.id}
                style={styles.contributionMemberRow}
              >
                <View style={styles.contributionMemberAvatar}>
                  <Text style={styles.contributionMemberInitial}>
                    {(contribution.member?.name || 'R')
                      .charAt(0)
                      .toUpperCase()}
                  </Text>
                </View>

                <Text style={styles.contributionMemberName}>
                  {contribution.memberId === memberId
                    ? 'You'
                    : contribution.member?.name || 'Roommate'}
                </Text>

                <Text style={styles.contributionMemberAmount}>
                  {formatMoney(contribution.amount, selectedCurrency)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Add contribution */}
        {!completed && (
          <View style={styles.premiumContributeBox}>
            <Text style={styles.contributionSectionLabel}>
              ADD YOUR CONTRIBUTION
            </Text>

            <View style={styles.contributionInputRow}>
              <View style={styles.contributionInputWrapper}>
                <Text style={styles.contributionCurrencySymbol}>
                  {selectedCurrency === 'EUR' ? '€' : 'Kč'}
                </Text>

                <TextInput
                  style={styles.contributionAmountInput}
                  placeholder="0.00"
                  placeholderTextColor="#AAA6B8"
                  value={contributionInputs[request.id] ?? ''}
                  onChangeText={(value) =>
                    setContributionInputs((previous) => ({
                      ...previous,
                      [request.id]: value,
                    }))
                  }
                  keyboardType="decimal-pad"
                />
              </View>

              <Pressable
                style={[
                  styles.premiumContributeButton,
                  saving && styles.disabled,
                ]}
                disabled={saving}
                onPress={() => submitContribution(request.id)}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons
                      name="add-circle-outline"
                      size={19}
                      color="#FFFFFF"
                    />
                    <Text style={styles.premiumContributeButtonText}>
                      Add
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        )}

        {completed && (
          <View style={styles.contributionCompletedRow}>
            <Ionicons
              name="checkmark-circle"
              size={18}
              color="#178B67"
            />
            <Text style={styles.contributionCompletedText}>
              Contribution target completed
            </Text>
          </View>
        )}

      </View>
    );
  })
) : (
  <View style={styles.emptyCard}>
    <Ionicons
      name="people-outline"
      size={30}
      color="#065F46"
    />
    <Text style={styles.emptyTitle}>
      No contribution targets
    </Text>
    <Text style={styles.muted}>
      Create a shared target for groceries, events, or apartment purchases.
    </Text>
  </View>
)}
          </>
        )}

        </>)}
        <Text style={styles.footer}>Roomie · Shared living, made easier.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}


const redesign = StyleSheet.create({
  topRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:22,gap:10},
  brandRow:{flexDirection:'row',alignItems:'center',gap:10,flex:1},brandIcon:{width:42,height:42,borderRadius:14,backgroundColor:'#065F46',alignItems:'center',justifyContent:'center'},pageTitle:{fontSize:24,fontWeight:'800',color:'#28223D'},pageSubtitle:{fontSize:11,color:'#918AA1',marginTop:2},currencyPill:{backgroundColor:'rgba(255,255,255,0.78)',paddingHorizontal:12,paddingVertical:10,borderRadius:25,flexDirection:'row',alignItems:'center',gap:6},currencyText:{color:'#065F46',fontSize:12,fontWeight:'800'},
  backButton:{flexDirection:'row',alignItems:'center',gap:8,marginBottom:20},backText:{color:'#065F46',fontWeight:'700',fontSize:14},
  hero:{backgroundColor:'#065F46',borderRadius:27,padding:22,overflow:'hidden',marginBottom:20,borderWidth:1,borderColor:'#32846A',shadowColor:'#064E3B',shadowOpacity:0.15,shadowRadius:15,elevation:4},heroTop:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},heroEyebrow:{fontSize:10,color:'#D1FAE5',fontWeight:'800',letterSpacing:1.2},heroHeadline:{fontSize:22,fontWeight:'800',color:'#FFFFFF',marginTop:14},heroCaption:{fontSize:13,color:'#D1FAE5',marginTop:7},heroStats:{flexDirection:'row',gap:10,marginTop:20},heroStat:{flex:1,backgroundColor:'rgba(255,255,255,0.14)',borderRadius:15,padding:13,borderWidth:1,borderColor:'rgba(255,255,255,0.20)'},heroStatLabel:{color:'#D1FAE5',fontSize:12},heroStatValue:{color:'#FFFFFF',fontSize:20,fontWeight:'800',marginTop:6},
  sectionTitle:{fontSize:17,fontWeight:'800',color:'#28223D',marginBottom:13},sectionHeadingRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:22},linkText:{color:'#065F46',fontSize:12,fontWeight:'800',marginBottom:13},actionRow:{flexDirection:'row',gap:9,marginBottom:8},actionCard:{flex:1,minWidth:0,backgroundColor:'rgba(255,255,255,0.79)',borderRadius:18,paddingVertical:17,paddingHorizontal:5,alignItems:'center',gap:11,borderWidth:1,borderColor:'rgba(255,255,255,0.96)'},actionIcon:{width:45,height:45,borderRadius:15,alignItems:'center',justifyContent:'center'},actionText:{fontSize:11,fontWeight:'800',color:'#322B46',textAlign:'center'},
  attentionCard:{backgroundColor:'#FFF3E4',borderRadius:18,padding:14,flexDirection:'row',alignItems:'center',gap:12},attentionIcon:{width:43,height:43,backgroundColor:'#FFE5C4',borderRadius:13,alignItems:'center',justifyContent:'center'},attentionTitle:{fontSize:13,fontWeight:'800',color:'#5E462B'},attentionSubtitle:{fontSize:12,color:'#9B784C',marginTop:4},
  activityCard:{backgroundColor:'rgba(255,255,255,0.79)',borderRadius:19,paddingHorizontal:15,paddingVertical:4,borderWidth:1,borderColor:'rgba(255,255,255,0.96)',marginBottom:23},activityRow:{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:14},activityDivider:{borderTopWidth:1,borderTopColor:'#F0EDF5'},activityIcon:{width:41,height:41,borderRadius:13,backgroundColor:'#E6F8EF',alignItems:'center',justifyContent:'center'},activityTitle:{fontSize:13,fontWeight:'800',color:'#302A43'},activityMeta:{fontSize:11,color:'#918AA1',marginTop:4},activityAmount:{fontSize:13,fontWeight:'800',color:'#302A43'},emptyText:{fontSize:13,color:'#918AA1',paddingVertical:20,textAlign:'center'},
  exploreGrid:{flexDirection:'row',flexWrap:'wrap',gap:10,marginBottom:20},exploreCard:{width:'48%',flexGrow:1,backgroundColor:'rgba(225,241,233,0.74)',borderRadius:18,padding:16,gap:7},exploreTitle:{fontSize:14,fontWeight:'800',color:'#322B46',marginTop:3},exploreSub:{fontSize:11,color:'#80788D'},
});

const styles = StyleSheet.create({
  debtSectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 16 },
  debtSectionTotal: { fontSize: 17, fontWeight: '800', color: '#C96A57' },
  roommateDebtCard: { backgroundColor: 'rgba(255,255,255,0.79)', borderRadius: 22, padding: 18, marginTop: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.92)' },
  roommateDebtHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 12 },
  roommateDebtAvatar: { width: 44, height: 44, borderRadius: 15, backgroundColor: '#FFF0EB', alignItems: 'center', justifyContent: 'center' },
  roommateDebtInitial: { fontSize: 18, fontWeight: '800', color: '#C96A57' },
  roommateDebtName: { fontSize: 16, fontWeight: '800', color: '#19182D' },
  roommateDebtTotal: { fontSize: 18, fontWeight: '800', color: '#C96A57' },
  roommateDebtExpense: { paddingVertical: 16, borderTopWidth: 1, borderTopColor: '#EFEDF5' },
  roommateDebtExpenseRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  premiumDebtTitle: { fontSize: 14, fontWeight: '800', color: '#19182D' },
  premiumDebtAmountSmall: { fontSize: 17, fontWeight: '800', color: '#C96A57' },
  premiumDebtProgressTrack: { height: 8, borderRadius: 10, backgroundColor: '#F3DCD5', overflow: 'hidden', marginTop: 13 },
  premiumDebtProgressFill: { height: '100%', backgroundColor: '#C96A57', borderRadius: 10 },
  premiumDebtStats: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 8 },
  premiumDebtStatText: { fontSize: 11, color: '#8C6D66', fontWeight: '600' },
  premiumDebtPending: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFF7E8', borderRadius: 12, padding: 12, marginTop: 14 },
  premiumDebtPendingText: { fontSize: 12, color: '#A66C15', fontWeight: '700', flexShrink: 1 },
  premiumDebtPaymentBox: { marginTop: 18, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#EFEDF5' },
  premiumDebtLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.7, color: '#85839A', marginBottom: 9 },
  premiumDebtPaymentHint: { fontSize: 12, color: '#85839A', marginBottom: 12 },
  premiumDebtInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  premiumDebtInputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', height: 48, borderWidth: 1, borderColor: '#E5E1F0', borderRadius: 13, paddingHorizontal: 12, gap: 7 },
  premiumDebtCurrency: { fontSize: 14, fontWeight: '800', color: '#065F46' },
  premiumDebtInput: { flex: 1, fontSize: 15, color: '#19182D', fontWeight: '700' },
  premiumDebtPayButton: { backgroundColor: '#065F46', borderRadius: 13, height: 48, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  premiumDebtPayText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  premiumDebtHistory: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#EFEDF5' },
  premiumDebtHistoryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  premiumDebtHistoryAmount: { fontSize: 13, fontWeight: '800', color: '#19182D' },
  premiumDebtHistoryDate: { fontSize: 11, color: '#85839A', marginTop: 4 },
  premiumDebtHistoryStatus: { fontSize: 12, fontWeight: '800' },
  debtDecisionRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  debtConfirmButton: { flex: 1, padding: 12, backgroundColor: '#178B67', borderRadius: 12, alignItems: 'center' },
  debtRejectButton: { flex: 1, padding: 12, backgroundColor: '#FFF0EB', borderRadius: 12, alignItems: 'center' },
  debtDecisionText: { fontSize: 12, fontWeight: '800', color: '#FFFFFF' },

  receiptSummaryRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 3 },
  receiptSummaryIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: '#E6F8EF', alignItems: 'center', justifyContent: 'center' },
  receiptSummaryEnd: { alignItems: 'flex-end', gap: 7, marginLeft: 4 },
  receiptDeleteCompact: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 5, paddingTop: 10, marginTop: 10, borderTopWidth: 1, borderTopColor: '#EBE9F2' },
  receiptDeleteCompactText: { color: '#A64B5B', fontSize: 12, fontWeight: '600' },

  paidText: {
    color: '#16805D',
    fontWeight: '700',
    marginTop: 10,
  },
  safeArea: { flex: 1, backgroundColor: '#EDF5F0' },
  content: {
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 120,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },

  currencySwitcher: {
    flexDirection: 'row',
    backgroundColor: '#EAECF4',
    borderRadius: 14,
    padding: 4,
    marginBottom: 16,
  },
  currencyOption: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 11,
  },
  currencyOptionActive: {
    backgroundColor: 'rgba(255,255,255,0.79)',
    elevation: 2,
  },
  currencyOptionText: {
    color: '#737B8C',
    fontWeight: '700',
  },
  currencyOptionTextActive: {
    color: '#065F46',
  },

  tabs: {
    flexDirection: 'row',
    backgroundColor: '#E6F8EF',
    borderRadius: 13,
    padding: 4,
    marginBottom: 18,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 10,
  },
  activeTab: {
    backgroundColor: 'rgba(255,255,255,0.79)',
    elevation: 2,
  },
  tabText: {
    color: '#737B8C',
    fontSize: 13,
    fontWeight: '700',
  },
  activeTabText: {
    color: '#065F46',
  },
  primaryButton: {
    backgroundColor: '#065F46',
    borderRadius: 16,
    paddingVertical: 15,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#DCDDFE',
    backgroundColor: '#F0F0FF',
    borderRadius: 12,
    padding: 13,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#065F46',
    fontWeight: '800',
  },
  formCard: {
    backgroundColor: 'rgba(255,255,255,0.79)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E9ECF3',
    padding: 18,
    marginBottom: 22,
  },
  sectionHeading: {
    fontSize: 19,
    fontWeight: '800',
    color: '#20243A',
    marginTop: 8,
    marginBottom: 14,
  },
  inputLabel: {
    color: '#555D70',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginTop: 12,
    marginBottom: 8,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: '#E1E5EF',
    borderRadius: 11,
    backgroundColor: '#FAFBFE',
    paddingHorizontal: 13,
    fontSize: 14,
    color: '#20243A',
    marginBottom: 10,
  },
  choiceList: {
    gap: 8,
    marginBottom: 8,
  },
  choiceRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  choice: {
    borderWidth: 1,
    borderColor: '#E1E5EF',
    backgroundColor: '#FAFBFE',
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  splitChoice: {
    flex: 1,
    alignItems: 'center',
  },
  choiceSelected: {
    backgroundColor: '#F0F0FF',
    borderColor: '#065F46',
  },
  choiceText: {
    color: '#555D70',
    fontSize: 13,
    fontWeight: '600',
  },
  choiceTextSelected: {
    color: '#065F46',
    fontWeight: '800',
  },
  helper: {
    color: '#737B8C',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
    marginBottom: 10,
  },
  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8,
  },
  shareName: {
    flex: 1,
    color: '#20243A',
    fontSize: 13,
    fontWeight: '600',
  },
  shareInput: {
    width: 100,
    height: 42,
    borderWidth: 1,
    borderColor: '#E1E5EF',
    borderRadius: 10,
    backgroundColor: '#FAFBFE',
    textAlign: 'right',
    paddingHorizontal: 10,
    color: '#20243A',
  },
  listCard: {
    backgroundColor: 'rgba(255,255,255,0.79)',
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#E9ECF3',
    padding: 17,
    marginBottom: 13,
  },
  expenseHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  flex: {
    flex: 1,
  },
  expenseTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#20243A',
    marginBottom: 5,
  },
  expenseAmount: {
    color: '#20243A',
    fontSize: 17,
    fontWeight: '800',
  },
  muted: {
    color: '#737B8C',
    fontSize: 12,
    lineHeight: 18,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#F0F0FF',
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 9,
    marginTop: 12,
    marginBottom: 10,
  },
  badgeText: {
    fontSize: 11,
    color: '#065F46',
    fontWeight: '700',
  },
  shareResultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 10,
    paddingBottom: 4,
  },
  shareResultName: {
    color: '#555D70',
    fontSize: 13,
  },
  shareResultAmount: {
    color: '#20243A',
    fontSize: 13,
    fontWeight: '700',
  },
  emptyCard: {
    backgroundColor: 'rgba(255,255,255,0.79)',
    borderWidth: 1,
    borderColor: '#E9ECF3',
    borderRadius: 16,
    padding: 22,
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#20243A',
    marginBottom: 8,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 20,
    marginBottom: 10,
  },
  progressAmount: {
    color: '#20243A',
    fontSize: 12,
    fontWeight: '800',
  },
  progressTrack: {
    height: 9,
    borderRadius: 8,
    backgroundColor: '#E9ECF3',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 8,
    backgroundColor: '#065F46',
  },
  remainingText: {
    color: '#737B8C',
    fontSize: 12,
    marginTop: 9,
    marginBottom: 10,
  },
  contributeBox: {
    marginTop: 14,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#EEF0F5',
  },
  disabled: {
    opacity: 0.6,
  },
  footer: {
    textAlign: 'center',
    color: '#9298A6',
    fontSize: 12,
    marginTop: 20,
  },

  receiptItem: {
    borderTopWidth: 1,
    borderTopColor: '#EEF0F5',
    paddingTop: 12,
    paddingBottom: 10,
    marginTop: 8,
  },

  claimedPeople: {
    marginTop: 8,
    gap: 4,
  },

  claimedPerson: {
    color: '#16805D',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 3,
  },

  unclaimedText: {
    color: '#B7791F',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
  },


  deleteReceiptButton: {
    marginTop: 10,
    padding: 13,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },

  deleteReceiptButtonText: {
    color: '#B91C1C',
    fontSize: 13,
    fontWeight: '800',
  },

  moneySpendingDetails: {
    backgroundColor: 'rgba(255,255,255,0.79)',
    borderRadius: 20,
    padding: 17,
    marginTop: -17,
    marginBottom: 28,
  },

  moneyDetailHeading: {
    fontSize: 16,
    fontWeight: '800',
    color: '#19182D',
    marginBottom: 8,
  },

  moneyDetailNote: {
    fontSize: 11,
    color: '#77758C',
    lineHeight: 17,
  },

  moneyMemberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#EBE9F2',
  },

  moneyMemberAvatar: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: '#E6F8EF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  moneyMemberInitial: {
    color: '#065F46',
    fontWeight: '800',
    fontSize: 16,
  },

  moneyMemberName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#19182D',
  },

  moneyMemberAmount: {
    fontSize: 14,
    fontWeight: '800',
    color: '#19182D',
  },

  moneyOwedPanel: {
    backgroundColor: '#E6F8EF',
    borderRadius: 16,
    padding: 14,
    marginTop: 17,
  },

  moneyOwedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },

  moneyOwedAmount: {
    color: '#178B67',
    fontSize: 14,
    fontWeight: '800',
  },

  spendingVisualCard: {
    backgroundColor: 'rgba(255,255,255,0.79)',
    borderRadius: 22,
    padding: 18,
    marginBottom: 16,
  },

  visualHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },

  visualSubtitle: {
    color: '#77758C',
    fontSize: 10,
    fontWeight: '700',
  },

  spendingChart: {
    height: 150,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },

  chartColumn: {
    flex: 1,
    alignItems: 'center',
    gap: 9,
  },

  chartBarTrack: {
    height: 115,
    width: 24,
    justifyContent: 'flex-end',
  },

  chartBar: {
    width: '100%',
    borderRadius: 8,
  },

  chartDay: {
    fontSize: 10,
    color: '#77758C',
    fontWeight: '600',
  },

  visualFooter: {
    textAlign: 'center',
    color: '#77758C',
    fontSize: 11,
    marginTop: 12,
  },

  calendarNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  calendarMonthText: {
    color: '#065F46',
    fontSize: 12,
    fontWeight: '700',
  },

  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },

  calendarCell: {
    width: '14.2857%',
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },

  calendarSelected: {
    backgroundColor: '#065F46',
  },

  calendarWeekday: {
    fontSize: 11,
    color: '#77758C',
    fontWeight: '700',
  },

  calendarDay: {
    fontSize: 13,
    color: '#19182D',
    fontWeight: '600',
  },

  calendarDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#A99AF8',
    marginTop: 3,
  },

  selectedDatePanel: {
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#EBE9F2',
  },

  calendarExpenseRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EBE9F2',
    gap: 8,
  },

  viewAllExpensesButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#E6F8EF',
    borderRadius: 14,
    padding: 14,
    marginTop: 10,
    marginBottom: 20,
  },

  viewAllExpensesText: {
    color: '#065F46',
    fontWeight: '700',
    fontSize: 13,
  },

  spendingToolsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
    marginBottom: 16,
  },

  spendingToolButton: {
    flex: 1,
    borderRadius: 20,
    padding: 16,
    minHeight: 150,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },

  spendingToolActive: {
    borderColor: '#065F46',
  },

  spendingToolTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#19182D',
    marginTop: 12,
  },

  spendingToolSubtitle: {
    fontSize: 11,
    color: '#77758C',
    marginTop: 4,
    marginBottom: 10,
  },

  balanceCurrencyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#E6F8EF',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#DDD5FF',
  },

  balanceCurrencyText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#065F46',
  },

  premiumCurrencyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#065F46',
    borderRadius: 30,
    paddingLeft: 14,
    paddingRight: 5,
    paddingVertical: 5,
    gap: 9,
    shadowColor: '#065F46',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.25,
    shadowRadius: 9,
    elevation: 5,
  },

  premiumCurrencyLabel: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  premiumSwapCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.79)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  premiumBalanceRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    marginBottom: 18,
  },

  premiumBalanceCard: {
    flex: 1,
    minWidth: 0,
    borderRadius: 22,
    padding: 15,
    minHeight: 170,
    justifyContent: 'space-between',
  },

  oweCard: {
    backgroundColor: '#FFF0EC',
  },

  owedCard: {
    backgroundColor: '#E6F8EF',
  },

  balanceCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },

  balanceIconBox: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },

  balanceTag: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.4,
  },

  balanceCardLabel: {
    color: '#77758C',
    fontSize: 13,
    marginTop: 12,
  },

  balanceCardAmount: {
    color: '#19182D',
    fontSize: 23,
    fontWeight: '800',
    marginTop: 4,
  },

  balanceCardLink: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 12,
  },

  premiumTabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#F0EEF7',
    borderRadius: 20,
    padding: 5,
    marginTop: 14,
    marginBottom: 20,
    gap: 4,
  },

  premiumTab: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 3,
    borderRadius: 16,
    gap: 5,
  },

  premiumTabActive: {
    backgroundColor: '#065F46',
    shadowColor: '#065F46',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 3,
  },

  premiumTabText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#85839A',
  },

  premiumTabTextActive: {
    color: '#FFFFFF',
  },

  premiumTabBadge: {
    position: 'absolute',
    top: 3,
    right: 5,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },

  premiumTabBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  addExpenseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#065F46',
    borderRadius: 20,
    padding: 16,
    gap: 13,
    marginBottom: 18,
    shadowColor: '#065F46',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 4,
  },

  addExpenseIconBox: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  addExpenseTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },

  addExpenseSubtitle: {
    color: '#E6E0FF',
    fontSize: 12,
    marginTop: 4,
  },
  premiumReceiptCard: {
    backgroundColor: 'rgba(255,255,255,0.79)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
    marginBottom: 12,
    overflow: 'hidden',
  },

  premiumReceiptMain: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    gap: 12,
  },

  premiumReceiptIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: '#E6F8EF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  premiumReceiptTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#19182D',
  },

  premiumReceiptSubtitle: {
    fontSize: 12,
    color: '#77758C',
    marginTop: 4,
  },

  premiumReceiptDate: {
    fontSize: 11,
    color: '#AAA6B8',
    marginTop: 3,
  },

  premiumReceiptAmount: {
    fontSize: 15,
    fontWeight: '800',
    color: '#19182D',
  },

  premiumReceiptFooter: {
    borderTopWidth: 1,
    borderTopColor: '#F2F0F7',
    paddingHorizontal: 15,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  premiumReceiptBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },

  premiumReceiptBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#065F46',
  },

  premiumReceiptDelete: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    padding: 5,
  },

  premiumReceiptDeleteText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#C96A57',
  },

  premiumReceiptView: {
    fontSize: 12,
    fontWeight: '700',
    color: '#065F46',
  },

  premiumExpenseCard: {
    backgroundColor: 'rgba(255,255,255,0.79)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
    marginBottom: 12,
    overflow: 'hidden',
  },

  premiumExpenseMain: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    gap: 12,
  },

  premiumExpenseIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: '#E6F8EF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  premiumExpenseTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#19182D',
  },

  premiumExpenseSubtitle: {
    fontSize: 12,
    color: '#77758C',
    marginTop: 4,
  },

  premiumExpenseDate: {
    fontSize: 11,
    color: '#AAA6B8',
    marginTop: 3,
  },

  premiumExpenseAmount: {
    fontSize: 15,
    fontWeight: '800',
    color: '#19182D',
  },

  premiumExpenseDetails: {
    padding: 15,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F2F0F7',
  },

  premiumExpenseSplitBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#E6F8EF',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 10,
  },

  premiumExpenseSplitText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#065F46',
  },

  premiumExpenseShareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },

  premiumExpenseShareName: {
    fontSize: 13,
    color: '#77758C',
  },

  premiumExpenseShareAmount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#19182D',
  },
  premiumFormSectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#19182D',
    marginTop: 20,
    marginBottom: 12,
  },

  payerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },

  payerCard: {
    width: '30%',
    minWidth: 85,
    flexGrow: 1,
    backgroundColor: 'rgba(255,255,255,0.79)',
    borderWidth: 1.5,
    borderColor: '#ECEAF2',
    borderRadius: 18,
    padding: 12,
    alignItems: 'center',
    gap: 8,
  },

  payerCardSelected: {
    backgroundColor: '#F2EEFF',
    borderColor: '#065F46',
  },

  payerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0EEF7',
    alignItems: 'center',
    justifyContent: 'center',
  },

  payerAvatarSelected: {
    backgroundColor: '#065F46',
  },

  payerInitial: {
    fontSize: 16,
    fontWeight: '800',
    color: '#77758C',
  },

  payerName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#19182D',
    textAlign: 'center',
  },

  premiumSplitRow: {
    flexDirection: 'row',
    gap: 12,
  },

  premiumSplitCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: 'rgba(255,255,255,0.79)',
    borderWidth: 1.5,
    borderColor: '#ECEAF2',
    borderRadius: 18,
    padding: 14,
    gap: 9,
    alignItems: 'flex-start',
  },

  premiumSplitSelected: {
    backgroundColor: '#F2EEFF',
    borderColor: '#065F46',
  },

  premiumSplitTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#19182D',
  },

  premiumSplitSubtitle: {
    fontSize: 11,
    color: '#77758C',
    lineHeight: 16,
  },
  splitSummaryCard: {
    backgroundColor: '#F5F2FF',
    borderRadius: 20,
    padding: 18,
    marginTop: 14,
  },

  splitSummaryLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#85839A',
    letterSpacing: 0.8,
  },

  splitSummaryTotal: {
    fontSize: 28,
    fontWeight: '800',
    color: '#065F46',
    marginTop: 7,
  },

  splitSummaryDivider: {
    height: 1,
    backgroundColor: '#E5DFF8',
    marginVertical: 15,
  },

  splitSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  splitSummaryMuted: {
    fontSize: 12,
    color: '#77758C',
  },

  splitSummaryValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#19182D',
  },

  splitProgressTrack: {
    height: 8,
    backgroundColor: '#E3DDF4',
    borderRadius: 10,
    overflow: 'hidden',
    marginVertical: 14,
  },

  splitProgressFill: {
    height: '100%',
    backgroundColor: '#065F46',
    borderRadius: 10,
  },

  splitRemainingValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#178B67',
  },

  customShareCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.79)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 17,
    padding: 12,
    gap: 10,
    marginTop: 9,
  },

  customShareAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E6F8EF',
    justifyContent: 'center',
    alignItems: 'center',
  },

  customShareInitial: {
    fontSize: 15,
    fontWeight: '800',
    color: '#065F46',
  },

  customShareName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#19182D',
  },

  customShareHint: {
    fontSize: 11,
    color: '#85839A',
    marginTop: 3,
  },

  customShareInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E1F0',
    borderRadius: 12,
    paddingHorizontal: 9,
    width: 112,
    height: 42,
    gap: 4,
  },

  customShareCurrency: {
    fontSize: 13,
    fontWeight: '700',
    color: '#065F46',
  },

  customShareInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#19182D',
    paddingVertical: 0,
    minWidth: 0,
  },

  splitValidationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 12,
  },

  splitValidationText: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  premiumSaveExpenseButton: {
    backgroundColor: '#065F46',
    borderRadius: 16,
    paddingVertical: 17,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 20,
    minHeight: 56,
  },

  premiumSaveExpenseDisabled: {
    opacity: 0.45,
  },

  premiumSaveExpenseText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  addContributionCard: {
  backgroundColor: '#065F46',
  borderRadius: 20,
  padding: 18,
  flexDirection: 'row',
  alignItems: 'center',
  gap: 13,
  marginTop: 14,
  marginBottom: 16,
},

addContributionIcon: {
  width: 46,
  height: 46,
  borderRadius: 15,
  backgroundColor: 'rgba(255,255,255,0.18)',
  justifyContent: 'center',
  alignItems: 'center',
},

addContributionTitle: {
  color: '#FFFFFF',
  fontSize: 16,
  fontWeight: '800',
},

addContributionSubtitle: {
  color: '#E7E1FF',
  fontSize: 12,
  marginTop: 5,
},
premiumContributionCard: {
  backgroundColor: 'rgba(255,255,255,0.79)',
  borderRadius: 22,
  padding: 18,
  marginTop: 12,
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.92)',
},

contributionHeader: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 12,
},

contributionIconBox: {
  width: 48,
  height: 48,
  borderRadius: 16,
  backgroundColor: '#E6F8EF',
  justifyContent: 'center',
  alignItems: 'center',
},

contributionTitle: {
  fontSize: 16,
  fontWeight: '800',
  color: '#19182D',
},

contributionSubtitle: {
  fontSize: 12,
  color: '#85839A',
  marginTop: 4,
},

contributionAmountPanel: {
  backgroundColor: '#F5F2FF',
  borderRadius: 18,
  padding: 17,
  marginTop: 17,
},

contributionAmountLabel: {
  fontSize: 11,
  fontWeight: '800',
  letterSpacing: 0.7,
  color: '#85839A',
},

contributionAmount: {
  fontSize: 28,
  fontWeight: '800',
  color: '#065F46',
  marginTop: 7,
},

contributionTargetText: {
  fontSize: 12,
  color: '#77758C',
  marginTop: 4,
},

contributionProgressTrack: {
  height: 9,
  backgroundColor: '#E3DDF4',
  borderRadius: 10,
  overflow: 'hidden',
  marginTop: 16,
},

contributionProgressFill: {
  height: '100%',
  backgroundColor: '#065F46',
  borderRadius: 10,
},

contributionProgressFooter: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginTop: 10,
  gap: 8,
},

contributionProgressPercent: {
  fontSize: 12,
  fontWeight: '700',
  color: '#065F46',
},

contributionRemaining: {
  fontSize: 12,
  fontWeight: '700',
  color: '#178B67',
},

contributionMembersSection: {
  marginTop: 20,
},

contributionSectionLabel: {
  fontSize: 11,
  fontWeight: '800',
  color: '#85839A',
  letterSpacing: 0.7,
  marginBottom: 12,
},

contributionMemberRow: {
  flexDirection: 'row',
  alignItems: 'center',
  paddingVertical: 9,
  gap: 10,
  borderBottomWidth: 1,
  borderBottomColor: '#F1EFF6',
},

contributionMemberAvatar: {
  width: 35,
  height: 35,
  borderRadius: 18,
  backgroundColor: '#E6F8EF',
  justifyContent: 'center',
  alignItems: 'center',
},

contributionMemberInitial: {
  fontSize: 13,
  fontWeight: '800',
  color: '#065F46',
},

contributionMemberName: {
  flex: 1,
  fontSize: 13,
  fontWeight: '700',
  color: '#19182D',
},

contributionMemberAmount: {
  fontSize: 13,
  fontWeight: '800',
  color: '#065F46',
},

premiumContributeBox: {
  marginTop: 20,
  paddingTop: 16,
  borderTopWidth: 1,
  borderTopColor: '#EFEDF5',
},

contributionInputRow: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 10,
},

contributionInputWrapper: {
  flex: 1,
  flexDirection: 'row',
  alignItems: 'center',
  borderWidth: 1,
  borderColor: '#E5E1F0',
  borderRadius: 13,
  paddingHorizontal: 13,
  height: 48,
  gap: 7,
},

contributionCurrencySymbol: {
  fontSize: 14,
  fontWeight: '800',
  color: '#065F46',
},

contributionAmountInput: {
  flex: 1,
  fontSize: 15,
  fontWeight: '700',
  color: '#19182D',
},

premiumContributeButton: {
  backgroundColor: '#065F46',
  borderRadius: 13,
  height: 48,
  paddingHorizontal: 18,
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
},

premiumContributeButtonText: {
  color: '#FFFFFF',
  fontSize: 14,
  fontWeight: '800',
},

contributionCompletedRow: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 8,
  marginTop: 16,
},

contributionCompletedText: {
  color: '#178B67',
  fontSize: 13,
  fontWeight: '700',
},
  moneyHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 26 },
  moneyBrandIcon: { width: 39, height: 39, borderRadius: 13, backgroundColor: '#065F46', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  moneyBrand: { fontSize: 26, fontWeight: '900', color: '#19182D', letterSpacing: -1.4 },
  moneyTitle: { fontSize: 31, fontWeight: '900', letterSpacing: -1.2, color: '#19182D' },
  moneySubtitle: { color: '#77758C', fontSize: 14, marginTop: 6, marginBottom: 26 },
  moneyProfileButton: { width: 43, height: 43, borderRadius: 15, backgroundColor: '#EDE8FF', alignItems: 'center', justifyContent: 'center' },
  moneyProfileInitial: { fontSize: 18, fontWeight: '800', color: '#065F46' },
  moneySectionRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 },
  moneySectionTitle: { fontSize: 21, fontWeight: '800', color: '#19182D', letterSpacing: -0.6 },
  moneySectionHint: { color: '#9290A3', fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  moneyBalanceRow: { flexDirection: 'row', gap: 12, marginBottom: 27 },
  moneyBalanceCard: { flex: 1, minWidth: 0, borderRadius: 22, padding: 17, minHeight: 143, justifyContent: 'space-between' },
  moneyBalanceLabel: { fontSize: 12, color: '#555267', fontWeight: '600' },
  moneyBalanceAmount: { fontSize: 25, fontWeight: '900', color: '#19182D', marginTop: 12 },
  moneySpendingCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: 'rgba(255,255,255,0.79)', borderRadius: 20, padding: 17, marginBottom: 28 },
  moneySpendingIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: '#E6F8EF', alignItems: 'center', justifyContent: 'center' },
  moneySpendingLabel: { fontSize: 12, color: '#77758C', fontWeight: '600' },
  moneySpendingAmount: { fontSize: 26, color: '#19182D', fontWeight: '900', marginTop: 4 },
  moneySpendingMeta: { fontSize: 11, color: '#77758C', marginTop: 5 },

});

const settleDesign = StyleSheet.create({
  heroCTA:{backgroundColor:'rgba(255,255,255,0.79)',padding:13,borderRadius:13,flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:14},
  heroCTAText:{color:'#065F46',fontWeight:'700',fontSize:14},
  spendingCard:{backgroundColor:'rgba(255,255,255,0.91)',padding:17,borderRadius:20,flexDirection:'row',alignItems:'center',gap:14,marginBottom:22,marginTop:12,borderWidth:1,borderColor:'#FFFFFF',shadowColor:'#065F46',shadowOpacity:0.06,shadowRadius:12,elevation:2},
  spendingIcon:{backgroundColor:'#E6F8EF',borderRadius:13,padding:12},spendingEyebrow:{fontSize:10,color:'#928AA3',fontWeight:'700',letterSpacing:0.7},spendingAmount:{fontSize:23,color:'#2B2540',fontWeight:'800',marginTop:4},spendingMeta:{fontSize:12,color:'#8D849C',marginTop:3},
  heading:{fontSize:23,fontWeight:'800',color:'#2E2542',marginTop:12},description:{color:'#8B839B',fontSize:13,marginTop:5,marginBottom:15,lineHeight:19},groupHeading:{fontSize:18,fontWeight:'800',color:'#302744',marginTop:20,marginBottom:11},
  personCard:{backgroundColor:'rgba(255,255,255,0.79)',borderRadius:20,marginBottom:12,overflow:'hidden'},personRow:{flexDirection:'row',alignItems:'center',padding:15,gap:12},personRowCard:{backgroundColor:'rgba(255,255,255,0.79)',borderRadius:18,flexDirection:'row',alignItems:'center',padding:15,gap:12,marginBottom:10},avatar:{width:46,height:46,borderRadius:23,backgroundColor:'#F7DFD8',alignItems:'center',justifyContent:'center'},avatarText:{fontWeight:'800',fontSize:19,color:'#A05A49'},personTitle:{fontSize:15,fontWeight:'700',color:'#302744'},personAmount:{fontSize:19,fontWeight:'800',color:'#302744',marginTop:3},owedAmount:{fontSize:16,fontWeight:'800',color:'#32835D'},detailMuted:{fontSize:12,color:'#8B839B',lineHeight:18,marginTop:3},settlePill:{backgroundColor:'#065F46',borderRadius:12,paddingHorizontal:15,paddingVertical:11},settlePillText:{color:'#FFFFFF',fontWeight:'700',fontSize:13},
  detailArea:{padding:15,borderTopWidth:1,borderTopColor:'#F0EDF6',backgroundColor:'#FDFBFF'},detailHeading:{fontSize:16,fontWeight:'800',color:'#302744'},expenseItem:{backgroundColor:'rgba(255,255,255,0.79)',borderRadius:14,padding:13,marginTop:12,borderWidth:1,borderColor:'#F0EDF6'},expenseTop:{flexDirection:'row',justifyContent:'space-between',gap:10},expenseTitle:{fontSize:14,fontWeight:'700',color:'#302744',flex:1},expenseAmount:{fontSize:14,fontWeight:'800',color:'#302744'},pendingText:{fontSize:12,color:'#A77B38',marginTop:8},fieldLabel:{fontSize:12,color:'#797188',marginTop:13,marginBottom:7},payRow:{flexDirection:'row',gap:8,alignItems:'center'},amountInput:{flex:1,borderWidth:1,borderColor:'#E7E1F1',borderRadius:11,padding:11,fontSize:17,color:'#302744'},fullPill:{backgroundColor:'#EEE9FC',borderRadius:10,paddingVertical:13,paddingHorizontal:16},fullPillText:{fontWeight:'700',color:'#065F46'},confirmButton:{backgroundColor:'#065F46',borderRadius:12,padding:13,marginTop:10,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:10},confirmText:{color:'#FFFFFF',fontWeight:'700'},disclaimer:{fontSize:11,color:'#8B839B',lineHeight:17,marginTop:12},empty:{fontSize:13,color:'#91899F',padding:14,backgroundColor:'rgba(255,255,255,0.79)',borderRadius:14},attentionBox:{backgroundColor:'#FFF3E5',padding:14,borderRadius:18,marginBottom:8},attentionHeading:{fontSize:15,fontWeight:'800',color:'#805A2B',marginBottom:10},approvalCard:{backgroundColor:'rgba(255,255,255,0.79)',borderRadius:13,padding:12,marginTop:8},actionButtons:{flexDirection:'row',gap:9,marginTop:12},primarySmall:{backgroundColor:'#065F46',padding:11,borderRadius:10,flex:1,alignItems:'center'},primarySmallText:{color:'#FFFFFF',fontWeight:'700',fontSize:12},secondarySmall:{backgroundColor:'#F4F0FB',padding:11,borderRadius:10,flex:1,alignItems:'center'},secondarySmallText:{color:'#065F46',fontWeight:'700',fontSize:12},historyRow:{backgroundColor:'rgba(255,255,255,0.79)',borderRadius:13,padding:13,flexDirection:'row',alignItems:'center',marginBottom:8,gap:12},
});

const moneyTheme = StyleSheet.create({
  workspaceRow: { flexDirection: 'row', gap: 8, marginBottom: 24 },
  workspaceButton: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15, paddingHorizontal: 5, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.90)', borderWidth: 1, borderColor: '#D9EAE2', shadowColor: '#065F46', shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 },
  workspaceText: { fontSize: 11, fontWeight: '700', color: '#065F46' },
});

// Matches the Shopping tab's roomie brand, spacious title, frosted surfaces and soft ambient glow.
const moneyGlass = StyleSheet.create({
  ambientOrbTop: { position:'absolute', top:115, right:-90, width:290, height:290, borderRadius:145, backgroundColor:'rgba(88,175,137,0.12)' },
  ambientOrbBottom: { position:'absolute', top:510, left:-120, width:310, height:310, borderRadius:155, backgroundColor:'rgba(94,196,151,0.10)' },
  brandRow: { flexDirection:'row', alignItems:'center', marginBottom:26 },
  brandIcon: { width:39, height:39, borderRadius:13, backgroundColor:'#065F46', alignItems:'center', justifyContent:'center', marginRight:10 },
  brand: { fontSize:26, fontWeight:'900', color:'#1E293B', letterSpacing:-1.4 },
  apartmentPill: { maxWidth:'45%', flexDirection:'row', gap:5, alignItems:'center', backgroundColor:'rgba(255,255,255,0.77)', borderWidth:1, borderColor:'rgba(255,255,255,0.96)', borderRadius:20, paddingHorizontal:11, paddingVertical:8 },
  apartmentText: { color:'#065F46', fontSize:11, fontWeight:'700', flexShrink:1 },
  titleRow: { flexDirection:'row', alignItems:'flex-start', gap:9, marginBottom:20 },
  heading: { fontSize:31, fontWeight:'900', letterSpacing:-1.2, color:'#1E293B' },
  subtitle: { color:'#64748B', fontSize:13, marginTop:6, lineHeight:19 },
  currencyPill: { marginTop:5, backgroundColor:'rgba(255,255,255,0.84)', borderWidth:1, borderColor:'#FFFFFF', paddingHorizontal:10, paddingVertical:10, borderRadius:20, flexDirection:'row', alignItems:'center', gap:5 },
  currencyText: { color:'#065F46', fontSize:11, fontWeight:'800' },
  heroOrb: { position:'absolute', right:-65, top:-100, width:215, height:215, borderRadius:110, backgroundColor:'rgba(255,255,255,0.13)' },
  heroSheen: { position:'absolute', left:-65, top:-125, width:220, height:220, borderRadius:110, backgroundColor:'rgba(255,255,255,0.09)' },
});
