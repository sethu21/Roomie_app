
import React, { useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ScanQRScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  const handleScan = ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);

    // QR code contains the apartment's 8-character hex code.
    const code = data.trim().toUpperCase();

    if (!/^[A-F0-9]{8}$/.test(code)) {
      Alert.alert(
        "Invalid QR code",
        "This is not a valid Roomie apartment code.",
        [{ text: "Try again", onPress: () => setScanned(false) }]
      );
      return;
    }

    // Return the code to the existing join screen.
    router.replace({
      pathname: "/",
      params: { scannedCode: code },
    });
  };

  if (!permission) {
    return (
      <View style={styles.center}>
        <Text>Checking camera permission...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.title}>Camera access</Text>
        <Text style={styles.subtitle}>
          Allow Roomie to scan your apartment's QR code.
        </Text>

        <Pressable
          style={styles.button}
          onPress={requestPermission}
        >
          <Text style={styles.buttonText}>Allow Camera</Text>
        </Pressable>

        <Pressable onPress={() => router.back()}>
          <Text style={styles.backText}>Go Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.title}>Scan Apartment QR</Text>
      <Text style={styles.subtitle}>
        Point your camera at your roommate's QR code.
      </Text>

      <View style={styles.cameraContainer}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{
            barcodeTypes: ["qr"],
          }}
          onBarcodeScanned={
            scanned ? undefined : handleScan
          }
        />
      </View>

      <Pressable
        style={styles.button}
        onPress={() => router.back()}
      >
        <Text style={styles.buttonText}>Cancel</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F2F0FA",
    padding: 24,
    justifyContent: "center",
  },
  center: {
    flex: 1,
    backgroundColor: "#F2F0FA",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  title: {
    fontSize: 25,
    fontWeight: "800",
    color: "#1E293B",
    textAlign: "center",
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 15,
    color: "#64748B",
    textAlign: "center",
    marginBottom: 30,
  },
  cameraContainer: {
    height: 320,
    borderRadius: 24,
    overflow: "hidden",
    marginBottom: 28,
    backgroundColor: "#1E293B",
  },
  button: {
    backgroundColor: "#6B21A8",
    padding: 17,
    borderRadius: 16,
    alignItems: "center",
    marginBottom: 18,
  },
  buttonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 16,
  },
  backText: {
    color: "#6B21A8",
    fontWeight: "700",
  },
});

