
import { useCallback, useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { fetch } from 'expo/fetch';
import { loadSession } from '../../session';

const API_URL = process.env.EXPO_PUBLIC_API_URL;
type Claim = {
  memberId: string;
  member?: {
    id: string;
    name?: string;
  };
};

type ReceiptItem = {
  id: string;
  name: string;
  quantity: number | string;
  unitPrice: number | string;
  totalPrice: number | string;
  claims: Claim[];
};

type ReceiptAdjustment = {
  id: string;
  description: string;
  type: string;
  amount: number | string;
  alreadyIncluded: boolean;
};

type Receipt = {
  id: string;
  store: string | null;
  currency: string;
  total: number | string;
  status: string;
  uploaderId: string;
  items: ReceiptItem[];
  adjustments: ReceiptAdjustment[];
};

type Member = { id: string; name: string };

function calculateShares(receipt: Receipt) {
  const totals = new Map<string, number>();
  let allocated = 0;

  for (const item of receipt.items) {
    const cents = Math.round(Number(item.totalPrice) * 100);
    const claimants = [
      ...new Set(item.claims.map(c => c.memberId)),
    ];

    const participants = claimants.length
      ? claimants.sort()
      : [receipt.uploaderId];

    const base = Math.floor(cents / participants.length);
    const remainder = cents % participants.length;

    participants.forEach((id, index) => {
      totals.set(
        id,
        (totals.get(id) || 0) +
        base +
        (index < remainder ? 1 : 0)
      );
    });

    allocated += cents;
  }

  const adjustmentCents = (receipt.adjustments || [])
    .filter(a => !a.alreadyIncluded)
    .reduce(
      (sum, a) => sum + Math.round(Number(a.amount) * 100),
      0
    );

  const totalCents = Math.round(Number(receipt.total) * 100);
  const difference = totalCents - allocated;
  const matched = allocated + adjustmentCents === totalCents;

  if (matched && allocated > 0) {
    const allocations = [...totals.entries()]
      .filter(([, cents]) => cents > 0)
      .map(([id, cents]) => {
        const exact = (cents * totalCents) / allocated;
        const base = Math.floor(exact);

        return {
          id,
          cents: base,
          fraction: exact - base,
        };
      });

    let remaining =
      totalCents -
      allocations.reduce((sum, a) => sum + a.cents, 0);

    allocations.sort(
      (a, b) =>
        b.fraction - a.fraction ||
        a.id.localeCompare(b.id)
    );

    for (let i = 0; i < remaining; i++) {
      allocations[i].cents += 1;
    }

    totals.clear();

    allocations.forEach(a => {
      totals.set(a.id, a.cents);
    });
  }

  return {
    totals,
    difference,
    adjustmentCents,
    matched,
  };
}

export default function ReceiptDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [memberId, setMemberId] = useState('');
  const [apartmentCode, setApartmentCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [paidById, setPaidById] = useState('');
  const [finalizing, setFinalizing] = useState(false);

  const loadReceipt = useCallback(async () => {
    if (!id) {
      Alert.alert('Receipt not found', 'No receipt ID was provided.');
      setLoading(false);
      return;
    }

    try {
      const session = await loadSession();

      if (!session?.code || !session.memberId) {
        Alert.alert(
          'Session not found',
          'Please return to Roomie and log in again.'
        );
        setLoading(false);
        return;
      }

      setMemberId(session.memberId);
      setApartmentCode(session.code);

      const response = await fetch(
        `${API_URL}/api/receipts/${encodeURIComponent(id)}?apartmentCode=${encodeURIComponent(session.code)}&memberId=${encodeURIComponent(session.memberId)}`
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Could not load this receipt.');
      }

      setReceipt(data.receipt);

      // Load roommates separately so a Money API error
      // does not prevent receipt claims from working.
      try {
        const moneyResponse = await fetch(
          `${API_URL}/api/apartments/${encodeURIComponent(session.code)}/money`
        );

        const moneyData = await moneyResponse.json();

        if (!moneyResponse.ok) {
          throw new Error(
            moneyData.error || 'Could not load roommates.'
          );
        }

        const list: Member[] = moneyData.members || [];

        setMembers(list);

        // Explicit payer selection is required.
        // Do not automatically assume the uploader paid.
        setPaidById((current: string) =>
          list.some((m: Member) => m.id === current)
            ? current
            : ''
        );

      } catch (moneyError) {
        console.warn('Could not load roommate list:', moneyError);
      }

    } catch (error) {
      Alert.alert(
        'Could not load receipt',
        error instanceof Error
          ? error.message
          : 'Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadReceipt();
  }, [loadReceipt]);

  async function toggleClaim(item: ReceiptItem) {
    if (!receipt || !memberId || !apartmentCode) {
      Alert.alert('Please wait', 'Receipt details are still loading.');
      return;
    }

    if (receipt.status !== 'OPEN') {
      Alert.alert('Receipt closed', 'This receipt is no longer open for claims.');
      return;
    }

    if (busyItemId) {
      return;
    }

    const alreadyClaimed = item.claims.some(
      (claim) => claim.memberId === memberId
    );

    setBusyItemId(item.id);

    try {
      const response = await fetch(
        `${API_URL}/api/receipts/${encodeURIComponent(receipt.id)}/items/${encodeURIComponent(item.id)}/claim`,
        {
          method: alreadyClaimed ? 'DELETE' : 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            apartmentCode,
            memberId,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Could not update your claim.');
      }

      await loadReceipt();
    } catch (error) {
      Alert.alert(
        'Claim failed',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setBusyItemId(null);
    }
  }

  async function finalizeReceipt() {
    if (!receipt || !apartmentCode || !memberId || !paidById || finalizing || busyItemId) return;
    if (receipt.status !== 'OPEN') return;
    const { matched } = calculateShares(receipt);

    if (!matched) {
      Alert.alert(
        'Receipt needs review',
        'Product prices and saved adjustments do not match the receipt total. Please check the original receipt before finalizing.'
      );
      return;
    }
    const payer = members.find(m => m.id === paidById);
    if (!payer) return;
    Alert.alert(
      'Finalize receipt?',
      `Paid by: ${payer.name}\nTotal: ${Number(receipt.total).toFixed(2)} ${receipt.currency}\n\nThis will create an expense and close product claims.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Finalize', onPress: async () => {
            setFinalizing(true);
            try {
              const response = await fetch(
                `${API_URL}/api/receipts/${encodeURIComponent(receipt.id)}/finalize`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ apartmentCode, memberId, paidById }),
                }
              );
              const data = await response.json();
              if (!response.ok) throw new Error(data.error || 'Could not finalize receipt.');
              await loadReceipt();
              Alert.alert('Receipt finalized', 'Expense created successfully. You can view it in Money.');
            } catch (error) {
              Alert.alert('Finalization failed', error instanceof Error ? error.message : 'Please try again.');
            } finally {
              setFinalizing(false);
            }
          }
        },
      ]
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#9A3412" />
          <Text style={styles.muted}>Loading receipt...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!receipt) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <Text style={styles.heading}>Receipt unavailable</Text>
          <Pressable style={styles.button} onPress={() => router.back()}>
            <Text style={styles.buttonText}>Go Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const currency = receipt.currency || 'EUR';

  const {
    totals: previewShares,
    difference,
    adjustmentCents,
    matched,
  } = calculateShares(receipt);
  const myTotal = (previewShares.get(memberId) || 0) / 100;
  const canFinalize = receipt.status === 'OPEN' && receipt.uploaderId === memberId;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={17} color="#9A3412" /><Text style={styles.backText}>Back</Text>
        </Pressable>

        <View style={styles.titleRow}>
          <View style={styles.storeBadge}><Ionicons name="storefront-outline" size={22} color="#9A3412" /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>SMART RECEIPT · CLAIM ITEMS</Text>
            <Text style={styles.heading}>{receipt.store || 'Saved Receipt'}</Text>
          </View>
        </View>

        <Text style={styles.muted}>
          Select the products you used. You can share a product with other
          roommates by claiming it too.
        </Text>

        <View style={styles.summary}>
          <View style={styles.summaryTop}>
            <View style={styles.summaryIcon}><Ionicons name="receipt-outline" size={20} color="#FFFFFF" /></View>
            <Text style={styles.summaryEyebrow}>RECEIPT OVERVIEW</Text>
          </View>
          <Text style={styles.summaryLabel}>Full receipt total</Text>
          <Text style={styles.summaryAmount}>
            {Number(receipt.total).toFixed(2)} {currency}
          </Text>
          <View style={styles.summaryDivider} />
          <Text style={styles.summaryLabel}>Your estimated final share</Text>
          <Text style={styles.myAmount}>
            {myTotal.toFixed(2)} {currency}
          </Text>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Products</Text>
          <View style={styles.countBadge}><Text style={styles.countText}>{receipt.items.length} items</Text></View>
        </View>

        {receipt.items.map((item) => {
          const claimedByMe = item.claims.some(
            (claim) => claim.memberId === memberId
          );

          const claimCount = item.claims.length;
          const itemTotal = Number(item.totalPrice);
          const eachShare =
            claimCount > 0
              ? Math.round((itemTotal / claimCount) * 100) / 100
              : itemTotal;

          return (
            <View key={item.id} style={styles.productCard}>
              <View style={styles.productHeading}>
                <View style={styles.productIcon}><Ionicons name="basket-outline" size={19} color="#9A3412" /></View>
                <Text style={[styles.productName, { flex: 1 }]}>{item.name}</Text>
                {claimedByMe && <Ionicons name="checkmark-circle" size={22} color="#065F46" />}
              </View>

              <Text style={styles.productDetail}>
                Quantity: {Number(item.quantity)}
              </Text>

              <View style={styles.priceRow}>
                <Text style={styles.productPrice}>{itemTotal.toFixed(2)} {currency}</Text>
                <View style={[styles.statusBadge, claimedByMe ? styles.statusClaimed : claimCount ? styles.statusShared : styles.statusUnclaimed]}>
                  <Text style={[styles.statusText, claimedByMe ? styles.statusClaimedText : claimCount ? styles.statusSharedText : styles.statusUnclaimedText]}>
                    {claimedByMe ? 'Claimed by you' : claimCount ? 'Shared item' : 'Available'}
                  </Text>
                </View>
              </View>

              {claimCount > 0 ? (
                <>
                  <Text style={styles.productDetail}>
                    {claimCount} {claimCount === 1 ? 'person' : 'people'} claimed
                    {' · '}about {eachShare.toFixed(2)} {currency} each
                  </Text>

                  {item.claims.map((claim) => (
                    <Text key={claim.memberId} style={styles.claimName}>
                      • {claim.member?.name || 'Roommate'}
                      {claim.memberId === memberId ? ' (You)' : ''}
                    </Text>
                  ))}
                </>
              ) : (
                <Text style={styles.unclaimed}>Not claimed yet</Text>
              )}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={claimedByMe ? 'Remove my claim' : 'Claim this product'}
                style={({ pressed }) => [
                  styles.button,
                  claimedByMe && styles.removeButton,
                  (busyItemId !== null || receipt.status !== 'OPEN') && styles.disabledButton,
                  pressed && receipt.status === 'OPEN' && busyItemId === null && styles.pressedButton,
                ]}
                onPress={() => void toggleClaim(item)}
                disabled={busyItemId !== null || receipt.status !== 'OPEN'}
              >
                <View style={styles.buttonContents}>
                  {busyItemId === item.id ? (
                    <ActivityIndicator color={claimedByMe ? '#075E47' : '#FFFFFF'} />
                  ) : (
                    <>
                      <Ionicons
                        name={receipt.status !== 'OPEN' ? 'lock-closed-outline' : claimedByMe ? 'checkmark-circle-outline' : 'add-circle-outline'}
                        size={20}
                        color={claimedByMe ? '#075E47' : '#FFFFFF'}
                      />
                      <Text style={[styles.buttonText, claimedByMe && styles.removeButtonText]}>
                        {receipt.status !== 'OPEN'
                          ? 'Receipt Finalized'
                          : claimedByMe
                            ? 'Remove My Claim'
                            : 'I Want This'}
                      </Text>
                    </>
                  )}
                </View>
              </Pressable>
            </View>
          );
        })}

        <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Expense preview</Text><Ionicons name="people-outline" size={20} color="#9A3412" /></View>
        <View style={styles.summary}>
          {members.filter(m => (previewShares.get(m.id) || 0) > 0).map(m => (
            <View key={m.id} style={styles.previewRow}>
              <Text style={styles.productDetail}>{m.name}{m.id === memberId ? ' (You)' : ''}</Text>
              <Text style={styles.productName}>{((previewShares.get(m.id) || 0) / 100).toFixed(2)} {currency}</Text>
            </View>
          ))}
          {(receipt.adjustments || []).map(adjustment => (
            <Text key={adjustment.id} style={styles.productDetail}>
              {adjustment.description}: {Number(adjustment.amount).toFixed(2)} {currency}
              {adjustment.alreadyIncluded ? ' (already included)' : ''}
            </Text>
          ))}

          <Text
            style={[
              styles.productDetail,
              { marginTop: 10, color: matched ? '#15803D' : '#B45309' },
            ]}
          >
            {matched
              ? '✓ Receipt totals reconciled'
              : `⚠ Unexplained difference: ${(
                (difference - adjustmentCents) / 100
              ).toFixed(2)} ${currency}. Review required.`}
          </Text>
          <Text style={styles.footerNote}>Unclaimed products are assigned to the uploader. Final amounts are calculated by the server.</Text>
        </View>

        {canFinalize && (
          <View style={styles.summary}>
            <Text style={styles.sectionTitle}>Who paid?</Text>
            <Text style={styles.productDetail}>Select the roommate who paid for this receipt.</Text>
            {members.map(m => (
              <Pressable key={m.id} onPress={() => setPaidById(m.id)} style={[styles.payerOption, paidById === m.id && styles.payerSelected]} disabled={finalizing}>
                <Text style={styles.productName}>{paidById === m.id ? '◉ ' : '○ '}{m.name}</Text>
              </Pressable>
            ))}
            <Pressable
              style={[styles.button, (!paidById || finalizing || busyItemId !== null || !matched) && styles.disabledButton]}
              disabled={!paidById || finalizing || busyItemId !== null || !matched}
              onPress={() => void finalizeReceipt()}
            >
              {finalizing ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Finalize Receipt</Text>}
            </Pressable>
          </View>
        )}
        {receipt.status !== 'OPEN' && <Text style={styles.footerNote}>This receipt has been finalized. Product claims are closed.</Text>}
        {receipt.status === 'OPEN' && !canFinalize && <Text style={styles.footerNote}>Only the person who uploaded this receipt can finalize it.</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F2F7F4' },
  container: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 64 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
  backButton: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 11, paddingHorizontal: 15, backgroundColor: 'rgba(255,255,255,0.88)', borderColor: '#FFFFFF', borderWidth: 1, borderRadius: 14, marginBottom: 26 },
  backText: { color: '#075E47', fontWeight: '800', fontSize: 13 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 12 },
  storeBadge: { width: 52, height: 52, borderRadius: 17, backgroundColor: '#E2F4EC', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#BCE5D2' },
  eyebrow: { fontSize: 10, letterSpacing: 1.2, fontWeight: '800', color: '#075E47', marginBottom: 5 },
  heading: { fontSize: 28, fontWeight: '900', color: '#1E293B', letterSpacing: -0.7 },
  muted: { color: '#64748B', fontSize: 14, lineHeight: 22, marginBottom: 24 },
  summary: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 20, borderWidth: 1, borderColor: '#FFFFFF', marginBottom: 27, shadowColor: '#064E3B', shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  summaryTop: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 17 },
  summaryIcon: { width: 35, height: 35, borderRadius: 12, backgroundColor: '#075E47', alignItems: 'center', justifyContent: 'center' },
  summaryEyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.1, color: '#075E47' },
  summaryLabel: { color: '#64748B', fontSize: 13, marginBottom: 7, fontWeight: '600' },
  summaryAmount: { color: '#1E293B', fontSize: 30, fontWeight: '900', marginBottom: 13 },
  summaryDivider: { height: 1, backgroundColor: '#E2E8F0', marginBottom: 17 },
  myAmount: { color: '#075E47', fontSize: 26, fontWeight: '900' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 },
  sectionTitle: { color: '#1E293B', fontSize: 21, fontWeight: '900', letterSpacing: -0.4, marginBottom: 8 },
  countBadge: { paddingVertical: 7, paddingHorizontal: 11, borderRadius: 20, backgroundColor: '#E2F4EC' },
  countText: { color: '#075E47', fontSize: 11, fontWeight: '800' },
  productCard: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#E1EBE6', marginBottom: 13, shadowColor: '#1E293B', shadowOpacity: 0.045, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  productHeading: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 12 },
  productIcon: { width: 39, height: 39, borderRadius: 13, backgroundColor: '#ECF8F2', alignItems: 'center', justifyContent: 'center' },
  productName: { color: '#1E293B', fontSize: 15, fontWeight: '800', lineHeight: 21 },
  productDetail: { color: '#64748B', fontSize: 13, lineHeight: 20 },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginVertical: 11 },
  productPrice: { color: '#1E293B', fontSize: 23, fontWeight: '900' },
  statusBadge: { borderRadius: 20, paddingVertical: 6, paddingHorizontal: 9 },
  statusUnclaimed: { backgroundColor: '#ECF8F2' },
  statusClaimed: { backgroundColor: '#DCFCE7' },
  statusShared: { backgroundColor: '#E0F2FE' },
  statusText: { fontSize: 10, fontWeight: '800' },
  statusUnclaimedText: { color: '#075E47' },
  statusClaimedText: { color: '#065F46' },
  statusSharedText: { color: '#0369A1' },
  claimName: { color: '#065F46', fontSize: 12, marginTop: 5, fontWeight: '600' },
  unclaimed: { color: '#A16207', fontSize: 12, marginTop: 6 },
  button: { backgroundColor: '#075E47', borderRadius: 14, minHeight: 54, alignItems: 'center', justifyContent: 'center', marginTop: 15, paddingHorizontal: 14 },
  buttonContents: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  removeButton: { backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#075E47' },
  removeButtonText: { color: '#075E47' },
  disabledButton: { opacity: 0.58 },
  pressedButton: { opacity: 0.82 },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  previewRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 8, gap: 12 },
  payerOption: { padding: 14, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 14, marginTop: 9, backgroundColor: '#FFFFFF' },
  payerSelected: { borderColor: '#9A3412', backgroundColor: '#ECF8F2' },
  footerNote: { color: '#64748B', fontSize: 12, lineHeight: 19, marginTop: 12 },
});
