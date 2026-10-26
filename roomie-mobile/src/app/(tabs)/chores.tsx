import { useCallback, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useApartment } from '../../context/ApartmentContext';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://10.106.217.165:3000';
const PURPLE = '#0369A1'; // Deep Ocean Blue — Chores theme
type Member = { id: string; name: string };
type Chore = { id: string; title: string; frequency: 'ONCE'|'DAILY'|'WEEKLY'; isCompleted: boolean; assignedToId: string|null; createdById: string; assignedTo: Member|null; createdBy: Member; createdAt: string };
type Note = { id: string; text: string; type: 'NOTICE'|'REMINDER'|'QUESTION'; authorId: string; author: Member; createdAt: string };
const noteColors = { NOTICE: '#FFF0BD', REMINDER: '#DDF5E9', QUESTION: '#E9E3FF' };

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
  const [filter, setFilter] = useState<'ALL'|'MINE'|'DONE'>('ALL');
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [assignment, setAssignment] = useState<'RANDOM'|'OPEN'|'MANUAL'>('RANDOM');
  const [assignedToId, setAssignedToId] = useState('');
  const [frequency, setFrequency] = useState<'ONCE'|'DAILY'|'WEEKLY'>('ONCE');
  const [noteText, setNoteText] = useState('');
  const [noteType, setNoteType] = useState<'NOTICE'|'REMINDER'|'QUESTION'>('REMINDER');

  const root = `${API_URL}/api/apartments/${encodeURIComponent(code)}`;
  async function request(path: string, options?: RequestInit) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(root + path, { ...options, signal: controller.signal, headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Request failed');
      return result;
    } finally { clearTimeout(timeout); }
  }
  const load = useCallback(async (silent = false) => {
    if (!code || !memberId) { setLoading(false); setRefreshing(false); return; }
    if (!silent) setLoading(true);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      try {
        const [a, b] = await Promise.all([
          fetch(`${API_URL}/api/apartments/${encodeURIComponent(code)}/chores`, { signal: controller.signal }),
          fetch(`${API_URL}/api/apartments/${encodeURIComponent(code)}/board`, { signal: controller.signal }),
        ]);
        const [choreData, boardData] = await Promise.all([a.json(), b.json()]);
        if (!a.ok || !b.ok) throw new Error(choreData.error || boardData.error || 'Unable to load chores');
        setChores(choreData.chores || []);
        setMembers(choreData.members || []);
        setNotes(boardData.notes || []);
      } finally { clearTimeout(timeout); }
    } catch (error) { Alert.alert('Unable to load', error instanceof Error ? error.message : 'Check your backend connection.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [code, memberId]);
  useFocusEffect(useCallback(() => { if (!sessionLoading) void load(); }, [sessionLoading, load]));
  const complete = chores.filter(c => c.isCompleted).length;
  const progress = chores.length ? Math.round(complete / chores.length * 100) : 0;
  const visible = useMemo(() => chores.filter(c => filter === 'MINE' ? c.assignedToId === memberId && !c.isCompleted : filter === 'DONE' ? c.isCompleted : !c.isCompleted), [chores, filter, memberId]);
  async function perform(path: string, method: string, body: object, after?: () => void) {
    if (busy) return;
    setBusy(true);
    try { await request(path, { method, body: JSON.stringify(body) }); after?.(); await load(true); }
    catch (error) { Alert.alert('Could not save', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setBusy(false); }
  }
  function createChore() {
    if (!title.trim()) return Alert.alert('Missing title', 'Enter a chore name.');
    if (assignment === 'MANUAL' && !assignedToId) return Alert.alert('Choose roommate', 'Select who will do this chore.');
    void perform('/chores', 'POST', { title: title.trim(), memberId, assignment, assignedToId, frequency }, () => { setTitle(''); setShowForm(false); });
  }
  function createNote() {
    if (!noteText.trim()) return Alert.alert('Empty note', 'Write a message first.');
    void perform('/board', 'POST', { text: noteText.trim(), type: noteType, memberId }, () => { setNoteText(''); setShowNoteForm(false); });
  }
  const Chip = ({ label, active, onPress }: {label: string; active: boolean; onPress: () => void}) => (
    <Pressable onPress={onPress} style={[s.chip, active && s.chipActive]}><Text style={[s.chipText, active && s.chipTextActive]}>{label}</Text></Pressable>
  );
  return <SafeAreaView style={s.safe}>
    <ScrollView contentContainerStyle={s.page} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(true); }} tintColor={PURPLE} />}>
      <View pointerEvents="none" style={s.ambientOrbTop} />
      <View pointerEvents="none" style={s.ambientOrbBottom} />
      <View style={s.topbar}><Pressable onPress={() => router.navigate('/(tabs)')} style={s.brandRow}><View style={s.brandIcon}><Ionicons name="home-outline" size={21} color="#FFFFFF" /></View><Text style={s.brand}>roomie<Text style={{color:PURPLE}}>.</Text></Text></Pressable><View style={s.apartmentPill}><Ionicons name="home-outline" size={13} color={PURPLE} /><Text style={s.apartmentPillText} numberOfLines={1}>{session?.apartmentName || 'Our apartment'}</Text></View></View>
      <Text style={s.heading}>Our space <Text style={{color:PURPLE}}>✦</Text></Text>
      <Text style={s.subheading}>Everything happening at home, in one place.</Text>
      <View style={s.hero}><View pointerEvents="none" style={s.heroGlow} /><View pointerEvents="none" style={s.heroGlowSmall} /><View style={s.heroLine}><View><Text style={s.heroEyebrow}>YOUR HOME THIS WEEK</Text><Text style={s.heroTitle}>Your shared space</Text></View><Ionicons name="sparkles-outline" size={27} color="#FFFFFF" /></View><View style={s.heroStats}><View style={s.heroStat}><Text style={s.heroStatValue}>{chores.length - complete}</Text><Text style={s.heroStatLabel}>Chores left</Text></View><View style={s.heroStat}><Text style={s.heroStatValue}>{notes.length}</Text><Text style={s.heroStatLabel}>Board notes</Text></View></View><View style={s.track}><View style={[s.fill,{width:`${progress}%`}]} /></View><Text style={s.heroFoot}>{complete} of {chores.length} chores completed · {progress}%</Text></View>
      {loading ? <ActivityIndicator style={{marginTop: 35}} color={PURPLE} size="large" /> : <>
        <View style={s.sectionHead}><View><Text style={s.sectionTitle}>Apartment board</Text><Text style={s.sectionSubtitle}>Little notes from your roommates</Text></View><Pressable accessibilityLabel="Add sticky note" style={s.addRound} onPress={() => setShowNoteForm(v => !v)}><Ionicons name={showNoteForm ? 'close' : 'add'} size={21} color={PURPLE} /></Pressable></View>
        {showNoteForm && <View style={s.panel}><Text style={s.formTitle}>Leave a sticky note</Text><TextInput style={[s.input,s.noteInput]} multiline textAlignVertical="top" placeholder="Landlord visiting tomorrow at 3 PM..." placeholderTextColor="#9994AC" value={noteText} onChangeText={setNoteText} maxLength={500}/><View style={s.wrap}><Chip label="📢 Notice" active={noteType === 'NOTICE'} onPress={() => setNoteType('NOTICE')}/><Chip label="🔔 Reminder" active={noteType === 'REMINDER'} onPress={() => setNoteType('REMINDER')}/><Chip label="❓ Question" active={noteType === 'QUESTION'} onPress={() => setNoteType('QUESTION')}/></View><Pressable style={[s.primary,busy && s.disabled]} disabled={busy} onPress={createNote}><Text style={s.primaryText}>{busy ? 'Posting...' : 'Post note'}</Text></Pressable></View>}
        {notes.length === 0 ? <View style={s.boardEmpty}><Text style={s.emptySub}>No notes yet. Share an update with your roommates.</Text></View> : <View style={s.noteGrid}>{notes.map(note => <View key={note.id} style={[s.note,{backgroundColor:noteColors[note.type]}]}><View style={s.noteHeader}><Ionicons name={note.type === 'NOTICE' ? 'megaphone-outline' : note.type === 'REMINDER' ? 'alarm-outline' : 'help-circle-outline'} size={15} color="#475569" /><Text style={s.noteKind}>{note.type}</Text></View><Text style={s.noteBody} numberOfLines={5}>{note.text}</Text><Text style={s.noteAuthor}>{note.author?.name || 'Roommate'} · {new Date(note.createdAt).toLocaleDateString()}</Text>{note.authorId === memberId && <Pressable onPress={() => Alert.alert('Remove note?', 'Delete this sticky note?', [{text:'Cancel',style:'cancel'},{text:'Delete',style:'destructive',onPress:()=>void perform(`/board/${note.id}`,'DELETE',{memberId})}])}><Text style={s.noteDelete}>Remove</Text></Pressable>}</View>)}</View>}
        <View style={[s.sectionHead,{marginTop:26}]}><View><Text style={s.sectionTitle}>Chores</Text><Text style={s.sectionSubtitle}>Small tasks, happier home</Text></View><Pressable accessibilityLabel="Add new chore" style={s.addRound} onPress={() => setShowForm(v => !v)}><Ionicons name={showForm ? 'close' : 'add'} size={21} color={PURPLE} /></Pressable></View>
        {showForm && <View style={s.panel}><Text style={s.formTitle}>Create a chore</Text><TextInput style={s.input} placeholder="e.g. Clean the kitchen" placeholderTextColor="#9994AC" value={title} onChangeText={setTitle} maxLength={120}/><Text style={s.label}>ASSIGNMENT</Text><View style={s.wrap}><Chip label="🎲 Fair random" active={assignment === 'RANDOM'} onPress={() => setAssignment('RANDOM')}/><Chip label="🙋 Anyone can claim" active={assignment === 'OPEN'} onPress={() => setAssignment('OPEN')}/><Chip label="👤 Choose" active={assignment === 'MANUAL'} onPress={() => setAssignment('MANUAL')}/></View>{assignment === 'MANUAL' && <View style={s.wrap}>{members.map(m => <Chip key={m.id} label={m.name} active={assignedToId === m.id} onPress={() => setAssignedToId(m.id)}/>)}</View>}<Text style={s.label}>REPEAT SETTING</Text><View style={s.wrap}><Chip label="Once" active={frequency === 'ONCE'} onPress={() => setFrequency('ONCE')}/><Chip label="Daily" active={frequency === 'DAILY'} onPress={() => setFrequency('DAILY')}/><Chip label="Weekly" active={frequency === 'WEEKLY'} onPress={() => setFrequency('WEEKLY')}/></View><Pressable disabled={busy} style={[s.primary, busy && s.disabled]} onPress={createChore}><Text style={s.primaryText}>{busy ? 'Saving...' : 'Create chore'}</Text></Pressable></View>}
        <View style={s.wrap}><Chip label={`To do (${chores.length - complete})`} active={filter === 'ALL'} onPress={() => setFilter('ALL')}/><Chip label="Assigned to me" active={filter === 'MINE'} onPress={() => setFilter('MINE')}/><Chip label={`Completed (${complete})`} active={filter === 'DONE'} onPress={() => setFilter('DONE')}/></View>
        {visible.length === 0 ? <View style={s.empty}><Ionicons name="checkbox-outline" size={32} color={PURPLE} /><Text style={s.emptyText}>No chores here yet</Text><Text style={s.emptySub}>Add a chore to get started.</Text></View> : visible.map(chore => <View key={chore.id} style={s.choreCard}><View style={s.choreIcon}><Ionicons name={chore.isCompleted ? 'checkmark-done-outline' : 'sparkles-outline'} size={22} color={PURPLE} /></View><View style={{flex: 1}}><Text style={[s.choreTitle, chore.isCompleted && s.done]}>{chore.title}</Text><Text style={s.choreMeta}>{chore.assignedTo ? `👤 ${chore.assignedTo.name}` : '🙋 Available to claim'} · {chore.frequency.toLowerCase()}</Text><View style={s.actions}>{!chore.isCompleted && !chore.assignedToId && <Pressable onPress={() => void perform(`/chores/${chore.id}`, 'PATCH', {memberId, action:'CLAIM'})}><Text style={s.action}>Claim</Text></Pressable>}{!chore.isCompleted && chore.assignedToId === memberId && <Pressable onPress={() => void perform(`/chores/${chore.id}`, 'PATCH', {memberId, action:'COMPLETE'})}><Text style={s.action}>✓ Mark done</Text></Pressable>}{chore.isCompleted && (chore.assignedToId === memberId || chore.createdById === memberId) && <Pressable onPress={() => void perform(`/chores/${chore.id}`, 'PATCH', {memberId, action:'REOPEN'})}><Text style={s.action}>Reopen</Text></Pressable>}{chore.createdById === memberId && <Pressable onPress={() => Alert.alert('Delete chore?', chore.title, [{text:'Cancel', style:'cancel'}, {text:'Delete', style:'destructive', onPress: () => void perform(`/chores/${chore.id}`, 'DELETE', {memberId})}])}><Text style={s.delete}>Delete</Text></Pressable>}</View></View></View>)}
        <Text style={s.hint}>Random assignment favors roommates with fewer unfinished chores. Repeat settings are saved; automatic recurrence is not yet enabled.</Text>
      </>}
    </ScrollView>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#EDF5FA' },
  ambientOrbTop: { position: 'absolute', top: 120, right: -90, width: 290, height: 290, borderRadius: 145, backgroundColor: 'rgba(85,177,226,0.19)' },
  ambientOrbBottom: { position: 'absolute', top: 520, left: -120, width: 310, height: 310, borderRadius: 155, backgroundColor: 'rgba(125,211,252,0.15)' },
  page: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 115 },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 25 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandIcon: { backgroundColor: PURPLE, width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  brandIconText: { fontSize: 24, color: '#FFF', fontWeight: '800' },
  brand: { fontSize: 25, fontWeight: '900', color: '#1E293B', letterSpacing: -1.2 },
  apartmentPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.73)', borderColor: 'rgba(255,255,255,0.96)', borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 22, maxWidth: 160 },
  apartmentPillText: { fontSize: 11, fontWeight: '700', color: PURPLE },
  heading: { fontSize: 30, fontWeight: '900', color: '#1E293B', letterSpacing: -0.9 },
  subheading: { fontSize: 13, color: '#64748B', marginTop: 6, marginBottom: 22 },
  hero: { backgroundColor: PURPLE, borderRadius: 27, padding: 22, marginBottom: 20, overflow: 'hidden', borderWidth: 1, borderColor: '#3185B7', shadowColor: '#0369A1', shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: {width: 0, height: 9}, elevation: 5 },
  heroGlow: { position: 'absolute', right: -60, top: -100, width: 225, height: 225, borderRadius: 120, backgroundColor: 'rgba(255,255,255,0.11)' },
  heroGlowSmall: { position: 'absolute', left: -45, bottom: -85, width: 165, height: 165, borderRadius: 85, backgroundColor: 'rgba(255,255,255,0.06)' },
  heroLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroEyebrow: { color: '#D9F2FF', fontSize: 10, fontWeight: '800', letterSpacing: 1.3 },
  heroTitle: { fontSize: 23, color: '#FFF', fontWeight: '900', marginTop: 8 },
  heroSparkle: { color: '#FFF', fontSize: 30 },
  heroStats: { flexDirection: 'row', gap: 12, marginTop: 22 },
  heroStat: { flex: 1, backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)', borderRadius: 17, padding: 15 },
  heroStatValue: { fontSize: 29, fontWeight: '900', color: '#FFF' },
  heroStatLabel: { fontSize: 11, color: '#E0F2FE', marginTop: 4, fontWeight: '600' },
  track: { height: 7, backgroundColor: 'rgba(255,255,255,0.27)', borderRadius: 9, overflow: 'hidden', marginTop: 20 },
  fill: { height: '100%', backgroundColor: '#FFFFFF', borderRadius: 9 },
  heroFoot: { color: '#E0F2FE', fontSize: 11, marginTop: 10 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  sectionTitle: { fontSize: 21, fontWeight: '900', color: '#1E293B', letterSpacing: -0.4 },
  sectionSubtitle: { fontSize: 12, color: '#64748B', marginTop: 5 },
  addRound: { width: 43, height: 43, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.78)', borderWidth: 1, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', shadowColor: PURPLE, shadowOpacity: 0.07, shadowRadius: 9, elevation: 2 },
  addRoundText: { fontSize: 23, color: PURPLE, fontWeight: '700', lineHeight: 27 },
  noteGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  note: { width: '48.3%', borderRadius: 19, padding: 15, minHeight: 170, justifyContent: 'space-between', borderWidth: 1, borderColor: 'rgba(255,255,255,0.75)', shadowColor: '#1E293B', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: {width: 0, height: 5}, elevation: 2 },
  noteHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  noteKind: { fontSize: 10, fontWeight: '800', color: '#475569', letterSpacing: 0.4 },
  noteBody: { fontSize: 13, fontWeight: '700', color: '#1E293B', marginTop: 13, lineHeight: 20, flex: 1 },
  noteAuthor: { fontSize: 10, color: '#64748B', marginTop: 12 },
  noteDelete: { fontSize: 11, color: '#B45353', marginTop: 9, fontWeight: '800' },
  boardEmpty: { padding: 25, backgroundColor: 'rgba(255,255,255,0.78)', borderWidth: 1, borderColor: '#FFFFFF', borderRadius: 20 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, backgroundColor: 'rgba(255,255,255,0.76)', borderWidth: 1, borderColor: '#D9E8F2', borderRadius: 25, marginBottom: 4 },
  chipActive: { backgroundColor: PURPLE, borderColor: PURPLE },
  chipText: { color: '#47677B', fontWeight: '700', fontSize: 12 },
  chipTextActive: { color: '#FFF' },
  panel: { backgroundColor: 'rgba(255,255,255,0.78)', borderRadius: 23, padding: 19, marginBottom: 21, borderWidth: 1, borderColor: '#FFFFFF', shadowColor: '#0369A1', shadowOpacity: 0.07, shadowRadius: 14, shadowOffset: {width: 0, height: 6}, elevation: 2 },
  formTitle: { fontSize: 17, fontWeight: '900', color: '#1E293B', marginBottom: 16 },
  input: { borderWidth: 1, borderColor: '#D9E8F2', borderRadius: 15, padding: 14, color: '#1E293B', fontSize: 14, marginBottom: 14, backgroundColor: 'rgba(255,255,255,0.76)' },
  noteInput: { minHeight: 100 },
  label: { fontSize: 10, fontWeight: '800', letterSpacing: 1.1, color: '#64748B', marginTop: 6, marginBottom: 11 },
  primary: { backgroundColor: PURPLE, padding: 16, borderRadius: 15, alignItems: 'center', marginTop: 9, shadowColor: PURPLE, shadowOpacity: 0.15, shadowRadius: 9, elevation: 2 },
  primaryText: { color: '#FFF', fontWeight: '800', fontSize: 14 },
  disabled: { opacity: 0.5 },
  empty: { alignItems: 'center', gap: 9, padding: 35, backgroundColor: 'rgba(255,255,255,0.78)', borderWidth: 1, borderColor: '#FFFFFF', borderRadius: 21, marginTop: 8 },
  emptyIcon: { fontSize: 34, marginBottom: 10 },
  emptyText: { fontSize: 16, fontWeight: '800', color: '#1E293B' },
  emptySub: { color: '#64748B', marginTop: 5, fontSize: 13, lineHeight: 19 },
  choreCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.78)', borderRadius: 21, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#FFFFFF', gap: 13, shadowColor: '#0369A1', shadowOpacity: 0.055, shadowRadius: 12, shadowOffset: {width: 0, height: 5}, elevation: 2 },
  choreIcon: { backgroundColor: '#E0F2FE', borderRadius: 15, width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  choreTitle: { fontWeight: '800', color: '#1E293B', fontSize: 15 },
  done: { textDecorationLine: 'line-through', color: '#94A3B8' },
  choreMeta: { color: '#64748B', fontSize: 12, marginTop: 6, lineHeight: 18 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 15, marginTop: 13 },
  action: { color: PURPLE, fontSize: 12, fontWeight: '800' },
  delete: { color: '#C2414F', fontSize: 12, fontWeight: '700' },
  hint: { color: '#64748B', fontSize: 11, lineHeight: 18, marginTop: 14 },
});
