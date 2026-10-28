
import { useCallback, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
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
import { useFocusEffect, useRouter } from 'expo-router';
import { useApartment } from '../../context/ApartmentContext';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

const BLUE = '#165F94';
const BLUE_DARK = '#124E79';
const TEXT = '#1D3344';
const MUTED = '#708697';

type Member = {
  id: string;
  name: string;
};

type Chore = {
  id: string;
  title: string;
  frequency: 'ONCE' | 'DAILY' | 'WEEKLY';
  isCompleted: boolean;
  assignedToId: string | null;
  createdById: string;
  assignedTo: Member | null;
  createdBy: Member;
  createdAt: string;
};

type Note = {
  id: string;
  text: string;
  type: 'NOTICE' | 'REMINDER' | 'QUESTION';
  authorId: string;
  author: Member;
  createdAt: string;
};

const noteColors = {
  NOTICE: '#FFF1D1',
  REMINDER: '#DDF2E8',
  QUESTION: '#EAE5FA',
};

const noteAccent = {
  NOTICE: '#9B691D',
  REMINDER: '#26785E',
  QUESTION: '#6D52A4',
};

export default function ChoresScreen() {
  const router = useRouter();

  const { session, loading: sessionLoading } = useApartment();

  const code = session?.code || '';
  const memberId = session?.memberId || '';

  const [chores, setChores] = useState<Chore[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [members, setMembers] = useState<Member[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const [showNoteForm, setShowNoteForm] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [filter, setFilter] = useState<
    'ALL' | 'MINE' | 'DONE'
  >('ALL');

  const [title, setTitle] = useState('');

  const [assignment, setAssignment] = useState<
    'RANDOM' | 'OPEN' | 'MANUAL'
  >('RANDOM');

  const [assignedToId, setAssignedToId] = useState('');

  const [frequency, setFrequency] = useState<
    'ONCE' | 'DAILY' | 'WEEKLY'
  >('ONCE');

  const [noteText, setNoteText] = useState('');

  const [noteType, setNoteType] = useState<
    'NOTICE' | 'REMINDER' | 'QUESTION'
  >('REMINDER');

  const root =
    `${API_URL}/api/apartments/${encodeURIComponent(code)}`;

  // Existing backend request logic
  async function request(
    path: string,
    options?: RequestInit
  ) {
    const controller = new AbortController();

    const timeout = setTimeout(
      () => controller.abort(),
      12000
    );

    try {
      const response = await fetch(root + path, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(options?.headers || {}),
        },
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Request failed');
      }

      return result;
    } finally {
      clearTimeout(timeout);
    }
  }

  // Load chores and apartment board
  const load = useCallback(
    async (silent = false) => {
      if (!code || !memberId) {
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (!silent) setLoading(true);

      try {
        const controller = new AbortController();

        const timeout = setTimeout(
          () => controller.abort(),
          12000
        );

        try {
          const [a, b] = await Promise.all([
            fetch(
              `${API_URL}/api/apartments/${encodeURIComponent(code)}/chores`,
              { signal: controller.signal }
            ),
            fetch(
              `${API_URL}/api/apartments/${encodeURIComponent(code)}/board`,
              { signal: controller.signal }
            ),
          ]);

          const [choreData, boardData] =
            await Promise.all([a.json(), b.json()]);

          if (!a.ok || !b.ok) {
            throw new Error(
              choreData.error ||
              boardData.error ||
              'Unable to load chores'
            );
          }

          setChores(choreData.chores || []);
          setMembers(choreData.members || []);
          setNotes(boardData.notes || []);
        } finally {
          clearTimeout(timeout);
        }
      } catch (error) {
        Alert.alert(
          'Unable to load',
          error instanceof Error
            ? error.message
            : 'Check your backend connection.'
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [code, memberId]
  );

  useFocusEffect(
    useCallback(() => {
      if (!sessionLoading) void load();
    }, [sessionLoading, load])
  );

  const complete = chores.filter(
    c => c.isCompleted
  ).length;

  const progress = chores.length
    ? Math.round((complete / chores.length) * 100)
    : 0;

  const visible = useMemo(
    () =>
      chores.filter(c =>
        filter === 'MINE'
          ? c.assignedToId === memberId && !c.isCompleted
          : filter === 'DONE'
            ? c.isCompleted
            : !c.isCompleted
      ),
    [chores, filter, memberId]
  );

  async function perform(
    path: string,
    method: string,
    body: object,
    after?: () => void
  ) {
    if (busy) return;

    setBusy(true);

    try {
      await request(path, {
        method,
        body: JSON.stringify(body),
      });

      after?.();
      await load(true);
    } catch (error) {
      Alert.alert(
        'Could not save',
        error instanceof Error
          ? error.message
          : 'Please try again.'
      );
    } finally {
      setBusy(false);
    }
  }

  function createChore() {
    if (!title.trim()) {
      return Alert.alert(
        'Missing title',
        'Enter a chore name.'
      );
    }

    if (assignment === 'MANUAL' && !assignedToId) {
      return Alert.alert(
        'Choose roommate',
        'Select who will do this chore.'
      );
    }

    void perform(
      '/chores',
      'POST',
      {
        title: title.trim(),
        memberId,
        assignment,
        assignedToId,
        frequency,
      },
      () => {
        setTitle('');
        setShowForm(false);
      }
    );
  }

  function createNote() {
    if (!noteText.trim()) {
      return Alert.alert(
        'Empty note',
        'Write a message first.'
      );
    }

    void perform(
      '/board',
      'POST',
      {
        text: noteText.trim(),
        type: noteType,
        memberId,
      },
      () => {
        setNoteText('');
        setShowNoteForm(false);
      }
    );
  }

  const Chip = ({
    label,
    active,
    onPress,
  }: {
    label: string;
    active: boolean;
    onPress: () => void;
  }) => (
    <Pressable
      onPress={onPress}
      style={[s.chip, active && s.chipActive]}
    >
      <Text
        style={[
          s.chipText,
          active && s.chipTextActive,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView
        contentContainerStyle={s.page}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load(true);
            }}
            tintColor={BLUE}
          />
        }
      >
        {/* HEADER */}

        <View style={s.topbar}>
          <Pressable
            onPress={() => router.navigate('/(tabs)')}
            style={s.brandRow}
          >
            <View style={s.brandIcon}>
              <Ionicons
                name="home-outline"
                size={21}
                color="#FFFFFF"
              />
            </View>

            <Text style={s.brand}>
              roomie
              <Text style={{ color: BLUE }}>.</Text>
            </Text>
          </Pressable>

          <View style={s.apartmentPill}>
            <Ionicons
              name="home-outline"
              size={13}
              color={BLUE}
            />
            <Text
              style={s.apartmentPillText}
              numberOfLines={1}
            >
              {session?.apartmentName || 'Our apartment'}
            </Text>
          </View>
        </View>

        <Text style={s.heading}>
          Our space{' '}
          <Text style={{ color: BLUE }}>✦</Text>
        </Text>

        <Text style={s.subheading}>
          Everything happening at home, in one place.
        </Text>

        {/* BLUE DASHBOARD */}

        <View style={s.hero}>
          <View style={s.heroLine}>
            <View style={{ flex: 1 }}>
              <Text style={s.heroEyebrow}>
                YOUR HOME THIS WEEK
              </Text>

              <Text style={s.heroTitle}>
                Your shared space
              </Text>
            </View>

            <Ionicons
              name="sparkles-outline"
              size={27}
              color="#D1EBFF"
            />
          </View>

          <View style={s.heroStats}>
            <View style={s.heroStat}>
              <Text style={s.heroStatValue}>
                {chores.length - complete}
              </Text>

              <Text style={s.heroStatLabel}>
                Chores left
              </Text>
            </View>

            <View style={s.heroStat}>
              <Text style={s.heroStatValue}>
                {notes.length}
              </Text>

              <Text style={s.heroStatLabel}>
                Board notes
              </Text>
            </View>
          </View>

          <View style={s.track}>
            <View
              style={[
                s.fill,
                { width: `${progress}%` },
              ]}
            />
          </View>

          <Text style={s.heroFoot}>
            {complete} of {chores.length} chores completed
            {' · '}
            {progress}%
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator
            style={{ marginTop: 35 }}
            color={BLUE}
            size="large"
          />
        ) : (
          <>
            {/* APARTMENT BOARD */}

            <View style={s.sectionHead}>
              <View style={{ flex: 1 }}>
                <Text style={s.sectionTitle}>
                  Apartment board
                </Text>

                <Text style={s.sectionSubtitle}>
                  Little notes from your roommates
                </Text>
              </View>

              <Pressable
                accessibilityLabel="Add sticky note"
                style={s.addRound}
                onPress={() =>
                  setShowNoteForm(v => !v)
                }
              >
                <Ionicons
                  name={
                    showNoteForm ? 'close' : 'add'
                  }
                  size={22}
                  color={BLUE}
                />
              </Pressable>
            </View>

            {/* CREATE STICKY NOTE */}

            {showNoteForm && (
              <View style={s.panel}>
                <View style={s.formHeader}>
                  <View style={s.formIcon}>
                    <Ionicons
                      name="create-outline"
                      size={21}
                      color={BLUE}
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={s.formTitle}>
                      Leave a sticky note
                    </Text>

                    <Text style={s.formSubtitle}>
                      Share something with your home
                    </Text>
                  </View>
                </View>

                <TextInput
                  style={[s.input, s.noteInput]}
                  multiline
                  textAlignVertical="top"
                  placeholder="Landlord visiting tomorrow at 3 PM..."
                  placeholderTextColor="#8CA0AF"
                  value={noteText}
                  onChangeText={setNoteText}
                  maxLength={500}
                />

                <Text style={s.label}>
                  NOTE TYPE
                </Text>

                <View style={s.wrap}>
                  <Chip
                    label="📢 Notice"
                    active={noteType === 'NOTICE'}
                    onPress={() =>
                      setNoteType('NOTICE')
                    }
                  />

                  <Chip
                    label="🔔 Reminder"
                    active={noteType === 'REMINDER'}
                    onPress={() =>
                      setNoteType('REMINDER')
                    }
                  />

                  <Chip
                    label="❓ Question"
                    active={noteType === 'QUESTION'}
                    onPress={() =>
                      setNoteType('QUESTION')
                    }
                  />
                </View>

                <Pressable
                  style={[
                    s.primary,
                    busy && s.disabled,
                  ]}
                  disabled={busy}
                  onPress={createNote}
                >
                  <Ionicons
                    name="send-outline"
                    size={17}
                    color="#FFFFFF"
                  />

                  <Text style={s.primaryText}>
                    {busy ? 'Posting...' : 'Post note'}
                  </Text>
                </Pressable>
              </View>
            )}

            {/* NOTES */}

            {notes.length === 0 ? (
              <View style={s.boardEmpty}>
                <View style={s.emptyIconBox}>
                  <Ionicons
                    name="chatbubble-ellipses-outline"
                    size={25}
                    color={BLUE}
                  />
                </View>

                <Text style={s.emptyText}>
                  Your board is quiet
                </Text>

                <Text style={s.emptySub}>
                  No notes yet. Share an update with
                  your roommates.
                </Text>
              </View>
            ) : (
              <View style={s.noteGrid}>
                {notes.map(note => (
                  <View
                    key={note.id}
                    style={[
                      s.note,
                      {
                        backgroundColor:
                          noteColors[note.type],
                      },
                    ]}
                  >
                    <View style={s.noteHeader}>
                      <Ionicons
                        name={
                          note.type === 'NOTICE'
                            ? 'megaphone-outline'
                            : note.type === 'REMINDER'
                              ? 'alarm-outline'
                              : 'help-circle-outline'
                        }
                        size={16}
                        color={noteAccent[note.type]}
                      />

                      <Text
                        style={[
                          s.noteKind,
                          {
                            color:
                              noteAccent[note.type],
                          },
                        ]}
                      >
                        {note.type}
                      </Text>
                    </View>

                    <Text
                      style={s.noteBody}
                      numberOfLines={5}
                    >
                      {note.text}
                    </Text>

                    <Text style={s.noteAuthor}>
                      {note.author?.name || 'Roommate'}
                      {' · '}
                      {new Date(
                        note.createdAt
                      ).toLocaleDateString()}
                    </Text>

                    {note.authorId === memberId && (
                      <Pressable
                        onPress={() =>
                          Alert.alert(
                            'Remove note?',
                            'Delete this sticky note?',
                            [
                              {
                                text: 'Cancel',
                                style: 'cancel',
                              },
                              {
                                text: 'Delete',
                                style: 'destructive',
                                onPress: () =>
                                  void perform(
                                    `/board/${note.id}`,
                                    'DELETE',
                                    { memberId }
                                  ),
                              },
                            ]
                          )
                        }
                      >
                        <Text style={s.noteDelete}>
                          Remove
                        </Text>
                      </Pressable>
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* CHORES SECTION */}

            <View
              style={[
                s.sectionHead,
                { marginTop: 29 },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.sectionTitle}>
                  Chores
                </Text>

                <Text style={s.sectionSubtitle}>
                  Small tasks, happier home
                </Text>
              </View>

              <Pressable
                accessibilityLabel="Add new chore"
                style={s.addRound}
                onPress={() =>
                  setShowForm(v => !v)
                }
              >
                <Ionicons
                  name={showForm ? 'close' : 'add'}
                  size={22}
                  color={BLUE}
                />
              </Pressable>
            </View>

            {/* CREATE CHORE FORM */}

            {showForm && (
              <View style={s.panel}>
                <View style={s.formHeader}>
                  <View style={s.formIcon}>
                    <Ionicons
                      name="checkmark-done-outline"
                      size={22}
                      color={BLUE}
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={s.formTitle}>
                      Create a chore
                    </Text>

                    <Text style={s.formSubtitle}>
                      Keep your shared home organized
                    </Text>
                  </View>
                </View>

                <Text style={s.label}>
                  CHORE NAME
                </Text>

                <TextInput
                  style={s.input}
                  placeholder="e.g. Clean the kitchen"
                  placeholderTextColor="#8CA0AF"
                  value={title}
                  onChangeText={setTitle}
                  maxLength={120}
                />

                <Text style={s.label}>
                  ASSIGNMENT
                </Text>

                <View style={s.wrap}>
                  <Chip
                    label="🎲 Fair random"
                    active={assignment === 'RANDOM'}
                    onPress={() =>
                      setAssignment('RANDOM')
                    }
                  />

                  <Chip
                    label="🙋 Anyone can claim"
                    active={assignment === 'OPEN'}
                    onPress={() =>
                      setAssignment('OPEN')
                    }
                  />

                  <Chip
                    label="👤 Choose"
                    active={assignment === 'MANUAL'}
                    onPress={() =>
                      setAssignment('MANUAL')
                    }
                  />
                </View>

                {assignment === 'MANUAL' && (
                  <>
                    <Text style={s.label}>
                      SELECT ROOMMATE
                    </Text>

                    <View style={s.wrap}>
                      {members.map(m => (
                        <Chip
                          key={m.id}
                          label={m.name}
                          active={
                            assignedToId === m.id
                          }
                          onPress={() =>
                            setAssignedToId(m.id)
                          }
                        />
                      ))}
                    </View>
                  </>
                )}

                <Text style={s.label}>
                  REPEAT SETTING
                </Text>

                <View style={s.wrap}>
                  <Chip
                    label="Once"
                    active={frequency === 'ONCE'}
                    onPress={() =>
                      setFrequency('ONCE')
                    }
                  />

                  <Chip
                    label="Daily"
                    active={frequency === 'DAILY'}
                    onPress={() =>
                      setFrequency('DAILY')
                    }
                  />

                  <Chip
                    label="Weekly"
                    active={frequency === 'WEEKLY'}
                    onPress={() =>
                      setFrequency('WEEKLY')
                    }
                  />
                </View>

                <Pressable
                  disabled={busy}
                  style={[
                    s.primary,
                    busy && s.disabled,
                  ]}
                  onPress={createChore}
                >
                  <Ionicons
                    name="add-circle-outline"
                    size={19}
                    color="#FFFFFF"
                  />

                  <Text style={s.primaryText}>
                    {busy
                      ? 'Saving...'
                      : 'Create chore'}
                  </Text>
                </Pressable>
              </View>
            )}

            {/* CHORE FILTERS */}

            <View style={s.wrap}>
              <Chip
                label={`To do (${chores.length - complete})`}
                active={filter === 'ALL'}
                onPress={() => setFilter('ALL')}
              />

              <Chip
                label="Assigned to me"
                active={filter === 'MINE'}
                onPress={() => setFilter('MINE')}
              />

              <Chip
                label={`Completed (${complete})`}
                active={filter === 'DONE'}
                onPress={() => setFilter('DONE')}
              />
            </View>

            {/* CHORE LIST */}

            {visible.length === 0 ? (
              <View style={s.empty}>
                <View style={s.emptyIconBox}>
                  <Ionicons
                    name="checkbox-outline"
                    size={27}
                    color={BLUE}
                  />
                </View>

                <Text style={s.emptyText}>
                  No chores here yet
                </Text>

                <Text style={s.emptySub}>
                  Add a chore to get started.
                </Text>
              </View>
            ) : (
              visible.map(chore => (
                <View
                  key={chore.id}
                  style={s.choreCard}
                >
                  <View style={s.choreContent}>
                    <View style={s.choreIcon}>
                      <Ionicons
                        name={
                          chore.isCompleted
                            ? 'checkmark-done-outline'
                            : 'sparkles-outline'
                        }
                        size={22}
                        color={BLUE}
                      />
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          s.choreTitle,
                          chore.isCompleted && s.done,
                        ]}
                      >
                        {chore.title}
                      </Text>

                      <Text style={s.choreMeta}>
                        {chore.assignedTo
                          ? `👤 ${chore.assignedTo.name}`
                          : '🙋 Available to claim'}
                        {' · '}
                        {chore.frequency.toLowerCase()}
                      </Text>
                    </View>

                    <Ionicons
                      name={
                        chore.isCompleted
                          ? 'checkmark-circle'
                          : 'ellipse-outline'
                      }
                      size={23}
                      color={
                        chore.isCompleted
                          ? '#16876B'
                          : '#A3BDCF'
                      }
                    />
                  </View>

                  <View style={s.choreDivider} />

                  <View style={s.actions}>
                    {!chore.isCompleted &&
                      !chore.assignedToId && (
                        <Pressable
                          onPress={() =>
                            void perform(
                              `/chores/${chore.id}`,
                              'PATCH',
                              {
                                memberId,
                                action: 'CLAIM',
                              }
                            )
                          }
                        >
                          <Text style={s.action}>
                            Claim
                          </Text>
                        </Pressable>
                      )}

                    {!chore.isCompleted &&
                      chore.assignedToId ===
                        memberId && (
                        <Pressable
                          onPress={() =>
                            void perform(
                              `/chores/${chore.id}`,
                              'PATCH',
                              {
                                memberId,
                                action: 'COMPLETE',
                              }
                            )
                          }
                        >
                          <Text style={s.action}>
                            ✓ Mark done
                          </Text>
                        </Pressable>
                      )}

                    {chore.isCompleted &&
                      (chore.assignedToId ===
                        memberId ||
                        chore.createdById ===
                          memberId) && (
                        <Pressable
                          onPress={() =>
                            void perform(
                              `/chores/${chore.id}`,
                              'PATCH',
                              {
                                memberId,
                                action: 'REOPEN',
                              }
                            )
                          }
                        >
                          <Text style={s.action}>
                            Reopen
                          </Text>
                        </Pressable>
                      )}

                    {chore.createdById ===
                      memberId && (
                      <Pressable
                        onPress={() =>
                          Alert.alert(
                            'Delete chore?',
                            chore.title,
                            [
                              {
                                text: 'Cancel',
                                style: 'cancel',
                              },
                              {
                                text: 'Delete',
                                style: 'destructive',
                                onPress: () =>
                                  void perform(
                                    `/chores/${chore.id}`,
                                    'DELETE',
                                    { memberId }
                                  ),
                              },
                            ]
                          )
                        }
                      >
                        <Text style={s.delete}>
                          Delete
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              ))
            )}

            <Text style={s.hint}>
              Random assignment favors roommates with
              fewer unfinished chores. Repeat settings
              are saved; automatic recurrence is not
              yet enabled.
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F3F7FC',
  },

  page: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 115,
  },

  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 25,
  },

  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  brandIcon: {
    backgroundColor: BLUE,
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },

  brand: {
    fontSize: 25,
    fontWeight: '900',
    color: TEXT,
    letterSpacing: -1.2,
  },

  apartmentPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#E4F0F9',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 22,
    maxWidth: 160,
  },

  apartmentPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: BLUE,
  },

  heading: {
    fontSize: 30,
    fontWeight: '900',
    color: TEXT,
    letterSpacing: -0.9,
  },

  subheading: {
    fontSize: 13,
    color: MUTED,
    marginTop: 6,
    marginBottom: 22,
  },

  // Dashboard

  hero: {
    backgroundColor: BLUE,
    borderRadius: 26,
    padding: 22,
    marginBottom: 24,
    overflow: 'hidden',
  },

  heroLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  heroEyebrow: {
    color: '#CDE7F8',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.3,
  },

  heroTitle: {
    fontSize: 23,
    color: '#FFFFFF',
    fontWeight: '900',
    marginTop: 8,
  },

  heroStats: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 22,
  },

  heroStat: {
    flex: 1,
    backgroundColor: '#3079A8',
    borderRadius: 17,
    padding: 15,
  },

  heroStatValue: {
    fontSize: 29,
    fontWeight: '900',
    color: '#FFFFFF',
  },

  heroStatLabel: {
    fontSize: 11,
    color: '#E1F1FB',
    marginTop: 4,
    fontWeight: '600',
  },

  track: {
    height: 7,
    backgroundColor: '#448FB8',
    borderRadius: 9,
    overflow: 'hidden',
    marginTop: 20,
  },

  fill: {
    height: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 9,
  },

  heroFoot: {
    color: '#D8EDFA',
    fontSize: 11,
    marginTop: 10,
  },

  // Sections

  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 12,
  },

  sectionTitle: {
    fontSize: 21,
    fontWeight: '900',
    color: TEXT,
    letterSpacing: -0.4,
  },

  sectionSubtitle: {
    fontSize: 12,
    color: MUTED,
    marginTop: 5,
  },

  addRound: {
    width: 43,
    height: 43,
    borderRadius: 22,
    backgroundColor: '#DDEBF7',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Sticky notes

  noteGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
  },

  note: {
    width: '48.3%',
    borderRadius: 19,
    padding: 15,
    minHeight: 170,
    justifyContent: 'space-between',
  },

  noteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  noteKind: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },

  noteBody: {
    fontSize: 13,
    fontWeight: '700',
    color: '#382F35',
    marginTop: 13,
    lineHeight: 20,
    flex: 1,
  },

  noteAuthor: {
    fontSize: 10,
    color: '#7C8190',
    marginTop: 12,
  },

  noteDelete: {
    fontSize: 11,
    color: '#C2414F',
    marginTop: 9,
    fontWeight: '800',
  },

  // Forms

  panel: {
    backgroundColor: '#E5F0F9',
    borderRadius: 22,
    padding: 19,
    marginBottom: 21,
  },

  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 19,
  },

  formIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: '#D0E5F4',
    alignItems: 'center',
    justifyContent: 'center',
  },

  formTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: TEXT,
  },

  formSubtitle: {
    fontSize: 11,
    color: MUTED,
    marginTop: 4,
  },

  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 0,
    borderRadius: 14,
    padding: 15,
    color: TEXT,
    fontSize: 14,
    marginBottom: 14,
  },

  noteInput: {
    minHeight: 100,
  },

  label: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
    color: '#668094',
    marginTop: 6,
    marginBottom: 11,
  },

  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },

  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#DDEBF7',
    borderRadius: 25,
    marginBottom: 4,
  },

  chipActive: {
    backgroundColor: BLUE,
  },

  chipText: {
    color: '#315F7E',
    fontWeight: '700',
    fontSize: 12,
  },

  chipTextActive: {
    color: '#FFFFFF',
  },

  primary: {
    backgroundColor: BLUE,
    padding: 16,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    marginTop: 9,
  },

  primaryText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },

  disabled: {
    opacity: 0.5,
  },

  // Empty states

  boardEmpty: {
    padding: 25,
    backgroundColor: '#E5F0F9',
    borderRadius: 20,
    alignItems: 'center',
    gap: 8,
  },

  empty: {
    alignItems: 'center',
    gap: 9,
    padding: 35,
    backgroundColor: '#E5F0F9',
    borderRadius: 21,
    marginTop: 8,
  },

  emptyIconBox: {
    width: 55,
    height: 55,
    borderRadius: 18,
    backgroundColor: '#D0E5F4',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 5,
  },

  emptyText: {
    fontSize: 16,
    fontWeight: '800',
    color: TEXT,
    textAlign: 'center',
  },

  emptySub: {
    color: MUTED,
    marginTop: 5,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },

  // Chore cards

  choreCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 19,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#153D57',
    shadowOpacity: 0.035,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 3,
    },
    elevation: 1,
  },

  choreContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },

  choreIcon: {
    backgroundColor: '#E4F1FA',
    borderRadius: 15,
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },

  choreTitle: {
    fontWeight: '800',
    color: TEXT,
    fontSize: 15,
  },

  done: {
    textDecorationLine: 'line-through',
    color: '#94A3B8',
  },

  choreMeta: {
    color: MUTED,
    fontSize: 12,
    marginTop: 6,
    lineHeight: 18,
  },

  choreDivider: {
    height: 1,
    backgroundColor: '#EEF2F6',
    marginTop: 15,
    marginBottom: 13,
  },

  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 15,
  },

  action: {
    color: BLUE_DARK,
    fontSize: 12,
    fontWeight: '800',
  },

  delete: {
    color: '#C2414F',
    fontSize: 12,
    fontWeight: '700',
  },

  hint: {
    color: MUTED,
    fontSize: 11,
    lineHeight: 18,
    marginTop: 14,
  },
});
