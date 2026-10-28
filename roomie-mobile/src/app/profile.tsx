import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, Pressable, RefreshControl,
  ScrollView, StyleSheet, Text, View, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import * as ImagePicker from 'expo-image-picker';
import { useApartment } from '../context/ApartmentContext';

const API_URL = process.env.EXPO_PUBLIC_API_URL;
const C = {
  bg: '#F7F5FC', ink: '#24243C', muted: '#77768D',
  purple: '#6B21A8', deep: '#512184', soft: '#EEE5F9',
  white: '#FFFFFF', red: '#C74761', line: '#EFEBF5',
};

type IconName = React.ComponentProps<typeof Ionicons>['name'];
type Member = { id: string; name: string; photoUrl?: string | null };

function SettingsRow({ icon, title, subtitle, danger = false, onPress }: {
  icon: IconName; title: string; subtitle: string;
  danger?: boolean; onPress: () => void;
}) {
  const color = danger ? C.red : C.purple;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.settingsRow, pressed && { opacity: 0.65 }]}>
      <View style={[s.settingsIcon, { backgroundColor: danger ? '#FCE9ED' : C.soft }]}>
        <Ionicons name={icon} size={21} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.settingsTitle, { color }]}>{title}</Text>
        <Text style={s.settingsSubtitle}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={C.muted} />
    </Pressable>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const { session, logout } = useApartment();
  const [busy, setBusy] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  const memberName = session?.memberName || 'Roommate';
  const apartmentName = session?.apartmentName || 'Our apartment';
  const apartmentCode = session?.code || '';
  const memberId = session?.memberId || '';
  const initial = memberName.trim().charAt(0).toUpperCase() || 'R';

  const currentMember = members.find(m => m.id === memberId);
  const photoUri = (value?: string | null) => {
    if (!value) return null;
    if (/^https?:\/\//i.test(value)) return value;
    if (!API_URL) return null;
    return `${API_URL.replace(/\/$/, '')}${value.startsWith('/') ? '' : '/'}${value}`;
  };

  async function choosePhoto() {
    if (!apartmentCode || !memberId || photoBusy) return;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Allow photo library access to select a profile picture.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setPhotoBusy(true);
      const form = new FormData();
      form.append('photo', {
        uri: asset.uri,
        name: 'avatar.jpg',
        type: 'image/jpeg',
      } as any);
      const response = await fetch(
        `${API_URL}/api/apartments/${encodeURIComponent(apartmentCode)}/members/${encodeURIComponent(memberId)}/photo`,
        { method: 'PUT', body: form }
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Could not upload photo');
      }
      await loadMembers();
    } catch (error) {
      Alert.alert('Photo update failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setPhotoBusy(false);
    }
  }

  function removePhoto() {
    if (!currentMember?.photoUrl || photoBusy) return;
    Alert.alert('Remove profile photo?', 'Your initial will be shown instead.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void (async () => {
        try {
          setPhotoBusy(true);
          const response = await fetch(
            `${API_URL}/api/apartments/${encodeURIComponent(apartmentCode)}/members/${encodeURIComponent(memberId)}/photo`,
            { method: 'DELETE' }
          );
          if (!response.ok) throw new Error('Could not remove photo');
          await loadMembers();
        } catch (error) {
          Alert.alert('Error', error instanceof Error ? error.message : 'Please try again.');
        } finally {
          setPhotoBusy(false);
        }
      })() },
    ]);
  }

  // Loads the roommate list including optional photoUrl.
  const loadMembers = useCallback(async () => {
    if (!apartmentCode) {
      setMembers([]);
      setMembersError(false);
      setRefreshing(false);
      return;
    }
    setMembersLoading(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(
        `${API_URL}/api/apartments/${encodeURIComponent(apartmentCode)}/members`,
        { signal: controller.signal }
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data.members)) throw new Error('Members missing in response');
      setMembers(data.members.filter((m: unknown): m is Member =>
        typeof m === 'object' && m !== null &&
        typeof (m as Member).id === 'string' &&
        typeof (m as Member).name === 'string'
      ));
      setMembersError(false);
    } catch {
      setMembersError(true);
    } finally {
      clearTimeout(timeout);
      setMembersLoading(false);
      setRefreshing(false);
    }
  }, [apartmentCode]);

  useFocusEffect(useCallback(() => { void loadMembers(); }, [loadMembers]));

  const copyCode = async () => {
    if (!apartmentCode) return;
    try {
      await Clipboard.setStringAsync(apartmentCode);
      Alert.alert('Copied', 'Apartment invite code copied.');
    } catch {
      Alert.alert('Could not copy', 'Please copy the code manually.');
    }
  };

  const leaveCurrentApartment = async () => {
    if (busy) return;
    try {
      setBusy(true);
      await logout();
      router.replace('/');
    } catch (error) {
      console.error('Session clearing failed:', error);
      Alert.alert('Something went wrong', 'Could not clear your apartment session.');
    } finally {
      setBusy(false);
    }
  };

  const confirmSwitch = () => Alert.alert(
    'Switch apartment?',
    'Return to create/join. Your apartment data remains in the database.',
    [{ text: 'Cancel', style: 'cancel' }, { text: 'Switch', onPress: () => void leaveCurrentApartment() }]
  );
  const confirmLogout = () => Alert.alert(
    'Log out of Roomie?',
    'You will need to join your apartment again to continue.',
    [{ text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => void leaveCurrentApartment() }]
  );

  return (
    <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={C.purple}
          onRefresh={() => { setRefreshing(true); void loadMembers(); }} />}
      >
        <View style={s.brandRow}>
          <View style={s.brandIcon}><Ionicons name="home-outline" size={21} color={C.white} /></View>
          <Text style={s.brandText}>roomie<Text style={{ color: C.purple }}>.</Text></Text>
          <View style={{ flex: 1 }} />
          <View style={s.brandPill}><Ionicons name="shield-checkmark-outline" size={14} color={C.purple} />
            <Text style={s.brandPillText}>MY SPACE</Text></View>
        </View>

        <View style={s.header}>
          <Pressable onPress={() => router.back()} style={s.backButton} accessibilityLabel="Go back">
            <Ionicons name="arrow-back" size={21} color={C.ink} />
          </Pressable>
          <Text style={s.headerTitle}>My profile</Text>
        </View>

        <View style={s.profileCard}>
          <View style={s.profileTop}>
            <Text style={s.profileEyebrow}>YOUR ROOMIE PROFILE</Text>
            <Ionicons name="sparkles-outline" size={23} color="#EBD8FF" />
          </View>
          <Pressable onPress={() => void choosePhoto()} disabled={photoBusy} style={s.avatarButton} accessibilityLabel="Choose profile photo">
            <View style={s.avatar}>
              {photoUri(currentMember?.photoUrl) ? (
                <Image source={{ uri: photoUri(currentMember?.photoUrl)! }} style={s.avatarImage} />
              ) : <Text style={s.avatarText}>{initial}</Text>}
            </View>
            <View style={s.cameraBadge}><Ionicons name="camera" size={16} color={C.purple} /></View>
          </Pressable>
          <Pressable onPress={() => void choosePhoto()} disabled={photoBusy}>
            <Text style={s.changePhoto}>{photoBusy ? 'Saving photo…' : currentMember?.photoUrl ? 'Change profile photo' : 'Add profile photo (optional)'}</Text>
          </Pressable>
          {!!currentMember?.photoUrl && !photoBusy && (
            <Pressable onPress={removePhoto}><Text style={s.removePhoto}>Remove photo</Text></Pressable>
          )}
          <Text style={s.memberName}>{memberName}</Text>
          <Text style={s.memberRole}>Roomie member</Text>
          <View style={s.memberPill}><Ionicons name="checkmark-circle" size={16} color="#D1FAE5" />
            <Text style={s.memberPillText}>Connected to apartment</Text></View>
        </View>

        <View style={s.sectionHead}>
          <Text style={s.sectionTitle}>My apartment <Text style={{ color: C.purple }}>✦</Text></Text>
        </View>
        <View style={s.apartmentCard}>
          <View style={s.apartmentHeading}>
            <View style={s.apartmentIcon}><Ionicons name="home-outline" size={23} color={C.purple} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.eyebrow}>YOUR SHARED HOME</Text>
              <Text style={s.apartmentName}>{apartmentName}</Text>
            </View>
          </View>
          <View style={s.divider} />
          <Text style={s.fieldLabel}>Apartment invite code</Text>
          <Pressable onPress={() => void copyCode()} style={s.codeBox} accessibilityLabel="Copy apartment code">
            <Text style={s.codeText}>{apartmentCode || 'Unavailable'}</Text>
            <Ionicons name="copy-outline" size={20} color={C.purple} />
          </Pressable>
          <Text style={s.hint}>Share this code with someone you trust to join your apartment.</Text>
        </View>

        <View style={s.sectionHead}>
          <View>
            <Text style={s.sectionTitle}>Your roommates</Text>
            <Text style={s.sectionSubtitle}>Everyone sharing this space</Text>
          </View>
          <View style={s.countPill}><Text style={s.countText}>{membersLoading ? '…' : members.length}</Text></View>
        </View>
        <View style={s.roommatesCard}>
          {membersLoading && members.length === 0 ? (
            <ActivityIndicator color={C.purple} style={{ padding: 20 }} />
          ) : membersError ? (
            <View style={s.messageBox}>
              <Text style={s.hint}>Could not load roommates.</Text>
              <Pressable onPress={() => void loadMembers()}><Text style={s.retry}>Try again</Text></Pressable>
            </View>
          ) : members.length === 0 ? (
            <Text style={[s.hint, { padding: 20 }]}>No roommates found yet.</Text>
          ) : members.map((m, index) => (
            <View key={m.id} style={[s.roommateRow, index > 0 && s.rowBorder]}>
              <View style={[s.roommateAvatar, { backgroundColor: ['#EAE4FA', '#DFF1ED', '#FBEAD8', '#E2EDFA'][index % 4] }]}>
                {photoUri(m.photoUrl) ? (
                  <Image source={{ uri: photoUri(m.photoUrl)! }} style={s.roommateImage} />
                ) : <Text style={s.roommateInitial}>{m.name.trim().charAt(0).toUpperCase() || '?'}</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.roommateName}>{m.name}</Text>
                <Text style={s.roommateSub}>{m.id === memberId ? 'Your profile' : 'Apartment member'}</Text>
              </View>
              {m.id === memberId ? <View style={s.youPill}><Text style={s.youText}>YOU</Text></View>
                : <Ionicons name="checkmark-circle-outline" size={20} color="#78A999" />}
            </View>
          ))}
        </View>

        <View style={s.sectionHead}>
          <View>
            <Text style={s.sectionTitle}>Invite a roommate</Text>
            <Text style={s.sectionSubtitle}>Scan to get the joining code</Text>
          </View>
          <View style={s.qrIcon}><Ionicons name="qr-code-outline" size={20} color={C.purple} /></View>
        </View>
        <View style={s.inviteCard}>
          <View style={s.qrFrame}>
            {apartmentCode ? (
              <QRCode value={apartmentCode} size={190} color={C.deep} backgroundColor="#FFFFFF" />
            ) : <Text style={s.hint}>Invite code unavailable</Text>}
          </View>
          <Text style={s.inviteTitle}>Bring your roommates in</Text>
          <Text style={s.inviteSubtitle}>
            Let them scan this QR code to read the apartment code, then enter it in Roomie's Join Apartment screen.
          </Text>
          <Pressable onPress={() => void copyCode()} style={s.copyButton} disabled={!apartmentCode}>
            <Ionicons name="copy-outline" size={18} color={C.white} />
            <Text style={s.copyButtonText}>Copy invite code</Text>
          </Pressable>
          <View style={s.securityRow}><Ionicons name="lock-closed-outline" size={15} color={C.muted} />
            <Text style={s.securityText}>Anyone with this code can request to join using the existing flow. Share privately.</Text></View>
        </View>

        <Text style={s.sectionTitle}>Account & apartment</Text>
        <View style={s.settingsCard}>
          <SettingsRow icon="swap-horizontal-outline" title="Switch apartment"
            subtitle="Join or create another apartment" onPress={confirmSwitch} />
          <View style={s.rowBorder} />
          <SettingsRow icon="log-out-outline" title="Log out"
            subtitle="Clear your current Roomie session" danger onPress={confirmLogout} />
        </View>
        {busy && <ActivityIndicator color={C.purple} style={{ marginTop: 20 }} />}
        <Text style={s.footer}>Your home, in sync. ✦</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 55 },
  brandRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 23 },
  brandIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: C.purple, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  brandText: { fontSize: 26, fontWeight: '900', color: C.ink, letterSpacing: -1.2 },
  brandPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.soft, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 22 },
  brandPillText: { fontSize: 10, fontWeight: '800', color: C.purple },
  header: { flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 18 },
  backButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 23, fontWeight: '900', color: C.ink },
  profileCard: { backgroundColor: C.deep, borderRadius: 26, padding: 22, alignItems: 'center', marginBottom: 28 },
  profileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 12 },
  profileEyebrow: { color: '#E9D5FF', fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  avatar: { width: 82, height: 82, borderRadius: 27, backgroundColor: '#7846A6', alignItems: 'center', justifyContent: 'center', marginBottom: 13 },
  avatarText: { color: C.white, fontSize: 35, fontWeight: '900' },
  avatarButton: { marginBottom: 10 },
  avatarImage: { width: '100%', height: '100%', borderRadius: 27 },
  cameraBadge: { position: 'absolute', bottom: -4, right: -5, width: 29, height: 29, borderRadius: 15, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.deep },
  changePhoto: { color: '#F1E6FA', fontSize: 12, fontWeight: '700', marginBottom: 12 },
  removePhoto: { color: '#FAD5DF', fontSize: 11, marginBottom: 12 },
  memberName: { fontSize: 25, fontWeight: '900', color: C.white, textAlign: 'center' },
  memberRole: { fontSize: 13, color: '#E9D5FF', marginTop: 5 },
  memberPill: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 22, marginTop: 17, backgroundColor: '#71419B' },
  memberPillText: { color: '#F1E6FA', fontSize: 11, fontWeight: '700' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, marginTop: 2 },
  sectionTitle: { fontSize: 21, fontWeight: '900', color: C.ink, letterSpacing: -0.4 },
  sectionSubtitle: { fontSize: 12, color: C.muted, marginTop: 5 },
  apartmentCard: { backgroundColor: C.white, borderRadius: 22, padding: 20, marginBottom: 28 },
  apartmentHeading: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  apartmentIcon: { width: 49, height: 49, borderRadius: 16, backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: C.muted },
  apartmentName: { fontSize: 21, fontWeight: '900', color: C.ink, marginTop: 4 },
  divider: { height: 1, backgroundColor: C.line, marginVertical: 18 },
  fieldLabel: { fontSize: 12, color: C.muted, marginBottom: 10 },
  codeBox: { backgroundColor: C.soft, borderRadius: 15, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  codeText: { fontSize: 18, fontWeight: '900', letterSpacing: 2, color: C.purple, flexShrink: 1 },
  hint: { fontSize: 12, color: C.muted, marginTop: 10, lineHeight: 18 },
  countPill: { backgroundColor: C.soft, borderRadius: 20, paddingHorizontal: 13, paddingVertical: 8 },
  countText: { fontSize: 13, fontWeight: '800', color: C.purple },
  roommatesCard: { backgroundColor: C.white, borderRadius: 22, paddingHorizontal: 17, marginBottom: 28 },
  roommateRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12 },
  rowBorder: { borderTopWidth: 1, borderTopColor: C.line },
  roommateAvatar: { width: 45, height: 45, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  roommateInitial: { fontSize: 18, fontWeight: '900', color: C.deep },
  roommateImage: { width: '100%', height: '100%', borderRadius: 15 },
  roommateName: { fontSize: 14, fontWeight: '800', color: C.ink },
  roommateSub: { fontSize: 11, color: C.muted, marginTop: 4 },
  youPill: { backgroundColor: C.soft, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 16 },
  youText: { color: C.purple, fontSize: 10, fontWeight: '900' },
  messageBox: { padding: 20 },
  retry: { color: C.purple, fontWeight: '800', marginTop: 10 },
  qrIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center' },
  inviteCard: { backgroundColor: '#EEE6F9', borderRadius: 24, padding: 22, alignItems: 'center', marginBottom: 30 },
  qrFrame: { backgroundColor: C.white, borderRadius: 20, padding: 20, minWidth: 230, minHeight: 230, alignItems: 'center', justifyContent: 'center' },
  inviteTitle: { fontSize: 19, fontWeight: '900', color: C.ink, marginTop: 20 },
  inviteSubtitle: { fontSize: 12, lineHeight: 19, color: C.muted, textAlign: 'center', marginTop: 8 },
  copyButton: { backgroundColor: C.purple, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 15, paddingVertical: 15, paddingHorizontal: 24, marginTop: 19, width: '100%' },
  copyButtonText: { fontSize: 14, fontWeight: '800', color: C.white },
  securityRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 17 },
  securityText: { color: C.muted, fontSize: 11, lineHeight: 17, flex: 1 },
  settingsCard: { backgroundColor: C.white, borderRadius: 22, paddingHorizontal: 17, marginTop: 15 },
  settingsRow: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 17 },
  settingsIcon: { width: 43, height: 43, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  settingsTitle: { fontSize: 14, fontWeight: '800' },
  settingsSubtitle: { fontSize: 11, color: C.muted, marginTop: 5 },
  footer: { textAlign: 'center', fontSize: 12, color: '#9B91A9', marginTop: 30 },
});
