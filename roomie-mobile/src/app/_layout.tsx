
import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider,
} from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';
import { ApartmentProvider } from '../context/ApartmentContext';

import { AnimatedSplashOverlay } from '@/components/animated-icon';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
  <ApartmentProvider>
    <AnimatedSplashOverlay />

    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="receipt/[id]" />
    </Stack>
  </ApartmentProvider>
</ThemeProvider>
  );
}
