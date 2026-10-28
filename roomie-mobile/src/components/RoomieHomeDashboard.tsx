
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApartment } from '../context/ApartmentContext';

const API_URL =
  process.env.EXPO_PUBLIC_API_URL;

const C = {
  navy: '#1E293B',
  navySoft: '#334155',
  bg: '#F3F7FC',
  white: '#FFFFFF',
  muted: '#64748B',
  line: '#E2E8F0',
  green: '#065F46',
  purple: '#6B21A8',
  rust: '#9A3412',
  blue: '#0369A1',
};

type IconName = React.ComponentProps<typeof Ionicons>['name'];

type Activity = {
  id: string;
  type: 'expense' | 'receipt' | 'shopping' | 'repayment';
  title: string;
  detail: string;
  createdAt: string;
  screen: 'money' | 'receipt' | 'shopping';
};

type ShoppingItem = {
  id: string;
  isPurchased: boolean;
};

type Debt = {
  currency?: string;
  remainingAmount: number | string;
  fromMember?: { id: string };
};

type Note = {
  id: string;
  text: string;
  type: 'NOTICE' | 'REMINDER' | 'QUESTION';
  authorId: string;
  author?: {
    id: string;
    name: string;
  } | null;
  createdAt: string;
};

const noteThemes = {
  NOTICE: {
    background: '#FFF4D6',
    border: '#F2DDA7',
    ink: '#92400E',
    icon: 'megaphone-outline' as IconName,
  },
  REMINDER: {
    background: '#E4F4EB',
    border: '#C5E6D3',
    ink: '#065F46',
    icon: 'alarm-outline' as IconName,
  },
  QUESTION: {
    background: '#F0E9FA',
    border: '#E0D1F4',
    ink: '#6B21A8',
    icon: 'help-circle-outline' as IconName,
  },
};

async function fetchJSON(
  url: string,
  signal: AbortSignal
): Promise<any> {
  const response = await fetch(url, { signal });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json();
}

export default function RoomieHomeDashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useApartment();

  const [notes, setNotes] = useState<Note[]>([]);
  const [toBuy, setToBuy] = useState<number | null>(null);
  const [debtCount, setDebtCount] = useState<number | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [boardError, setBoardError] = useState(false);
  const [activityError, setActivityError] = useState(false);

  const loadOverview = useCallback(async () => {
    if (!session?.code || !session.memberId) {
      setRefreshing(false);
      return;
    }

    setLoading(true);

    const code = encodeURIComponent(session.code);
    const memberId = encodeURIComponent(session.memberId);

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      12000
    );

    try {
      const results = await Promise.allSettled([
        fetchJSON(
          `${API_URL}/api/apartments/${code}/shopping`,
          controller.signal
        ),
        fetchJSON(
          `${API_URL}/api/apartments/${code}/debts?memberId=${memberId}`,
          controller.signal
        ),
        fetchJSON(
          `${API_URL}/api/apartments/${code}/board`,
          controller.signal
        ),
        fetchJSON(
          `${API_URL}/api/apartments/${code}/activity`,
          controller.signal
        ),
        fetchJSON(
          `${API_URL}/api/apartments/${code}/notifications?memberId=${memberId}`,
          controller.signal
        ),
      ]);

      if (results[0].status === 'fulfilled') {
        const items: ShoppingItem[] = Array.isArray(
          results[0].value.items
        )
          ? results[0].value.items
          : [];

        setToBuy(
          items.filter(item => !item.isPurchased).length
        );
      } else {
        setToBuy(null);
      }

      if (results[1].status === 'fulfilled') {
        const debts: Debt[] = Array.isArray(
          results[1].value.debts
        )
          ? results[1].value.debts
          : [];

        setDebtCount(
          debts.filter(
            d =>
              d.fromMember?.id === session.memberId &&
              Number(d.remainingAmount) > 0
          ).length
        );
      } else {
        setDebtCount(null);
      }

      if (results[2].status === 'fulfilled') {
        const data = results[2].value;

        setNotes(
          Array.isArray(data.notes) ? data.notes : []
        );
        setBoardError(false);
      } else {
        setBoardError(true);
      }

      if (results[3].status === 'fulfilled') {
        const data = results[3].value;

        setActivity(
          Array.isArray(data.activity) ? data.activity : []
        );
        setActivityError(false);
      } else {
        setActivityError(true);
      }

      if (results[4].status === 'fulfilled') {
        setUnreadCount(
          Number(results[4].value.unreadCount) || 0
        );
      } else {
        setUnreadCount(0);
      }
    } finally {
      clearTimeout(timeout);
      setLoading(false);
      setRefreshing(false);
    }
  }, [session?.code, session?.memberId]);

  useFocusEffect(
    useCallback(() => {
      void loadOverview();
    }, [loadOverview])
  );

  const firstName =
    session?.memberName?.trim().split(/\s+/)[0] ||
    'roommate';

  const orderedNotes = [...notes].sort((a, b) => {
    const rank = {
      NOTICE: 0,
      REMINDER: 1,
      QUESTION: 2,
    };

    return (
      rank[a.type] - rank[b.type] ||
      new Date(b.createdAt).getTime() -
        new Date(a.createdAt).getTime()
    );
  });

  const featuredNotes = orderedNotes.slice(0, 4);

  const openActivity = (event: Activity) => {
    router.push(
      event.screen === 'shopping'
        ? '/(tabs)/shopping'
        : event.screen === 'receipt'
        ? '/(tabs)/receipt'
        : '/(tabs)/money'
    );
  };

  const activityIcon = (type: Activity['type']): IconName => {
    if (type === 'shopping') return 'basket-outline';
    if (type === 'receipt') return 'receipt-outline';
    if (type === 'repayment') return 'checkmark-circle-outline';
    return 'wallet-outline';
  };

  const activityColor = (type: Activity['type']) => {
    if (type === 'shopping') return C.purple;
    if (type === 'receipt') return C.rust;
    if (type === 'repayment') return C.green;
    return C.green;
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + 16,
            paddingBottom: 120,
          },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={C.navy}
            onRefresh={() => {
              setRefreshing(true);
              void loadOverview();
            }}
          />
        }
      >
        <View pointerEvents="none" style={styles.ambientOrbTop} />
        <View pointerEvents="none" style={styles.ambientOrbBottom} />
        {/* HEADER */}

        <View style={styles.topRow}>
          <View style={styles.brandIcon}>
            <Ionicons
              name="home-outline"
              size={21}
              color={C.white}
            />
          </View>

          <Text style={styles.brand}>
            roomie
            <Text style={{ color: C.blue }}>.</Text>
          </Text>

          <View style={{ flex: 1 }} />

          <Pressable
            onPress={() => router.push('/notifications')}
            style={styles.headerButton}
            accessibilityRole="button"
            accessibilityLabel={`Notifications, ${unreadCount} unread`}
          >
            <Ionicons
              name="notifications-outline"
              size={21}
              color={C.navy}
            />

            {unreadCount > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Text>
              </View>
            )}
          </Pressable>

          <Pressable
            onPress={() => router.push('/profile')}
            style={styles.profileAvatar}
            accessibilityRole="button"
            accessibilityLabel="Open my profile"
          >
            <Text style={styles.profileInitial}>
              {firstName.charAt(0).toUpperCase()}
            </Text>
          </Pressable>
        </View>

        {/* GREETING */}

        <Text style={styles.greeting}>
          Hey, {firstName}
          <Text style={{ color: C.blue }}> ✦</Text>
        </Text>

        <Text style={styles.subheading}>
          Here's what's happening at home.
        </Text>

        {/* GLASS-STYLE APARTMENT HERO */}

        <View style={styles.hero}>
          <View pointerEvents="none" style={styles.heroGlow} />
          <View pointerEvents="none" style={styles.heroGlowSmall} />

          <View pointerEvents="none" style={styles.heroSheen} />
          <View style={styles.heroTop}>
            <View style={styles.heroIcon}>
              <Ionicons
                name="people-outline"
                size={21}
                color={C.white}
              />
            </View>

            <View style={styles.heroTag}>
              <View style={styles.onlineDot} />
              <Text style={styles.heroTagText}>
                SHARED SPACE
              </Text>
            </View>
          </View>

          <Text style={styles.heroEyebrow}>
            YOUR APARTMENT
          </Text>

          <Text
            style={styles.heroTitle}
            numberOfLines={2}
          >
            {session?.apartmentName || 'Our apartment'}
          </Text>

          <View style={styles.heroDivider} />

          <View style={styles.heroBottom}>
            <Ionicons
              name="home-outline"
              size={16}
              color="#CBD5E1"
            />
            <Text style={styles.heroBottomText}>
              Your home, connected.
            </Text>
          </View>
        </View>

        {/* TODAY AT HOME */}

        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>
            Today at home
          </Text>

          <View style={styles.liveLabel}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        </View>

        <View style={styles.summaryRow}>
          <Pressable
            onPress={() =>
              router.push('/(tabs)/shopping')
            }
            accessibilityRole="button"
            accessibilityLabel="Open shopping list"
            style={({ pressed }) => [
              styles.summary,
              { backgroundColor: '#EAE2F7' },
              pressed && styles.pressed,
            ]}
          >
            <View
              style={[
                styles.summaryIcon,
                { backgroundColor: '#D8C6F0' },
              ]}
            >
              <Ionicons
                name="basket-outline"
                size={22}
                color={C.purple}
              />
            </View>

            <Text style={styles.summaryValue}>
              {toBuy === null ? '—' : toBuy}
            </Text>

            <Text style={styles.summaryLabel}>
              Things to buy
            </Text>

            <View style={styles.summaryFooter}>
              <Text style={styles.summaryFooterText}>
                Shopping list
              </Text>
              <Ionicons
                name="arrow-forward"
                size={15}
                color={C.purple}
              />
            </View>
          </Pressable>

          <Pressable
            onPress={() =>
              router.push('/(tabs)/money')
            }
            accessibilityRole="button"
            accessibilityLabel="Open debts"
            style={({ pressed }) => [
              styles.summary,
              { backgroundColor: '#DDF0E7' },
              pressed && styles.pressed,
            ]}
          >
            <View
              style={[
                styles.summaryIcon,
                { backgroundColor: '#C8E6D6' },
              ]}
            >
              <Ionicons
                name="wallet-outline"
                size={22}
                color={C.green}
              />
            </View>

            <Text style={styles.summaryValue}>
              {debtCount === null ? '—' : debtCount}
            </Text>

            <Text style={styles.summaryLabel}>
              Debts to settle
            </Text>

            <View style={styles.summaryFooter}>
              <Text style={styles.summaryFooterText}>
                Money overview
              </Text>
              <Ionicons
                name="arrow-forward"
                size={15}
                color={C.green}
              />
            </View>
          </Pressable>
        </View>

        {/* APARTMENT BOARD */}

        <View style={styles.sectionRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>
              Apartment board
            </Text>
            <Text style={styles.sectionSubtitle}>
              Important notes from your roommates
            </Text>
          </View>

          <Pressable
            onPress={() =>
              router.push('/(tabs)/chores')
            }
            accessibilityRole="button"
            accessibilityLabel="Open apartment board"
          >
            <Text style={styles.seeAll}>
              See all ›
            </Text>
          </Pressable>
        </View>

        {boardError ? (
          <View style={styles.emptyPanel}>
            <Text style={styles.emptyText}>
              Board is unavailable. Pull down to retry.
            </Text>
          </View>
        ) : featuredNotes.length === 0 ? (
          <View style={styles.emptyPanel}>
            <View style={styles.emptyIcon}>
              <Ionicons
                name="document-text-outline"
                size={24}
                color={C.navy}
              />
            </View>

            <Text style={styles.emptyTitle}>
              No notes yet
            </Text>

            <Text style={styles.emptyText}>
              Notices and reminders from your roommates
              will appear here.
            </Text>
          </View>
        ) : (
          <View style={styles.noteGrid}>
            {featuredNotes.map(note => {
              const theme = noteThemes[note.type];

              return (
                <View
                  key={note.id}
                  style={[
                    styles.note,
                    {
                      backgroundColor: theme.background,
                      borderColor: 'transparent',
                    },
                  ]}
                >
                  <View style={styles.noteTop}>
                    <Ionicons
                      name={theme.icon}
                      size={15}
                      color={theme.ink}
                    />

                    <Text
                      style={[
                        styles.noteKind,
                        { color: theme.ink },
                      ]}
                    >
                      {note.type}
                    </Text>
                  </View>

                  <Text
                    style={styles.noteBody}
                    numberOfLines={5}
                  >
                    {note.text}
                  </Text>

                  <View style={styles.noteDivider} />

                  <Text
                    style={styles.noteAuthor}
                    numberOfLines={1}
                  >
                    {note.author?.name || 'Roommate'}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {notes.length > featuredNotes.length && (
          <Text style={styles.moreNotes}>
            {notes.length - featuredNotes.length} more
            notes on the apartment board
          </Text>
        )}

        {loading && !refreshing && (
          <ActivityIndicator
            color={C.navy}
            style={{ marginTop: 14 }}
          />
        )}

        {/* RECENT ACTIVITY */}

        <View
          style={[
            styles.sectionRow,
            styles.activityHeading,
          ]}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>
              Recent activity
            </Text>

            <Text style={styles.sectionSubtitle}>
              A quick look at what's changed
            </Text>
          </View>

          <Pressable
            onPress={() => router.push('/activity')}
            accessibilityRole="button"
            accessibilityLabel="See all activity"
          >
            <Text style={styles.seeAll}>
              See all ›
            </Text>
          </Pressable>
        </View>

        <View style={styles.activityPanel}>
          {activityError ? (
            <Text style={styles.activityEmpty}>
              Activity is unavailable. Pull down to retry.
            </Text>
          ) : activity.length === 0 ? (
            <Text style={styles.activityEmpty}>
              No recent activity yet.
            </Text>
          ) : (
            activity.slice(0, 3).map((event, index) => (
              <Pressable
                key={event.id}
                onPress={() => openActivity(event)}
                style={[
                  styles.activityItem,
                  index > 0 && styles.activityBorder,
                ]}
              >
                <View
                  style={[
                    styles.activityIcon,
                    {
                      backgroundColor:
                        activityColor(event.type) + '12',
                    },
                  ]}
                >
                  <Ionicons
                    name={activityIcon(event.type)}
                    size={19}
                    color={activityColor(event.type)}
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Text
                    style={styles.activityTitle}
                    numberOfLines={1}
                  >
                    {event.title}
                  </Text>

                  <Text
                    style={styles.activityDetail}
                    numberOfLines={1}
                  >
                    {event.detail}
                  </Text>
                </View>

                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={C.muted}
                />
              </Pressable>
            ))
          )}
        </View>

        <Text style={styles.footer}>
          Your home, in sync. ✦
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  ambientOrbTop: { position: 'absolute', width: 310, height: 310, borderRadius: 155, backgroundColor: 'transparent', top: 100, right: -135 },
  ambientOrbBottom: { position: 'absolute', width: 300, height: 300, borderRadius: 150, backgroundColor: 'transparent', top: 610, left: -150 },
  heroSheen: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.025)', left: -100, top: -115 },
  screen: {
    flex: 1,
    backgroundColor: C.bg,
  },

  content: {
    paddingHorizontal: 20,
  },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 28,
  },

  brandIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: C.navy,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },

  brand: {
    fontSize: 26,
    fontWeight: '900',
    color: C.navy,
    letterSpacing: -1.3,
  },

  headerButton: { width: 44, height: 44, borderRadius: 15, backgroundColor: '#E5F0F9', alignItems: 'center', justifyContent: 'center', marginRight: 10 },

  profileAvatar: { width: 44, height: 44, borderRadius: 15, backgroundColor: '#DCE9F5', alignItems: 'center', justifyContent: 'center' },

  profileInitial: {
    fontSize: 18,
    fontWeight: '800',
    color: C.navy,
  },

  notificationBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#DC2626',
    borderWidth: 2,
    borderColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },

  notificationBadgeText: {
    color: C.white,
    fontSize: 9,
    fontWeight: '900',
  },

  greeting: {
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -1.1,
    color: C.navy,
  },

  subheading: {
    fontSize: 14,
    color: C.muted,
    marginTop: 6,
    marginBottom: 23,
  },

  hero: { backgroundColor: '#203C58', borderRadius: 26, padding: 22, minHeight: 195, marginBottom: 28, overflow: 'hidden' },

  heroGlow: { position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: '#294E70', right: -90, top: -110 },

  heroGlowSmall: { position: 'absolute', width: 130, height: 130, borderRadius: 65, backgroundColor: '#315575', right: 50, bottom: -95 },

  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },

  heroIcon: { width: 43, height: 43, borderRadius: 14, backgroundColor: '#355773', alignItems: 'center', justifyContent: 'center' },

  heroTag: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#355773', paddingHorizontal: 11, paddingVertical: 8, borderRadius: 30 },

  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#86EFAC',
  },

  heroTagText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#E2E8F0',
    letterSpacing: 0.8,
  },

  heroEyebrow: {
    color: '#CBD5E1',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },

  heroTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: C.white,
    letterSpacing: -0.7,
    marginTop: 8,
    marginBottom: 22,
  },

  heroDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },

  heroBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 15,
  },

  heroBottomText: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '600',
  },

  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 8,
  },

  sectionTitle: {
    fontSize: 21,
    fontWeight: '800',
    color: C.navy,
    letterSpacing: -0.5,
  },

  sectionSubtitle: {
    color: C.muted,
    fontSize: 12,
    marginTop: 5,
  },

  liveLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E2F4EB',
    borderRadius: 30,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },

  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.green,
  },

  liveText: {
    fontSize: 9,
    fontWeight: '800',
    color: C.green,
    letterSpacing: 1,
  },

  summaryRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 31,
  },

  summary: { flex: 1, minWidth: 0, minHeight: 184, borderRadius: 23, padding: 18, backgroundColor: '#EAE2F7' },

  pressed: {
    opacity: 0.78,
  },

  summaryIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },

  summaryValue: {
    fontSize: 36,
    fontWeight: '900',
    color: C.navy,
    marginTop: 14,
  },

  summaryLabel: {
    fontSize: 13,
    color: C.navySoft,
    fontWeight: '700',
    marginTop: 3,
  },

  summaryFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 17, borderTopWidth: 1, borderTopColor: 'rgba(30,41,59,0.10)', paddingTop: 12 },

  summaryFooterText: {
    fontSize: 10,
    fontWeight: '600',
    color: C.muted,
  },

  seeAll: {
    color: C.blue,
    fontSize: 12,
    fontWeight: '800',
  },

  noteGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
  },

  note: { width: '48.3%', minHeight: 174, borderRadius: 19, padding: 15, borderWidth: 0 },

  noteTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  noteKind: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },

  noteBody: {
    flex: 1,
    marginTop: 16,
    color: C.navy,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '700',
  },

  noteDivider: {
    height: 1,
    backgroundColor: 'rgba(30,41,59,0.10)',
    marginTop: 12,
  },

  noteAuthor: {
    marginTop: 10,
    color: C.muted,
    fontSize: 11,
    fontWeight: '600',
  },

  moreNotes: {
    marginTop: 12,
    color: C.muted,
    fontSize: 12,
  },

  emptyPanel: { borderRadius: 22, backgroundColor: '#E5F0F9', padding: 26, alignItems: 'center', gap: 9 },

  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },

  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: C.navy,
  },

  emptyText: {
    color: C.muted,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 19,
  },

  activityHeading: {
    marginTop: 30,
  },

  activityPanel: { backgroundColor: '#E6F0F9', borderRadius: 23, paddingHorizontal: 17, paddingVertical: 5 },

  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 15,
  },

  activityBorder: {
    borderTopWidth: 1,
    borderTopColor: C.line,
  },

  activityIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },

  activityTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: C.navy,
  },

  activityDetail: {
    fontSize: 12,
    color: C.muted,
    marginTop: 4,
  },

  activityEmpty: {
    color: C.muted,
    fontSize: 13,
    paddingVertical: 20,
  },

  footer: {
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 30,
    fontSize: 12,
    fontWeight: '600',
  },
});
