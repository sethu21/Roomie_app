import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  createApartment,
  joinApartment,
  loginApartment,
} from '../../api';
import { useApartment } from '../context/ApartmentContext';

type ApartmentResult = {
  apartmentName: string;
  code: string;
  memberId: string;
  memberName: string;
  message: string;
};

export default function HomeScreen() {
  const router = useRouter();
  const { scannedCode } = useLocalSearchParams<{
    scannedCode?: string;
  }>();
  const {
    session: currentSession,
    loading: sessionLoading,
    setApartmentSession,
  } = useApartment();
  const [mode, setMode] = useState<'create' | 'join' | 'login'>('create');
  const [apartmentName, setApartmentName] = useState('');
  const [memberName, setMemberName] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [connectionSlow, setConnectionSlow] = useState(false);
  const [result, setResult] = useState<ApartmentResult | null>(null);

  useEffect(() => {
    if (typeof scannedCode === 'string' && scannedCode) {
      setCode(scannedCode);
      setMode('join');
    }
  }, [scannedCode]);


  useEffect(() => {
    if (sessionLoading) return;

    if (currentSession) {
      router.replace('/(tabs)');
    }
  }, [sessionLoading, currentSession, router]);



  async function handleSubmit() {
    if (!memberName.trim()) {
      Alert.alert('Name required', 'Please enter your name.');
      return;
    }

    if (mode === 'create' && !apartmentName.trim()) {
      Alert.alert('Apartment required', 'Please enter an apartment name.');
      return;
    }

    if ((mode === 'join' || mode === 'login') && !code.trim()) {
      Alert.alert('Code required', 'Please enter the apartment code.');
      return;
    }

    let slowTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      setLoading(true);
      setConnectionSlow(false);
      slowTimer = setTimeout(() => setConnectionSlow(true), 6000);

      if (mode === 'create') {
        const data = await createApartment(
          apartmentName.trim(),
          memberName.trim()
        );

        const session = {
          apartmentName: data.apartment.name,
          code: data.apartment.code,
          memberId: data.apartment.members[0].id,
          memberName: memberName.trim(),
        };

        await setApartmentSession(session);

        setResult({
          ...session,
          message: data.message,
        });
      } else if (mode === 'join') {
        const data = await joinApartment(
          code.trim(),
          memberName.trim()
        );

        const session = {
          apartmentName: data.apartment.name,
          code: data.apartment.code,
          memberId: data.member.id,
          memberName: memberName.trim(),
        };

        await setApartmentSession(session);

        setResult({
          ...session,
          message: data.message,
        });
      } else {
        const data = await loginApartment(
          code.trim(),
          memberName.trim()
        );

        const session = {
          apartmentName: data.apartment.name,
          code: data.apartment.code,
          memberId: data.member.id,
          memberName: data.member.name,
        };

        await setApartmentSession(session);

        router.replace({
          pathname: '/(tabs)',
          params: {
            code: session.code,
            apartmentName: session.apartmentName,
            memberId: session.memberId,
            memberName: session.memberName,
          },
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Please try again.';
      const isNetworkError = /network|fetch|timeout|timed out|connect|abort/i.test(message);
      Alert.alert(
        isNetworkError ? 'Cannot reach Roomie server' : 'Something went wrong',
        isNetworkError
          ? `Check that the backend is running and the IP in roomie-mobile/api.ts is correct.\n\nDetails: ${message}`
          : message
      );
    } finally {
      if (slowTimer) clearTimeout(slowTimer);
      setConnectionSlow(false);
      setLoading(false);
    }
  }

  if (sessionLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View pointerEvents="none" style={styles.orbTop} />
        <View pointerEvents="none" style={styles.orbBottom} />
        <View style={styles.successCard}>
          <ActivityIndicator size="large" color="#6D55D9" />
          <Text style={styles.subtitle}>Loading your apartment...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (result) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View pointerEvents="none" style={styles.orbTop} />
        <View pointerEvents="none" style={styles.orbBottom} />
        <View style={styles.successCard}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark" size={31} color="#065F46" />
          </View>

          <Text style={styles.heading}>You're in! ✦</Text>
          <Text style={styles.subtitle}>{result.message}</Text>

          <Text style={styles.label}>YOUR APARTMENT</Text>
          <Text style={styles.apartmentName}>
            {result.apartmentName}
          </Text>

          <Text style={styles.label}>APARTMENT JOINING CODE</Text>
          <View style={styles.codeBox}>
            <Text style={styles.codeText}>{result.code}</Text>
          </View>

          <Text style={styles.helperText}>
            Share this code with your roommates so they can join your apartment.
          </Text>

          <Pressable
            style={styles.primaryButton}
            onPress={() => {
              router.push({
                pathname: '/(tabs)/money',
                params: {
                  code: result.code,
                  apartmentName: result.apartmentName,
                  memberId: result.memberId,
                  memberName: result.memberName,
                },
              });
            }}
          >
            <Text style={styles.primaryButtonText}>
              Open Money Dashboard
            </Text>
          </Pressable>

          <Pressable
            style={[styles.primaryButton, styles.shoppingButton]}
            onPress={() => {
              router.push({
                pathname: '/(tabs)/shopping',
                params: {
                  code: result.code,
                  apartmentName: result.apartmentName,
                  memberId: result.memberId,
                  memberName: result.memberName,
                },
              });
            }}
          >
            <Text style={styles.primaryButtonText}>
              🛒 Open Shopping List
            </Text>
          </Pressable>

          <Pressable
            style={styles.primaryButton}
            onPress={() => {
              setResult(null);
              setApartmentName('');
              setCode('');
            }}
          >
            <Text style={styles.primaryButtonText}>Back to Roomie</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View pointerEvents="none" style={styles.orbTop} />
      <View pointerEvents="none" style={styles.orbBottom} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <View style={styles.logo}>
              <Ionicons name="home-outline" size={28} color="#FFFFFF" />
            </View>
            <Text style={styles.brand}>roomie<Text style={{ color: P.purple }}>.</Text></Text>
            <Text style={styles.tagline}>
              Shared living, made easier.
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.heading}>
              Welcome to Roomie
            </Text>
            <Text style={styles.subtitle}>
              Create an apartment, join your roommates, or log back in.
            </Text>

            <View style={styles.tabs}>
              <Pressable
                style={[
                  styles.tab,
                  mode === 'create' && styles.activeTab,
                ]}
                onPress={() => setMode('create')}
              >
                <Text
                  style={[
                    styles.tabText,
                    mode === 'create' && styles.activeTabText,
                  ]}
                >
                  Create apartment
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.tab,
                  mode === 'join' && styles.activeTab,
                ]}
                onPress={() => setMode('join')}
              >
                <Text
                  style={[
                    styles.tabText,
                    mode === 'join' && styles.activeTabText,
                  ]}
                >
                  Join apartment
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.tab,
                  mode === 'login' && styles.activeTab,
                ]}
                onPress={() => setMode('login')}
              >
                <Text
                  style={[
                    styles.tabText,
                    mode === 'login' && styles.activeTabText,
                  ]}
                >
                  Log In
                </Text>
              </Pressable>
            </View>

            <Text style={styles.inputLabel}>YOUR NAME</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your name"
              placeholderTextColor="#8A929E"
              value={memberName}
              onChangeText={setMemberName}
              autoCapitalize="words"
              editable={!loading}
            />

            {mode === 'create' ? (
              <>
                <Text style={styles.inputLabel}>APARTMENT NAME</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Brno Flat 4"
                  placeholderTextColor="#8A929E"
                  value={apartmentName}
                  onChangeText={setApartmentName}
                  autoCapitalize="words"
                  editable={!loading}
                />
              </>
            ) : (
              <>
                <Text style={styles.inputLabel}>JOINING CODE</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter your apartment code"
                  placeholderTextColor="#8A929E"
                  value={code}
                  onChangeText={setCode}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  editable={!loading}
                />
                {mode === 'join' && (
                  <Pressable
                    style={styles.scanButton}
                    onPress={() => router.push('./scan-qr')}
                    disabled={loading}
                  >
                    <Ionicons
                      name="qr-code-outline"
                      size={22}
                      color="#6B21A8"
                    />
                    <Text style={styles.scanButtonText}>
                      Scan Apartment QR Code
                    </Text>
                  </Pressable>
                )}
              </>
            )}

            <Pressable
              style={[
                styles.primaryButton,
                loading && styles.disabledButton,
              ]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {mode === 'create'
                    ? 'Create apartment'
                    : mode === 'login'
                      ? 'Log in to apartment'
                      : 'Join apartment'}
                </Text>
              )}
            </Pressable>

            {loading && (
              <Text style={styles.connectionStatus}>
                {connectionSlow
                  ? 'Still connecting… Check your backend IP and Wi-Fi connection.'
                  : 'Connecting to your apartment…'}
              </Text>
            )}

            <Text style={styles.footerText}>
              No separate account needed. Just your name and apartment.
            </Text>
          </View>

          <Text style={styles.bottomText}>
            Roomie · Better together
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const P = { purple: '#6B21A8', ink: '#1E293B', muted: '#64748B', bg: '#F2EDF8', line: '#E9DFF1' };

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: P.bg },
  orbTop: { position: 'absolute', width: 310, height: 310, borderRadius: 155, backgroundColor: 'rgba(167,139,250,0.17)', top: 90, right: -130 },
  orbBottom: { position: 'absolute', width: 310, height: 310, borderRadius: 155, backgroundColor: 'rgba(216,180,254,0.20)', bottom: -90, left: -130 },
  content: { flexGrow: 1, paddingHorizontal: 22, paddingVertical: 34, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: 27 },
  logo: { width: 62, height: 62, borderRadius: 21, backgroundColor: P.purple, alignItems: 'center', justifyContent: 'center', shadowColor: P.purple, shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.23, shadowRadius: 15, elevation: 6 },
  logoText: { fontSize: 30, fontWeight: '900', color: '#FFFFFF' },
  brand: { fontSize: 32, fontWeight: '900', letterSpacing: -1.3, color: P.ink, marginTop: 13 },
  tagline: { fontSize: 14, color: P.muted, marginTop: 4 },
  card: { backgroundColor: 'rgba(255,255,255,0.83)', borderRadius: 28, padding: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.98)', shadowColor: P.purple, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.08, shadowRadius: 25, elevation: 4 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginBottom: 12 },
  eyebrow: { fontSize: 9, fontWeight: '900', color: P.purple, letterSpacing: 1.1 },
  heading: { fontSize: 26, fontWeight: '900', letterSpacing: -0.7, color: P.ink, textAlign: 'center' },
  subtitle: { fontSize: 13, lineHeight: 21, color: P.muted, textAlign: 'center', marginTop: 9, marginBottom: 23 },
  tabs: { flexDirection: 'row', backgroundColor: 'rgba(107,33,168,0.07)', borderRadius: 17, padding: 5, marginBottom: 25, borderWidth: 1, borderColor: 'rgba(107,33,168,0.08)' },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, paddingHorizontal: 2, borderRadius: 13 },
  activeTab: { backgroundColor: '#FFFFFF', shadowColor: P.purple, shadowOpacity: 0.12, shadowRadius: 8, elevation: 2 },
  tabText: { fontSize: 11, fontWeight: '700', color: P.muted, textAlign: 'center' },
  activeTabText: { color: P.purple, fontWeight: '900' },
  inputLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 1.05, color: P.ink, marginBottom: 9 },
  input: { backgroundColor: 'rgba(255,255,255,0.85)', borderWidth: 1, borderColor: P.line, borderRadius: 15, height: 54, paddingHorizontal: 16, fontSize: 15, color: P.ink, marginBottom: 20 },
  primaryButton: { backgroundColor: P.purple, borderRadius: 16, minHeight: 55, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9, marginTop: 5, paddingHorizontal: 12, shadowColor: P.purple, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.16, shadowRadius: 10, elevation: 3 },
  shoppingButton: { backgroundColor: '#065F46', marginTop: 12, shadowColor: '#065F46' },
  disabledButton: { opacity: 0.65 },
  primaryButtonText: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
  connectionStatus: { fontSize: 12, lineHeight: 18, color: P.purple, textAlign: 'center', marginTop: 12 },
  footerText: { fontSize: 12, lineHeight: 18, color: P.muted, textAlign: 'center', marginTop: 19 },
  bottomText: { fontSize: 12, color: P.muted, textAlign: 'center', marginTop: 24, fontWeight: '600' },
  successCard: { margin: 22, marginTop: 55, backgroundColor: 'rgba(255,255,255,0.86)', borderRadius: 28, padding: 24, alignItems: 'stretch', borderWidth: 1, borderColor: '#FFFFFF', shadowColor: P.purple, shadowOpacity: 0.08, shadowRadius: 20, elevation: 4 },
  successIcon: { width: 66, height: 66, borderRadius: 23, backgroundColor: '#E6F8EF', alignSelf: 'center', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  checkmark: { fontSize: 32, fontWeight: '900', color: '#065F46' },
  label: { fontSize: 10, fontWeight: '900', letterSpacing: 1.1, color: P.muted, marginTop: 17, marginBottom: 9 },
  apartmentName: { fontSize: 23, fontWeight: '900', color: P.ink },
  codeBox: { backgroundColor: '#F3E8FF', borderWidth: 1, borderColor: '#E9D5FF', borderRadius: 17, padding: 18, alignItems: 'center' },
  codeText: { fontSize: 27, fontWeight: '900', letterSpacing: 3, color: P.purple },
  helperText: { color: P.muted, fontSize: 12, lineHeight: 19, marginTop: 13, marginBottom: 21 },
  scanButton: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  backgroundColor: '#F3E8FF',
  borderWidth: 1,
  borderColor: '#E9D5FF',
  borderRadius: 15,
  paddingVertical: 16,
  marginBottom: 20,
},

scanButtonText: {
  color: '#6B21A8',
  fontSize: 14,
  fontWeight: '800',
},

});
