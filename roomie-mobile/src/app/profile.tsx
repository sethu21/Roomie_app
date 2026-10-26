import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View, } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { useApartment } from '../context/ApartmentContext';
const C = {
    bg: '#F2F0FA',
    white: '#FFFFFF',
    purple: '#6B21A8',
    lightPurple: '#F0E5FA',
    ink: '#1E293B',
    muted: '#64748B',
    line: 'rgba(107,33,168,0.10)',
    red: '#D95365',
};
type IconName = React.ComponentProps<typeof Ionicons>['name'];
function SettingsRow({ icon, title, subtitle, color = C.purple, onPress, }: {
    icon: IconName;
    title: string;
    subtitle: string;
    color?: string;
    onPress: () => void;
}) {
    return (<Pressable onPress={onPress} style={({ pressed }) => [
            styles.settingsRow,
            pressed && { opacity: 0.65 },
        ]}>
      <View style={[styles.settingsIcon, { backgroundColor: color === C.red ? '#FDE8EA' : C.lightPurple }]}>
        <Ionicons name={icon} size={21} color={color}/>
      </View>

      <View style={{ flex: 1 }}>
        <Text style={[styles.settingsTitle, { color }]}>
          {title}
        </Text>
        <Text style={styles.settingsSubtitle}>
          {subtitle}
        </Text>
      </View>

      <Ionicons name="chevron-forward" size={18} color={C.muted}/>
    </Pressable>);
}
export default function ProfileScreen() {
    const router = useRouter();
    const { session, logout } = useApartment();
    const [busy, setBusy] = useState(false);
    const memberName = session?.memberName || 'Roommate';
    const apartmentName = session?.apartmentName || 'Our apartment';
    const apartmentCode = session?.code || '';
    const initial = memberName.trim().charAt(0).toUpperCase() || 'R';
    const copyCode = async () => {
        if (!apartmentCode)
            return;
        await Clipboard.setStringAsync(apartmentCode);
        Alert.alert('Copied!', 'Apartment code copied to clipboard.');
    };
    const leaveCurrentApartment = async () => {
        if (busy)
            return;
        try {
            setBusy(true);
            await logout();
            // The root screen handles the create/join flow.
            router.replace('/');
        }
        catch (error) {
            console.error('Session clearing failed:', error);
            Alert.alert('Something went wrong', 'Could not clear your apartment session.');
        }
        finally {
            setBusy(false);
        }
    };
    const confirmSwitch = () => {
        Alert.alert('Switch apartment?', 'You will return to the create/join screen. Your apartment data will remain saved in the database.', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Switch',
                onPress: () => void leaveCurrentApartment(),
            },
        ]);
    };
    const confirmLogout = () => {
        Alert.alert('Log out of Roomie?', 'You will need to join your apartment again to continue.', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Log out',
                style: 'destructive',
                onPress: () => void leaveCurrentApartment(),
            },
        ]);
    };
    return (<SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View pointerEvents="none" style={styles.ambientGlowTop}/>
        <View pointerEvents="none" style={styles.ambientGlowBottom}/>
        <View style={styles.brandRow}>
          <View style={styles.brandIcon}><Ionicons name="home-outline" size={21} color={C.white}/></View>
          <Text style={styles.brandText}>roomie<Text style={{ color: C.purple }}>.</Text></Text>
          <View style={{ flex: 1 }}/>
          <View style={styles.brandPill}><Ionicons name="shield-checkmark-outline" size={14} color={C.purple}/><Text style={styles.brandPillText}>MY SPACE</Text></View>
        </View>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={22} color={C.ink}/>
          </Pressable>

          <Text style={styles.headerTitle}>My Profile</Text>

          <View style={styles.headerRight}>
            <Ionicons name="settings-outline" size={22} color={C.purple}/>
          </View>
        </View>

        <View style={styles.profileCard}>
          <View pointerEvents="none" style={styles.profileGlow}/>
          <View pointerEvents="none" style={styles.profileGlowSmall}/>
          <View style={styles.profileEyebrowRow}><Ionicons name="sparkles-outline" size={14} color="#E9D5FF"/><Text style={styles.profileEyebrow}>YOUR ROOMIE PROFILE</Text></View>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>

          <Text style={styles.memberName}>{memberName}</Text>
          <Text style={styles.memberRole}>
            Roomie member
          </Text>

          <View style={styles.memberPill}>
            <Ionicons name="checkmark-circle" size={15} color="#D1FAE5"/>
            <Text style={styles.memberPillText}>
              Connected to apartment
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>My apartment <Text style={{ color: C.purple }}>✦</Text></Text>

        <View style={styles.apartmentCard}>
          <View style={styles.apartmentHeading}>
            <View style={styles.apartmentIcon}>
              <Ionicons name="home-outline" size={22} color={C.purple}/>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.apartmentLabel}>
                YOUR SHARED HOME
              </Text>
              <Text style={styles.apartmentName}>
                {apartmentName}
              </Text>
            </View>
          </View>

          <View style={styles.divider}/>

          <Text style={styles.codeLabel}>
            Apartment invite code
          </Text>

          <Pressable onPress={() => void copyCode()} style={styles.codeBox}>
            <Text style={styles.codeText}>
              {apartmentCode || 'Unavailable'}
            </Text>

            <Ionicons name="copy-outline" size={20} color={C.purple}/>
          </Pressable>

          <Text style={styles.codeHint}>
            Share this code with roommates to join your home.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Account & apartment</Text>

        <View style={styles.settingsCard}>
          <SettingsRow icon="swap-horizontal-outline" title="Switch apartment" subtitle="Join or create another apartment" onPress={confirmSwitch}/>

          <View style={styles.divider}/>

          <SettingsRow icon="log-out-outline" title="Log out" subtitle="Clear your current Roomie session" color={C.red} onPress={confirmLogout}/>
        </View>

        {busy && (<ActivityIndicator color={C.purple} style={{ marginTop: 20 }}/>)}

        <Text style={styles.footer}>
          Your home, in sync. ✦
        </Text>
      </ScrollView>
    </SafeAreaView>);
}
const styles = StyleSheet.create({
    ambientGlowTop: { position: 'absolute', top: 10, right: -95, width: 310, height: 310, borderRadius: 155, backgroundColor: 'rgba(171,104,216,0.12)' },
    ambientGlowBottom: { position: 'absolute', top: 470, left: -125, width: 300, height: 300, borderRadius: 150, backgroundColor: 'rgba(163,109,215,0.10)' },
    brandRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 25 },
    brandIcon: { width: 39, height: 39, borderRadius: 13, backgroundColor: C.purple, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
    brandText: { fontSize: 26, fontWeight: '900', color: C.ink, letterSpacing: -1.4 },
    brandPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 8, backgroundColor: 'rgba(255,255,255,0.83)', borderColor: '#FFFFFF', borderWidth: 1, borderRadius: 20 },
    brandPillText: { fontSize: 10, fontWeight: '800', color: C.purple, letterSpacing: 0.4 },
    profileGlow: { position: 'absolute', width: 250, height: 250, borderRadius: 125, backgroundColor: 'rgba(255,255,255,0.10)', right: -90, top: -130 },
    profileGlowSmall: { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.07)', left: -75, bottom: -110 },
    profileEyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
    profileEyebrow: { color: '#E9D5FF', fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },
    screen: {
        flex: 1,
        backgroundColor: C.bg,
    },
    content: {
        paddingHorizontal: 22,
        paddingBottom: 40,
        paddingTop: 7,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: 14,
        gap: 14,
        marginBottom: 19
    },
    backButton: {
        width: 42,
        height: 42,
        borderRadius: 14,
        backgroundColor: C.white,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.95)', shadowColor: C.purple, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
    },
    headerTitle: {
        flex: 1,
        fontSize: 22,
        fontWeight: '800',
        color: C.ink,
    },
    headerRight: {
        width: 42,
        height: 42,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.83)', borderWidth: 1, borderColor: '#FFFFFF'
    },
    profileCard: {
        borderRadius: 26,
        alignItems: 'center',
        marginBottom: 28,
        backgroundColor: '#512184', borderWidth: 1, borderColor: '#7535A4', overflow: 'hidden', shadowColor: C.purple, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.16, shadowRadius: 20, elevation: 5, paddingVertical: 32
    },
    avatar: {
        width: 82,
        height: 82,
        borderRadius: 27,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 14,
        backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.27)'
    },
    avatarText: {
        fontSize: 35,
        fontWeight: '900',
        color: '#FFFFFF'
    },
    memberName: {
        fontSize: 25,
        fontWeight: '900',
        color: '#FFFFFF'
    },
    memberRole: {
        fontSize: 13,
        marginTop: 5,
        color: '#E9D5FF'
    },
    memberPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 13,
        paddingVertical: 8,
        borderRadius: 20,
        marginTop: 18,
        backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.24)'
    },
    memberPillText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#E9D5FF'
    },
    sectionTitle: {
        fontWeight: '800',
        color: C.ink,
        marginBottom: 14,
        fontSize: 20, letterSpacing: -0.45
    },
    apartmentCard: {
        borderRadius: 24,
        padding: 20,
        marginBottom: 28,
        backgroundColor: 'rgba(255,255,255,0.83)', borderWidth: 1, borderColor: '#FFFFFF', shadowColor: C.purple, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 14, elevation: 2
    },
    apartmentHeading: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 13,
    },
    apartmentIcon: {
        width: 48,
        height: 48,
        borderRadius: 16,
        backgroundColor: C.lightPurple,
        alignItems: 'center',
        justifyContent: 'center',
    },
    apartmentLabel: {
        color: C.muted,
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 1,
    },
    apartmentName: {
        fontSize: 21,
        fontWeight: '900',
        color: C.ink,
        marginTop: 4,
    },
    divider: {
        height: 1,
        backgroundColor: C.line,
        marginVertical: 18,
    },
    codeLabel: {
        color: C.muted,
        fontSize: 12,
        marginBottom: 10,
    },
    codeBox: {
        borderRadius: 15,
        padding: 15,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'rgba(243,233,251,0.78)', borderWidth: 1, borderColor: 'rgba(107,33,168,0.11)'
    },
    codeText: {
        fontSize: 18,
        fontWeight: '900',
        letterSpacing: 2,
        color: C.purple,
    },
    codeHint: {
        fontSize: 11,
        color: C.muted,
        marginTop: 11,
        lineHeight: 17,
    },
    settingsCard: {
        borderRadius: 24,
        paddingHorizontal: 18,
        paddingVertical: 6,
        backgroundColor: 'rgba(255,255,255,0.83)', borderWidth: 1, borderColor: '#FFFFFF', shadowColor: C.purple, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 14, elevation: 2
    },
    settingsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        gap: 13,
    },
    settingsIcon: {
        width: 43,
        height: 43,
        borderRadius: 14,
        backgroundColor: C.bg,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.82)',
    },
    settingsTitle: {
        fontSize: 14,
        fontWeight: '800',
    },
    settingsSubtitle: {
        color: C.muted,
        fontSize: 11,
        marginTop: 5,
    },
    footer: {
        textAlign: 'center',
        fontSize: 12,
        marginTop: 32,
        color: '#8B80A3'
    },
});
