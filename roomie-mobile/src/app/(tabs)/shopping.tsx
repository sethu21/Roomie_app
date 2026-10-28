import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Pressable, RefreshControl,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApartment } from '../../context/ApartmentContext';

const API_URL = process.env.EXPO_PUBLIC_API_URL;
const C = {
  bg: '#F7F4FC', ink: '#1E293B', muted: '#64748B', purple: '#7138A8',
  purpleSoft: '#F3E8FF', line: '#E9DFF1', mint: '#E6F8EF', green: '#065F46',
  amber: '#C67A2A', amberSoft: '#FFF1DF', white: '#FFFFFF', red: '#D96573',
};

type ShoppingItem = {
  id: string;
  name: string;
  quantity: string;
  requiredQuantity: string | number | null;
  purchasedQuantity: string | number;
  isPurchased: boolean;
  addedBy?: { id: string; name: string } | null;
};
type Tab = 'toBuy' | 'purchased';

function progressOf(item: ShoppingItem) {
  const required = item.requiredQuantity == null ? null : Number(item.requiredQuantity);
  const purchased = Math.max(0, Number(item.purchasedQuantity) || 0);
  if (required == null || !Number.isFinite(required) || required <= 0) {
    return { required: null as number | null, purchased, remaining: null as number | null, percent: item.isPurchased ? 100 : 0, partial: false };
  }
  return {
    required, purchased, remaining: Math.max(0, required - purchased),
    percent: item.isPurchased ? 100 : Math.min(100, (purchased / required) * 100),
    partial: !item.isPurchased && purchased > 0 && purchased < required,
  };
}
const fmt = (n: number) => Number(n.toFixed(3)).toString();

async function requestJson(url: string, options?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let result: any = {};
    try { result = text ? JSON.parse(text) : {}; } catch { throw new Error('Server returned an invalid response.'); }
    if (!response.ok) throw new Error(result.error || `Server error (${response.status})`);
    return result;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timed out. Check your phone connection to the Roomie backend.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export default function ShoppingScreen() {
  const router = useRouter();
  const { session, loading: sessionLoading } = useApartment();
  const code = session?.code ?? '';
  const apartmentName = session?.apartmentName ?? 'Shared apartment';
  const memberId = session?.memberId ?? '';
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('toBuy');
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadShopping = useCallback(async (showSpinner = true) => {
    if (!code || !memberId) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (showSpinner) setLoading(true);
    setErrorMessage(null);
    try {
      const result = await requestJson(`${API_URL}/api/apartments/${encodeURIComponent(code)}/shopping`);
      setItems(Array.isArray(result.items) ? result.items : []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not load shopping list.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [code, memberId]);

  useFocusEffect(useCallback(() => {
    if (!sessionLoading) void loadShopping();
  }, [sessionLoading, loadShopping]));

  const pending = useMemo(() => items.filter(i => !i.isPurchased), [items]);
  const purchased = useMemo(() => items.filter(i => i.isPurchased), [items]);
  const completion = items.length ? Math.round((purchased.length / items.length) * 100) : 0;
  const visible = useMemo(() => (tab === 'toBuy' ? pending : purchased)
    .filter(i => i.name.toLowerCase().includes(search.trim().toLowerCase())), [tab, pending, purchased, search]);

  async function addItem() {
    if (!name.trim()) return Alert.alert('Product name needed', 'Enter the product you want to add.');
    if (!code || !memberId) return Alert.alert('Session missing', 'Open your apartment again.');
    setSaving(true);
    try {
      await requestJson(`${API_URL}/api/apartments/${encodeURIComponent(code)}/shopping`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), quantity: quantity.trim() || '1', memberId }),
      });
      setName(''); setQuantity('1'); setShowForm(false); setTab('toBuy'); setSearch('');
      await loadShopping(false);
    } catch (error) {
      Alert.alert('Could not add product', error instanceof Error ? error.message : 'Please try again.');
    } finally { setSaving(false); }
  }

  async function togglePurchased(item: ShoppingItem) {
    if (busyId) return;
    setBusyId(item.id);
    try {
      await requestJson(`${API_URL}/api/apartments/${encodeURIComponent(code)}/shopping/${encodeURIComponent(item.id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId, isPurchased: !item.isPurchased }),
      });
      await loadShopping(false);
    } catch (error) {
      Alert.alert('Update failed', error instanceof Error ? error.message : 'Please try again.');
    } finally { setBusyId(null); }
  }

  function confirmDelete(item: ShoppingItem) {
    Alert.alert('Remove product?', `Delete ${item.name} from the shared list?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          setBusyId(item.id);
          try {
            await requestJson(`${API_URL}/api/apartments/${encodeURIComponent(code)}/shopping/${encodeURIComponent(item.id)}`, {
              method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberId }),
            });
            await loadShopping(false);
          } catch (error) {
            Alert.alert('Delete failed', error instanceof Error ? error.message : 'Please try again.');
          } finally { setBusyId(null); }
        }
      },
    ]);
  }

  const renderItem = ({ item }: { item: ShoppingItem }) => {
    const p = progressOf(item);
    const done = item.isPurchased;
    return (
      <View style={styles.itemCard}>
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: done, disabled: busyId !== null }}
          onPress={() => void togglePurchased(item)} disabled={busyId !== null} style={styles.checkWrap}>
          {busyId === item.id ? <ActivityIndicator size="small" color={C.purple} /> :
            <Ionicons name={done ? 'checkmark-circle' : 'ellipse-outline'} size={29} color={done ? C.green : '#B7A4CF'} />}
        </Pressable>
        <View style={styles.itemBody}>
          <Text style={[styles.itemName, done && styles.strike]}>{item.name}</Text>
          <Text style={styles.itemSub}>Requested: {item.quantity || '1'} · {item.addedBy?.name || 'Roommate'}</Text>
          {p.required !== null && !done ? (
            <>
              <View style={styles.progressMeta}>
                <Text style={[styles.progressLabel, { color: p.partial ? C.amber : C.muted }]}>
                  {p.partial ? 'Partially purchased' : 'Still needed'}
                </Text>
                <Text style={styles.progressNumber}>{fmt(p.purchased)} / {fmt(p.required)}</Text>
              </View>
              <View style={styles.miniTrack}><View style={[styles.miniFill, { width: `${p.percent}%`, backgroundColor: p.partial ? '#E3A353' : C.purple }]} /></View>
            </>
          ) : done ? <Text style={styles.doneText}>✓ Purchased</Text> : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${item.name}`} onPress={() => confirmDelete(item)}
          style={styles.trash} disabled={busyId !== null}>
          <Ionicons name="trash-outline" size={18} color="#A98EBB" />
        </Pressable>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View pointerEvents="none" style={styles.ambientOrbTop} />
      <View pointerEvents="none" style={styles.ambientOrbBottom} />
      <FlatList
        data={visible} keyExtractor={item => item.id} renderItem={renderItem}
        showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={C.purple} onRefresh={() => { setRefreshing(true); void loadShopping(false); }} />}
        ListHeaderComponent={
          <View>
            <View style={styles.brandRow}>
              <View style={styles.brandIcon}><Ionicons name="basket-outline" size={21} color={C.white} /></View>
              <Text style={styles.brand}>roomie<Text style={{ color: C.purple }}>.</Text></Text>
              <View style={{ flex: 1 }} />
              <Pressable accessibilityRole="button" accessibilityLabel="Go to Home" onPress={() => router.navigate('/(tabs)')} style={styles.apartmentPill}><Ionicons name="home-outline" size={13} color={C.purple} /><Text style={styles.apartmentText} numberOfLines={1}>{apartmentName}</Text></Pressable>
            </View>
            <Text style={styles.heading}>Shopping list <Text style={{ color: C.purple }}>✦</Text></Text>
            <Text style={styles.subtitle}>Everything your home needs, all in one place.</Text>
            <View style={styles.hero}>
              
              
              <View style={styles.heroTop}><Ionicons name="bag-handle-outline" size={20} color="#E9E4FF" /><Text style={styles.heroEyebrow}>YOUR SHARED SHOPPING</Text></View>
              <View style={styles.heroStats}>
                <View style={styles.heroStatBlock}><Text style={styles.heroNumber}>{pending.length}</Text><Text style={styles.heroLabel}>Still to buy</Text></View>
                
                <View style={styles.heroStatBlock}><Text style={styles.heroNumber}>{purchased.length}</Text><Text style={styles.heroLabel}>Purchased</Text></View>
                <View style={styles.heroPercent}><Text style={styles.heroPercentText}>{completion}%</Text></View>
              </View>
              <View style={styles.heroTrack}><View style={[styles.heroFill, { width: `${completion}%` }]} /></View>
              <Text style={styles.heroFoot}>{items.length ? `${purchased.length} of ${items.length} products completed` : 'Add your first item to get started'}</Text>
            </View>

            <Pressable style={styles.addToggle} onPress={() => setShowForm(v => !v)} accessibilityRole="button">
              <Ionicons name={showForm ? 'close' : 'add'} size={23} color={C.white} />
              <Text style={styles.addToggleText}>{showForm ? 'Close product form' : 'Add a product'}</Text>
              <View style={{ flex: 1 }} /><Ionicons name={showForm ? 'chevron-up' : 'arrow-forward'} size={19} color={C.white} />
            </Pressable>

            {showForm && <View style={styles.formCard}>
              <View style={styles.formHeading}><View style={styles.formIcon}><Ionicons name="bag-add-outline" size={22} color={C.purple} /></View><View style={{flex:1}}><Text style={styles.formTitle}>What do we need?</Text><Text style={styles.formSubtitle}>Add something for your roommates</Text></View></View>
              <Text style={styles.fieldLabel}>PRODUCT NAME</Text>
              <TextInput style={styles.input} placeholder="e.g. Milk, bread, rice..." placeholderTextColor="#A39DB6" value={name} onChangeText={setName} maxLength={100} />
              <Text style={styles.fieldLabel}>QUANTITY</Text>
              <TextInput style={styles.input} placeholder="e.g. 2 litres" placeholderTextColor="#A39DB6" value={quantity} onChangeText={setQuantity} maxLength={60} />
              <Pressable style={[styles.formSubmit, saving && { opacity: .6 }]} disabled={saving} onPress={() => void addItem()}>
                {saving ? <ActivityIndicator color={C.white} /> : <><Ionicons name="add-circle-outline" size={19} color={C.white} /><Text style={styles.formSubmitText}>Add to shared list</Text></>}
              </Pressable>
            </View>}

            <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Your products</Text><Text style={styles.sectionHint}>SHARED LIST</Text></View>
            <View style={styles.searchBox}><Ionicons name="search-outline" size={20} color="#A19AB6" /><TextInput style={styles.searchInput} placeholder="Search products" placeholderTextColor="#A19AB6" value={search} onChangeText={setSearch} autoCapitalize="none" /><Pressable onPress={() => setSearch('')} disabled={!search}>{search ? <Ionicons name="close-circle" size={18} color="#A19AB6" /> : null}</Pressable></View>
            <View style={styles.tabs}>
              <Pressable style={[styles.tab, tab === 'toBuy' && styles.activeTab]} onPress={() => setTab('toBuy')}>
                <Text style={[styles.tabText, tab === 'toBuy' && styles.activeTabText]}>To buy  {pending.length}</Text>
              </Pressable>
              <Pressable style={[styles.tab, tab === 'purchased' && styles.activeTab]} onPress={() => setTab('purchased')}>
                <Text style={[styles.tabText, tab === 'purchased' && styles.activeTabText]}>Purchased  {purchased.length}</Text>
              </Pressable>
            </View>
            {errorMessage && <Pressable onPress={() => void loadShopping()} style={styles.errorBox}><Ionicons name="alert-circle-outline" size={18} color={C.red} /><Text style={styles.errorText}>{errorMessage}\nTap to retry.</Text></Pressable>}
            {loading && <ActivityIndicator size="large" color={C.purple} style={{ marginVertical: 22 }} />}
          </View>
        }
        ListEmptyComponent={!loading ? <View style={styles.emptyCard}><View style={styles.emptyIcon}><Ionicons name={tab === 'toBuy' ? 'basket-outline' : 'checkmark-done-outline'} size={32} color={C.purple} /></View><Text style={styles.emptyTitle}>{search ? 'No matching products' : tab === 'toBuy' ? 'All caught up!' : 'No purchases yet'}</Text><Text style={styles.emptyText}>{search ? 'Try a different search.' : tab === 'toBuy' ? 'Your shopping list is clear. Add something when you need it.' : 'Products you mark as purchased will appear here.'}</Text></View> : null}
        ListFooterComponent={<Text style={styles.footer}>Your home, in sync. ✦</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  ambientOrbTop: { position: 'absolute', top: 120, right: -90, width: 290, height: 290, borderRadius: 145, backgroundColor: 'transparent' },
  ambientOrbBottom: { position: 'absolute', top: 520, left: -120, width: 310, height: 310, borderRadius: 155, backgroundColor: 'transparent' },
  content: { paddingHorizontal: 22, paddingTop: 16, paddingBottom: 110 },
  brandRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 28 },
  brandIcon: { width: 39, height: 39, borderRadius: 13, backgroundColor: C.purple, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  brand: { fontSize: 26, fontWeight: '900', color: C.ink, letterSpacing: -1.4 },
  apartmentPill: { maxWidth: '45%', flexDirection: 'row', gap: 5, alignItems: 'center', backgroundColor: '#EEE4F8', borderRadius: 20, paddingHorizontal: 11, paddingVertical: 8 },
  apartmentText: { color: C.purple, fontSize: 11, fontWeight: '700', flexShrink: 1 },
  heading: { fontSize: 31, fontWeight: '900', letterSpacing: -1.2, color: C.ink },
  subtitle: { color: C.muted, fontSize: 14, marginTop: 6, marginBottom: 22 },
  hero: { backgroundColor: C.purple, borderRadius: 26, padding: 22, marginBottom: 18, overflow: 'hidden' },
  heroOrb: { position: 'absolute', right: -65, top: -100, width: 215, height: 215, borderRadius: 110, backgroundColor: 'rgba(255,255,255,0.13)' },
  heroSheen: { position: 'absolute', left: -65, top: -125, width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255,255,255,0.10)' },
  heroStatBlock: { flex: 1, backgroundColor: '#8C5ABB', borderRadius: 17, padding: 14 },
  formHeading: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  formIcon: { width: 43, height: 43, borderRadius: 14, backgroundColor: '#DDC9F1', alignItems: 'center', justifyContent: 'center' },
  formSubtitle: { color: C.muted, fontSize: 11, marginTop: 4 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 22 },
  heroEyebrow: { color: '#F3E8FF', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  heroStats: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  heroNumber: { fontSize: 30, fontWeight: '900', color: C.white },
  heroLabel: { color: '#F0E6FA', fontSize: 11, fontWeight: '600', marginTop: 3 },
  heroDivider: { height: 37, width: 1, backgroundColor: 'rgba(255,255,255,0.36)' },
  heroPercent: { width: 58, height: 58, borderRadius: 18, backgroundColor: '#8C5ABB', alignItems: 'center', justifyContent: 'center' },
  heroPercentText: { color: C.white, fontWeight: '900', fontSize: 17 },
  heroTrack: { marginTop: 20, height: 7, backgroundColor: '#9768C1', borderRadius: 9, overflow: 'hidden' },
  heroFill: { height: '100%', backgroundColor: C.white, borderRadius: 9 },
  heroFoot: { marginTop: 9, color: '#F3E8FF', fontSize: 11 },
  addToggle: { backgroundColor: C.purple, borderRadius: 16, paddingHorizontal: 17, paddingVertical: 17, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 },
  addToggleText: { color: C.white, fontSize: 15, fontWeight: '800' },
  formCard: { backgroundColor: '#EEE6F8', borderRadius: 22, padding: 19, marginBottom: 22 },
  formTitle: { fontSize: 17, fontWeight: '900', color: C.ink },
  fieldLabel: { fontSize: 10, fontWeight: '800', color: C.muted, letterSpacing: 1.1, marginBottom: 8 },
  input: { borderRadius: 14, borderWidth: 0, backgroundColor: '#FFFFFF', paddingHorizontal: 14, paddingVertical: 14, fontSize: 14, color: C.ink, marginBottom: 16 },
  formSubmit: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: C.purple, borderRadius: 14, padding: 15 },
  formSubmitText: { color: C.white, fontWeight: '800', fontSize: 14 },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 },
  sectionTitle: { fontSize: 21, fontWeight: '800', color: C.ink, letterSpacing: -.6 },
  sectionHint: { fontSize: 9, fontWeight: '800', color: '#9290A3', letterSpacing: 1 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#EEE6F8', borderRadius: 15, paddingHorizontal: 14, marginBottom: 16 },
  searchInput: { flex: 1, color: C.ink, fontSize: 14, paddingVertical: 13 },
  tabs: { flexDirection: 'row', padding: 5, borderRadius: 15, backgroundColor: '#E9DEF5', marginBottom: 15 },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 11 },
  activeTab: { backgroundColor: C.purple },
  tabText: { color: C.muted, fontWeight: '800', fontSize: 13 },
  activeTabText: { color: '#FFFFFF' },
  itemCard: { backgroundColor: '#FFFFFF', borderRadius: 19, padding: 16, marginBottom: 11, flexDirection: 'row', alignItems: 'flex-start', shadowColor: '#4E286C', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.035, shadowRadius: 9, elevation: 1 },
  checkWrap: { width: 37, minHeight: 35, justifyContent: 'center', marginRight: 6 },
  itemBody: { flex: 1, paddingTop: 4 },
  itemName: { color: C.ink, fontSize: 15, fontWeight: '800' },
  strike: { color: '#AAA6B7', textDecorationLine: 'line-through' },
  itemSub: { color: C.muted, fontSize: 11, marginTop: 6 },
  progressMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, gap: 10 },
  progressLabel: { fontSize: 11, fontWeight: '700' },
  progressNumber: { fontSize: 11, color: C.muted, fontWeight: '700' },
  miniTrack: { height: 5, backgroundColor: '#EDE2F7', borderRadius: 8, marginTop: 7, overflow: 'hidden' },
  miniFill: { height: '100%', borderRadius: 8 },
  doneText: { color: C.green, fontSize: 11, fontWeight: '800', marginTop: 9 },
  trash: { padding: 8, marginLeft: 3 },
  emptyCard: { backgroundColor: '#EEE6F8', borderRadius: 20, padding: 28, alignItems: 'center', marginTop: 5 },
  emptyIcon: { width: 64, height: 64, borderRadius: 20, backgroundColor: '#DDC9F1', justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: C.ink },
  emptyText: { color: C.muted, fontSize: 12, textAlign: 'center', marginTop: 8, lineHeight: 19 },
  errorBox: { backgroundColor: '#FFF0F1', borderRadius: 13, padding: 13, marginBottom: 15, flexDirection: 'row', alignItems: 'center', gap: 9 },
  errorText: { flex: 1, color: C.red, fontSize: 12, lineHeight: 18 },
  footer: { color: '#A09BAD', textAlign: 'center', marginTop: 26, fontSize: 12, fontWeight: '600' },
});
