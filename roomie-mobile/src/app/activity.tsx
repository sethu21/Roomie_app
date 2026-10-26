
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApartment } from '../context/ApartmentContext';

// Use the same reachable laptop IP as your working Home dashboard.
const API_URL = process.env.EXPO_PUBLIC_API_URL!;

type ActivityType = 'expense' | 'receipt' | 'repayment' | 'shopping';
type Activity = {
  id: string;
  type: ActivityType;
  title: string;
  detail: string;
  createdAt: string;
  screen: string;
};
type Filter = 'all' | ActivityType;
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'expense', label: 'Expenses' },
  { key: 'receipt', label: 'Receipts' },
  { key: 'repayment', label: 'Payments' },
  { key: 'shopping', label: 'Shopping' },
];
const ICONS: Record<ActivityType, keyof typeof Ionicons.glyphMap> = {
  expense: 'wallet-outline',
  receipt: 'receipt-outline',
  repayment: 'checkmark-circle-outline',
  shopping: 'basket-outline',
};
const COLORS: Record<ActivityType, string> = {
  expense: '#7457E8', receipt: '#EF8C45', repayment: '#159A7C', shopping: '#3D8FE6',
};
function timeLabel(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function ActivityScreen() {
  const router = useRouter();
  const { session } = useApartment();
  const [items, setItems] = useState<Activity[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (refresh = false) => {
    if (!session?.code) {
      setItems([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_URL}/api/apartments/${encodeURIComponent(session.code)}/activity`);
      if (!response.ok) throw new Error(`Server returned ${response.status}`);
      const json = await response.json();
      setItems(Array.isArray(json.activity) ? json.activity : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load activity');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session?.code]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const openActivity = (item: Activity) => {
    switch (item.screen) {
      case 'money': router.push('/(tabs)/money'); break;
      case 'shopping': router.push('/(tabs)/shopping'); break;
      case 'receipt': router.push('/(tabs)/receipt'); break;
      case 'chores': router.push('/(tabs)/chores'); break;
    }
  };
  const visible = filter === 'all' ? items : items.filter(item => item.type === filter);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={22} color="#25223D" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Apartment activity</Text>
          <Text style={styles.subtitle}>{session?.apartmentName ?? 'Your apartment'} · Recent updates</Text>
        </View>
      </View>
 <View style={styles.filters}>
        {FILTERS.map(option => (
          <Pressable key={option.key} onPress={() => setFilter(option.key)}
            style={[styles.filter, filter === option.key && styles.filterSelected]}>
            <Text style={[styles.filterText, filter === option.key && styles.filterTextSelected]}>{option.label}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#7457E8" size="large" /></View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor="#7457E8" />}
          ListHeaderComponent={error ? <Text style={styles.error}>{error}</Text> : null}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="sparkles-outline" size={32} color="#9589CC" />
              <Text style={styles.emptyTitle}>Nothing here yet</Text>
              <Text style={styles.emptyText}>{error ? 'Pull down to retry.' : 'New apartment activity will appear here.'}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable onPress={() => openActivity(item)} style={styles.event}>
              <View style={[styles.iconWrap, { backgroundColor: `${COLORS[item.type] ?? '#7457E8'}15` }]}>
                <Ionicons name={ICONS[item.type] ?? 'notifications-outline'} size={21} color={COLORS[item.type] ?? '#7457E8'} />
              </View>
              <View style={styles.eventBody}>
                <Text style={styles.eventTitle}>{item.title}</Text>
                <Text style={styles.eventDetail}>{item.detail}</Text>
                <Text style={styles.eventTime}>{timeLabel(item.createdAt)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#A7A2B9" />
            </Pressable>
          )}
          ListFooterComponent={<Text style={styles.footer}>Showing up to 15 recent events</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FAF9FF' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 20 },
  back: { width: 42, height: 42, borderRadius: 15, backgroundColor: '#EEEAFE', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 23, fontWeight: '800', color: '#25223D' },
  subtitle: { fontSize: 12, color: '#8B849E', marginTop: 3 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20, paddingBottom: 18 },
  filter: { paddingHorizontal: 13, paddingVertical: 9, backgroundColor: '#F0EDF8', borderRadius: 20 },
  filterSelected: { backgroundColor: '#7457E8' },
  filterText: { fontSize: 12, fontWeight: '700', color: '#706887' },
  filterTextSelected: { color: '#FFFFFF' },
  list: { paddingHorizontal: 20, paddingBottom: 30, flexGrow: 1 },
  event: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', padding: 15, borderRadius: 19, marginBottom: 10, gap: 12, borderWidth: 1, borderColor: '#F0ECF8' },
  iconWrap: { width: 45, height: 45, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  eventBody: { flex: 1, gap: 4 },
  eventTitle: { fontSize: 13, fontWeight: '700', color: '#28243D' },
  eventDetail: { fontSize: 12, color: '#746E87' },
  eventTime: { fontSize: 11, color: '#A09BAF' },
  footer: { textAlign: 'center', color: '#A09BAF', fontSize: 11, paddingVertical: 18 },
  center: { flex: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 35, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: '#302B49' },
  emptyText: { fontSize: 12, color: '#8B849E', textAlign: 'center' },
  error: { color: '#C44747', textAlign: 'center', marginBottom: 12 },
});
