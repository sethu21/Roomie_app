
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useApartment } from '../context/ApartmentContext';

// Use the same backend IP as your working Home dashboard.
const API_URL = process.env.EXPO_PUBLIC_API_URL; 
type Notification = {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  targetScreen: string | null;
  targetId: string | null;
  createdAt: string;
};

type Filter = 'all' | 'unread';

const COLORS = {
  background: '#F2EDF8',
  white: '#FFFFFF',
  purple: '#6B21A8',
  purpleLight: '#F3E8FF',
  text: '#1E293B',
  muted: '#64748B',
  border: '#E9DFF1',
};

function notificationIcon(type: string) {
  switch (type) {
    case 'EXPENSE_ADDED':
      return 'wallet-outline';
    case 'REPAYMENT_REQUEST':
      return 'cash-outline';
    case 'REPAYMENT_CONFIRMED':
      return 'checkmark-circle-outline';
    case 'REPAYMENT_REJECTED':
      return 'close-circle-outline';
    case 'SHOPPING_UPDATED':
      return 'basket-outline';
    case 'CHORE_ASSIGNED':
      return 'calendar-outline';
    default:
      return 'notifications-outline';
  }
}

function timeAgo(dateString: string) {
  const date = new Date(dateString);
  const difference = Date.now() - date.getTime();

  if (!Number.isFinite(difference)) return '';

  const minutes = Math.max(0, Math.floor(difference / 60000));

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString();
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { session } = useApartment();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState(false);

  const code = session?.code;
  const memberId = session?.memberId;

  const loadNotifications = useCallback(async () => {
    if (!code || !memberId) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    try {
      setError('');

      const url =
        `${API_URL}/api/apartments/${encodeURIComponent(code)}` +
        `/notifications?memberId=${encodeURIComponent(memberId)}`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error('Could not load notifications');
      }

      const data = await response.json();

      setNotifications(data.notifications ?? []);
      setUnreadCount(data.unreadCount ?? 0);
    } catch (err) {
      console.error('Notifications error:', err);
      setError('Unable to load notifications. Pull down to retry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [code, memberId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void loadNotifications();
    }, [loadNotifications])
  );

  const refresh = () => {
    setRefreshing(true);
    void loadNotifications();
  };

  const markAsRead = async (notification: Notification) => {
    if (!code || !memberId || notification.isRead) return;

    try {
      const response = await fetch(
        `${API_URL}/api/apartments/${encodeURIComponent(code)}` +
          `/notifications/${encodeURIComponent(notification.id)}/read`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ memberId }),
        }
      );

      if (!response.ok) throw new Error('Could not mark as read');

      setNotifications((previous) =>
        previous.map((item) =>
          item.id === notification.id
            ? { ...item, isRead: true }
            : item
        )
      );

      setUnreadCount((previous) => Math.max(0, previous - 1));
    } catch (err) {
      console.error('Mark as read error:', err);
      setError('Could not mark notification as read.');
    }
  };

  const markAllAsRead = async () => {
    if (!code || !memberId || updating || unreadCount === 0) return;

    setUpdating(true);

    try {
      const response = await fetch(
        `${API_URL}/api/apartments/${encodeURIComponent(code)}` +
          '/notifications/read-all',
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ memberId }),
        }
      );

      if (!response.ok) throw new Error('Could not update notifications');

      setNotifications((previous) =>
        previous.map((item) => ({ ...item, isRead: true }))
      );

      setUnreadCount(0);
    } catch (err) {
      console.error('Mark all as read error:', err);
      setError('Could not mark all notifications as read.');
    } finally {
      setUpdating(false);
    }
  };

  const openNotification = async (notification: Notification) => {
    await markAsRead(notification);

    const target = notification.targetScreen?.toLowerCase() ?? '';

    if (
      target.includes('shopping') ||
      notification.type === 'SHOPPING_UPDATED'
    ) {
      router.push('/(tabs)/shopping');
    } else if (
      target.includes('chore') ||
      notification.type === 'CHORE_ASSIGNED'
    ) {
      router.push('/(tabs)/chores');
    } else if (target.includes('receipt')) {
      router.push('/(tabs)/receipt');
    } else if (
      target.includes('money') ||
      target.includes('expense') ||
      target.includes('repayment') ||
      notification.type.startsWith('REPAYMENT_') ||
      notification.type === 'EXPENSE_ADDED'
    ) {
      router.push('/(tabs)/money');
    }
  };

  const visibleNotifications = notifications.filter(
    (item) => filter === 'all' || !item.isRead
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View pointerEvents="none" style={glass.ambientTop} />
      <View pointerEvents="none" style={glass.ambientBottom} />
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons
            name="arrow-back"
            size={22}
            color={COLORS.text}
          />
        </Pressable>

        <View style={styles.headerText}>
          <Text style={styles.heading}>Notifications</Text>
          <Text style={styles.subtitle}>
            Stay in sync with your roommates
          </Text>
        </View>

        <View style={styles.headerIcon}>
          <Ionicons
            name="notifications-outline"
            size={23}
            color={COLORS.purple}
          />
        </View>
      </View>

      <View style={styles.summaryCard}>
        <View pointerEvents="none" style={glass.heroGlow} />
        <View pointerEvents="none" style={glass.heroGlowSmall} />
        <View>
          <Text style={styles.summaryLabel}>ROOMIE · YOUR UPDATES</Text>
          <Text style={styles.summaryTitle}>
            {unreadCount === 0
              ? "You're all caught up!"
              : `${unreadCount} unread notification${
                  unreadCount === 1 ? '' : 's'
                }`}
          </Text>
        </View>

        <Ionicons
          name="sparkles-outline"
          size={27}
          color="#FFFFFF"
        />
      </View>

      <View style={styles.toolbar}>
        <View style={styles.filters}>
          <Pressable
            onPress={() => setFilter('all')}
            style={[
              styles.filterButton,
              filter === 'all' && styles.activeFilter,
            ]}
          >
            <Text
              style={[
                styles.filterText,
                filter === 'all' && styles.activeFilterText,
              ]}
            >
              All
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setFilter('unread')}
            style={[
              styles.filterButton,
              filter === 'unread' && styles.activeFilter,
            ]}
          >
            <Text
              style={[
                styles.filterText,
                filter === 'unread' && styles.activeFilterText,
              ]}
            >
              Unread ({unreadCount})
            </Text>
          </Pressable>
        </View>

        <Pressable
          disabled={updating || unreadCount === 0}
          onPress={markAllAsRead}
        >
          <Text
            style={[
              styles.markAll,
              unreadCount === 0 && { opacity: 0.4 },
            ]}
          >
            Mark all read
          </Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading && !refreshing ? (
        <ActivityIndicator
          size="large"
          color={COLORS.purple}
          style={{ marginTop: 60 }}
        />
      ) : (
        <FlatList
          data={visibleNotifications}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={COLORS.purple}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons
                name="notifications-off-outline"
                size={46}
                color={COLORS.purple}
              />
              <Text style={styles.emptyTitle}>
                {filter === 'unread'
                  ? 'No unread notifications'
                  : 'No notifications yet'}
              </Text>
              <Text style={styles.emptyDescription}>
                Shared apartment updates will appear here.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => void openNotification(item)}
              style={[
                styles.notificationCard,
                !item.isRead && styles.unreadCard,
              ]}
            >
              <View style={[styles.iconBox, { backgroundColor: item.type === 'SHOPPING_UPDATED' ? '#F3E8FF' : item.type === 'CHORE_ASSIGNED' ? '#E0F2FE' : item.type.startsWith('REPAYMENT') || item.type === 'EXPENSE_ADDED' ? '#DDF3E9' : COLORS.purpleLight }]}>
                <Ionicons
                  name={notificationIcon(item.type)}
                  size={23}
                  color={item.type === 'CHORE_ASSIGNED' ? '#0369A1' : item.type.startsWith('REPAYMENT') || item.type === 'EXPENSE_ADDED' ? '#065F46' : COLORS.purple}
                />
              </View>

              <View style={styles.notificationContent}>
                <View style={styles.notificationHeading}>
                  <Text style={styles.notificationTitle}>
                    {item.title}
                  </Text>

                  {!item.isRead && (
                    <View style={styles.unreadDot} />
                  )}
                </View>

                <Text style={styles.message}>
                  {item.message}
                </Text>

                <Text style={styles.timestamp}>
                  {timeAgo(item.createdAt)}
                </Text>
              </View>

              <Ionicons
                name="chevron-forward"
                size={17}
                color={COLORS.muted}
              />
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const glass = StyleSheet.create({
  ambientTop: { position: 'absolute', width: 300, height: 300, borderRadius: 150, backgroundColor: 'rgba(167,139,250,0.15)', top: 70, right: -135 },
  ambientBottom: { position: 'absolute', width: 320, height: 320, borderRadius: 160, backgroundColor: 'rgba(196,181,253,0.13)', bottom: 30, left: -155 },
  heroGlow: { position: 'absolute', width: 240, height: 240, borderRadius: 120, backgroundColor: 'rgba(255,255,255,0.12)', top: -145, right: -60 },
  heroGlowSmall: { position: 'absolute', width: 130, height: 130, borderRadius: 65, backgroundColor: 'rgba(255,255,255,0.07)', bottom: -90, right: 70 },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 20,
    gap: 12,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
  },
  heading: {
    fontSize: 27,
    fontWeight: '900',
    letterSpacing: -0.9,
    color: COLORS.text,
  },
  subtitle: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 3,
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: 'rgba(243,232,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryCard: {
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: COLORS.purple,
    padding: 22,
    borderRadius: 27,
    overflow: 'hidden',
    minHeight: 118,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    shadowColor: COLORS.purple,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 18,
    elevation: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    color: '#E9D5FF',
    fontSize: 11,
    letterSpacing: 1,
    fontWeight: '800',
  },
  summaryTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    marginTop: 8,
  },
  toolbar: {
    marginHorizontal: 20,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  filters: {
    flexDirection: 'row',
    gap: 8,
  },
  filterButton: {
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.95)',
  },
  activeFilter: {
    backgroundColor: COLORS.purple,
  },
  filterText: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  activeFilterText: {
    color: COLORS.white,
  },
  markAll: {
    color: '#E9D5FF',
    fontSize: 11,
    letterSpacing: 1,
    fontWeight: '800',
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    flexGrow: 1,
  },
  notificationCard: {
    backgroundColor: 'rgba(255,255,255,0.80)',
    borderRadius: 22,
    padding: 16,
    shadowColor: COLORS.purple,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.045,
    shadowRadius: 12,
    elevation: 2,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  unreadCard: {
    borderColor: '#D8C1F0',
    backgroundColor: 'rgba(250,245,255,0.94)',
  },
  iconBox: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: 'rgba(243,232,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationContent: {
    flex: 1,
  },
  notificationHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  notificationTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.text,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.purple,
  },
  message: {
    color: '#77778B',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },
  timestamp: {
    color: COLORS.muted,
    fontSize: 11,
    marginTop: 8,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 90,
    paddingHorizontal: 25,
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '800',
    marginTop: 16,
  },
  emptyDescription: {
    color: COLORS.muted,
    textAlign: 'center',
    fontSize: 13,
    marginTop: 8,
  },
  error: {
    color: '#C44242',
    marginHorizontal: 20,
    marginBottom: 12,
    fontSize: 12,
  },
});
