
import AsyncStorage from '@react-native-async-storage/async-storage';

export type RoomieSession = {
  apartmentName: string;
  code: string;
  memberId: string;
  memberName: string;
};

const SESSION_KEY = 'roomie_session';

export async function saveSession(session: RoomieSession) {
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export async function loadSession(): Promise<RoomieSession | null> {
  const saved = await AsyncStorage.getItem(SESSION_KEY);

  if (!saved) {
    return null;
  }

  try {
    return JSON.parse(saved) as RoomieSession;
  } catch {
    await AsyncStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export async function clearSession() {
  await AsyncStorage.removeItem(SESSION_KEY);
}
