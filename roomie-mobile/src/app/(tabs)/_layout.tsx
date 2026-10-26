
import React from 'react';
import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApartment } from '../../context/ApartmentContext';

const COLORS = {
  home: '#1E293B',
  money: '#065F46',
  receipt: '#9A3412',
  shopping: '#6B21A8',
  chores: '#0369A1',
  inactive: '#9290A7',
};

export default function TabsLayout() {
  const { session, loading } = useApartment();
  const insets = useSafeAreaInsets();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F3F9' }}>
        <ActivityIndicator size="large" color={COLORS.shopping} />
      </View>
    );
  }

  if (!session) return <Redirect href="/" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarInactiveTintColor: COLORS.inactive,
        tabBarStyle: {
          backgroundColor: 'rgba(255,255,255,0.97)',
          borderTopWidth: 1,
          borderTopColor: '#E9E4ED',
          height: 62 + insets.bottom,
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 8),
          shadowColor: '#1E293B',
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.06,
          shadowRadius: 12,
          elevation: 10,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarActiveTintColor: COLORS.home,
          tabBarIcon: ({ focused }) => (
            <View style={{ width: 42, height: 34, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: focused ? '#E2E8F0' : 'transparent' }}>
              <Ionicons name={focused ? 'home' : 'home-outline'} size={23} color={focused ? COLORS.home : COLORS.inactive} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="money"
        options={{
          title: 'Money',
          tabBarActiveTintColor: COLORS.money,
          tabBarIcon: ({ focused }) => (
            <View style={{ width: 42, height: 34, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: focused ? '#DDF3E9' : 'transparent' }}>
              <Ionicons name={focused ? 'wallet' : 'wallet-outline'} size={23} color={focused ? COLORS.money : COLORS.inactive} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="receipt"
        options={{
          title: 'Scan',
          tabBarActiveTintColor: COLORS.receipt,
          tabBarIcon: ({ focused }) => (
            <View style={{ width: 46, height: 46, borderRadius: 17, backgroundColor: COLORS.receipt, justifyContent: 'center', alignItems: 'center', marginTop: -13, borderWidth: focused ? 3 : 0, borderColor: '#FED7AA', shadowColor: COLORS.receipt, shadowOpacity: focused ? 0.3 : 0.17, shadowRadius: 9, elevation: 5 }}>
              <Ionicons name="scan-outline" size={23} color="#FFFFFF" />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="shopping"
        options={{
          title: 'Shopping',
          tabBarActiveTintColor: COLORS.shopping,
          tabBarIcon: ({ focused }) => (
            <View style={{ width: 42, height: 34, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: focused ? '#F3E8FF' : 'transparent' }}>
              <Ionicons name={focused ? 'basket' : 'basket-outline'} size={23} color={focused ? COLORS.shopping : COLORS.inactive} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="chores"
        options={{
          title: 'Chores',
          tabBarActiveTintColor: COLORS.chores,
          tabBarIcon: ({ focused }) => (
            <View style={{ width: 42, height: 34, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: focused ? '#E0F2FE' : 'transparent' }}>
              <Ionicons name={focused ? 'checkbox' : 'checkbox-outline'} size={23} color={focused ? COLORS.chores : COLORS.inactive} />
            </View>
          ),
        }}
      />
    </Tabs>
  );
}

