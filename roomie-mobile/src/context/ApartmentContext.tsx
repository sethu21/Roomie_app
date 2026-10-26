
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react';

import {
  loadSession,
  saveSession,
  clearSession,
  RoomieSession,
} from '../session';

type ApartmentContextType = {
  session: RoomieSession | null;
  loading: boolean;
  setApartmentSession: (value: RoomieSession) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
};

const ApartmentContext = createContext<ApartmentContextType | undefined>(
  undefined,
);

export function ApartmentProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, setSession] = useState<RoomieSession | null>(null);
  const [loading, setLoading] = useState(true);

  async function refreshSession() {
    try {
      const saved = await loadSession();
      setSession(saved);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshSession();
  }, []);

  async function setApartmentSession(value: RoomieSession) {
    await saveSession(value);
    setSession(value);
  }

  async function logout() {
    await clearSession();
    setSession(null);
  }

  return (
    <ApartmentContext.Provider
      value={{
        session,
        loading,
        setApartmentSession,
        logout,
        refreshSession,
      }}
    >
      {children}
    </ApartmentContext.Provider>
  );
}

export function useApartment() {
  const context = useContext(ApartmentContext);

  if (!context) {
    throw new Error('useApartment must be used inside ApartmentProvider');
  }

  return context;
}
