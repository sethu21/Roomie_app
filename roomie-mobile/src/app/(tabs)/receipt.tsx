
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { fetch } from 'expo/fetch';
import { File } from 'expo-file-system';
import { useApartment } from '../../context/ApartmentContext';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 60000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

type ReceiptItem = {
  name: string;
  quantity: number | null;
  unitPrice: number | null;
  totalPrice: number | null;
};

type ReceiptAdjustment = {
  description: string;
  type:
    | 'DISCOUNT'
    | 'REFUND'
    | 'DEPOSIT'
    | 'CHARGE'
    | 'TAX_ADJUSTMENT'
    | 'OTHER';
  amount: number;
  alreadyIncluded: boolean;
};

type ReceiptValidation = {
  status: 'MATCHED' | 'MISMATCH' | 'REVIEW_REQUIRED';
  itemsTotal: number;
  adjustmentsTotal: number;
  calculatedTotal: number;
  receiptTotal: number | null;
  difference: number | null;
};

type ReceiptData = {
  store: string;
  currency: string;
  items: ReceiptItem[];
  adjustments: ReceiptAdjustment[];
  validation?: ReceiptValidation;
  total: number | null;
};
export default function ReceiptScreen() {
  const router = useRouter();
  const { session } = useApartment();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [receiptCurrency, setReceiptCurrency] = useState('Unknown');
  const [saving, setSaving] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Record<number, boolean>>({});
  const [savedReceiptId, setSavedReceiptId] = useState<string | null>(null);
  // Keep raw input text while editing, so users can type decimals and clear fields.
  const [itemEdits, setItemEdits] = useState<Record<number, Partial<Record<'name' | 'quantity' | 'unitPrice' | 'totalPrice', string>>>>({});

  function editItem(index: number, field: 'name' | 'quantity' | 'unitPrice' | 'totalPrice', value: string) {
    setItemEdits(previous => ({
      ...previous,
      [index]: { ...previous[index], [field]: value },
    }));
    setSavedReceiptId(null);
  }

  function getEditedItems(): ReceiptItem[] {
    if (!receipt) return [];
    const numeric = (value: string | number | null | undefined): number | null => {
      if (value == null || String(value).trim() === '') return null;
      const parsed = Number(String(value).replace(',', '.'));
      return Number.isFinite(parsed) ? parsed : null;
    };
    return receipt.items.map((item, index) => {
      const edit = itemEdits[index] || {};
      const quantity = numeric(edit.quantity !== undefined ? edit.quantity : item.quantity);
      const unitPrice = numeric(edit.unitPrice !== undefined ? edit.unitPrice : item.unitPrice);
      const totalPrice = numeric(edit.totalPrice !== undefined ? edit.totalPrice : item.totalPrice);
      const resolvedQuantity = quantity != null && quantity > 0 ? quantity
        : unitPrice != null && unitPrice > 0 && totalPrice != null && totalPrice >= 0 ? totalPrice / unitPrice : null;
      const resolvedUnitPrice = unitPrice != null && unitPrice >= 0 ? unitPrice
        : resolvedQuantity != null && totalPrice != null ? totalPrice / resolvedQuantity : null;
      const resolvedTotalPrice = totalPrice != null && totalPrice >= 0 ? totalPrice
        : resolvedQuantity != null && resolvedUnitPrice != null ? Math.round(resolvedQuantity * resolvedUnitPrice * 100) / 100 : null;
      return {
        name: (edit.name !== undefined ? edit.name : item.name || '').trim(),
        quantity: resolvedQuantity,
        unitPrice: resolvedUnitPrice,
        totalPrice: resolvedTotalPrice,
      };
    });
  }


  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        'Camera permission required',
        'Allow camera access to take a receipt photo.'
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
      setReceipt(null);
      setItemEdits({});
      setSavedReceiptId(null);
    }
  }

  async function choosePhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
      setReceipt(null);
      setItemEdits({});
      setSavedReceiptId(null);
    }
  }


async function processReceipt() {
  if (!imageUri) {
    Alert.alert(
      'No receipt selected',
      'Take a photo or choose an image first.'
    );
    return;
  }

  setLoading(true);

  const totalStart = Date.now();

  try {
    console.log('1. Optimizing receipt image...');

    const optimizeStart = Date.now();

    // Resize the receipt before uploading it to Gemini.
    const optimizedImage = await ImageManipulator.manipulateAsync(
      imageUri,
      [{ resize: { width: 1400 } }],
      {
        compress: 0.75,
        format: ImageManipulator.SaveFormat.JPEG,
      }
    );

    console.log(
      'Image optimization:',
      Date.now() - optimizeStart,
      'ms'
    );

    // Keep the existing Expo File upload approach.
    const formData = new FormData();
    const imageFile = new File(optimizedImage.uri);

    formData.append('receipt', imageFile);

    console.log('2. Sending optimized receipt image...');

    const uploadStart = Date.now();

    const response = await fetchWithTimeout(
      `${API_URL}/api/receipts/read`,
      {
        method: 'POST',
        body: formData,
      },
      90000
    );

    const data = await response.json();

    console.log(
      'Upload + AI processing:',
      Date.now() - uploadStart,
      'ms'
    );

    console.log('3. Response status:', response.status);

    if (!response.ok) {
      throw new Error(data.error || 'Receipt reading failed.');
    }

    if (
      !data.receipt ||
      !Array.isArray(data.receipt.items)
    ) {
      throw new Error(
        'The AI returned an invalid receipt response.'
      );
    }

    setItemEdits({});
    setExpandedItems({});
    setReceipt({
      ...data.receipt,
      store: data.receipt.store || 'Unknown',
      currency: data.receipt.currency || 'Unknown',
      total:
        typeof data.receipt.total === 'number'
          ? data.receipt.total
          : null,
      items: data.receipt.items.map((item: ReceiptItem) => ({
        name: item.name || 'Unknown item',
        quantity:
          typeof item.quantity === 'number'
            ? item.quantity
            : null,
        unitPrice:
          typeof item.unitPrice === 'number'
            ? item.unitPrice
            : null,
        totalPrice:
          typeof item.totalPrice === 'number'
            ? item.totalPrice
            : null,
      })),
    });

    setReceiptCurrency(
      data.receipt.currency || 'Unknown'
    );

    console.log(
      'Total Smart Receipt time:',
      Date.now() - totalStart,
      'ms'
    );

    Alert.alert(
      'Receipt scanned',
      `${data.receipt.items.length} item(s) detected. Please review them below.`
    );
  } catch (error) {
    console.error('Receipt upload error:', error);

    Alert.alert(
      'Upload failed',
      error instanceof Error && error.name === 'AbortError'
        ? 'The receipt request timed out. Check your backend connection and Gemini API logs.'
        : error instanceof Error
          ? error.message
          : String(error)
    );
  } finally {
    setLoading(false);
  }
}
async function saveReceipt() {
  if (!receipt) {
    Alert.alert('No receipt', 'Scan a receipt first.');
    return;
  }

  if (savedReceiptId) {
    Alert.alert('Already saved', 'This receipt has already been saved.');
    return;
  }

  if (
    receipt.total == null ||
    !Number.isFinite(receipt.total) ||
    receipt.total <= 0 ||
    receipt.items.length === 0
  ) {
    Alert.alert(
      'Check receipt',
      'The receipt total or product list is invalid.'
    );
    return;
  }

  // Read editable fields and derive only values supported by the other fields.
  const normalizedItems = getEditedItems();

  const invalidIndexes = normalizedItems.flatMap((item, index) =>
    !item.name ||
    item.quantity == null || !Number.isFinite(item.quantity) || item.quantity <= 0 ||
    item.unitPrice == null || !Number.isFinite(item.unitPrice) || item.unitPrice < 0 ||
    item.totalPrice == null || !Number.isFinite(item.totalPrice) || item.totalPrice < 0
      ? [index + 1]
      : []
  );

  if (invalidIndexes.length) {
    const details = invalidIndexes.map(number => {
      const item = normalizedItems[number - 1];
      const problems = [
        !item.name ? 'name' : null,
        item.quantity == null || item.quantity <= 0 ? 'quantity' : null,
        item.unitPrice == null || item.unitPrice < 0 ? 'unit price' : null,
        item.totalPrice == null || item.totalPrice < 0 ? 'total price' : null,
      ].filter(Boolean);
      return `${number}. ${item.name || 'Unnamed product'}: ${problems.join(', ')}`;
    });
    Alert.alert('Review highlighted products', details.join('\n') + '\n\nEdit these fields below, then save again.');
    return;
  }


  if (!session?.code || !session.memberId) {
    Alert.alert(
      'Session not found',
      'Please return to Roomie and log in to your apartment again.'
    );
    return;
  }

  setSaving(true);

  try {
    const response = await fetchWithTimeout(
      `${API_URL}/api/receipts`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apartmentCode: session.code,
          uploaderId: session.memberId,
          store: receipt.store,
          currency: receipt.currency,
          total: receipt.total,
          items: normalizedItems,
        }),
      },
      15000
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Could not save the receipt.');
    }

    const newReceiptId = data.receipt?.id;

    if (!newReceiptId) {
      throw new Error(
        'The server did not return a receipt ID. Check the database before trying again.'
      );
    }

    setSavedReceiptId(newReceiptId);
    setImageUri(null);
    setReceipt(null);
    setReceiptCurrency('Unknown');


    Alert.alert(
  'Receipt saved!',
  `${receipt.store} — ${receipt.total.toFixed(2)} ${receipt.currency}\n\nYour receipt and ${receipt.items.length} products are now saved.`,
  [
    {
      text: 'View Items',
      onPress: () => {
        console.log('Opening receipt details:', newReceiptId);
        router.push({
         pathname: '/receipt/[id]',
         params: { id: String(newReceiptId) },
        });
      },
    },
    {
      text: 'Stay Here',
      style: 'cancel',
    },
  ]
);
  } catch (error) {
    console.error('Save receipt error:', error);

    Alert.alert(
      'Save failed',
      error instanceof Error && error.name === 'AbortError'
         ? 'Saving timed out. Check your backend connection.'
         : error instanceof Error ? error.message : 'Please try again.'
    );
  } finally {
    setSaving(false);
  }
}


  const editedItems = receipt ? getEditedItems() : [];
  const incompleteCount = editedItems.filter(item =>
    !item.name || item.quantity == null || item.quantity <= 0 ||
    item.unitPrice == null || item.unitPrice < 0 ||
    item.totalPrice == null || item.totalPrice < 0
  ).length;
  const currencyLabel = receipt?.currency || receiptCurrency;
  const money = (value: number | null | undefined) => value == null ? '—' : `${value.toFixed(2)} ${currencyLabel}`;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} style={styles.backCircle} accessibilityLabel="Go back">
            <Ionicons name="arrow-back" size={21} color="#1E293B" />
          </Pressable>
          <Text style={styles.topBrand}>roomie <Text style={styles.brandAccent}>/ smart receipt</Text></Text>
          <View style={{ width: 40 }} />
        </View>

        <Text style={styles.eyebrow}>SMART RECEIPT</Text>
        <Text style={styles.title}>{receipt ? 'Review your receipt' : 'Scan. Review. Split.'}</Text>
        <Text style={styles.subtitle}>{receipt
          ? 'Check the items before saving. You can correct anything the AI missed.'
          : 'Turn a shopping receipt into organized items for your apartment.'}</Text>

        <View style={styles.steps}>
          {['Capture', 'Review', 'Save'].map((step, index) => {
            const activeStep = receipt ? 1 : imageUri ? 0 : 0;
            const done = receipt ? index === 0 : false;
            return <View key={step} style={styles.stepWrap}>
              <View style={[styles.stepCircle, (index === activeStep || done) && styles.stepCircleActive]}>
                {done ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> :
                  <Text style={[styles.stepNumber, index === activeStep && styles.stepNumberActive]}>{index + 1}</Text>}
              </View>
              <Text style={[styles.stepText, index === activeStep && styles.stepTextActive]}>{step}</Text>
            </View>;
          })}
        </View>

        {!receipt && (
          <View style={styles.captureCard}>
            <View style={styles.captureHeader}>
              <Ionicons name="receipt-outline" size={20} color="#9A3412" />
              <Text style={styles.captureTitle}>{imageUri ? 'Photo ready' : 'Add a receipt photo'}</Text>
            </View>
            <View style={styles.preview}>
              {imageUri ? <Image source={{ uri: imageUri }} style={styles.receiptImage} /> :
                <View style={styles.emptyPreview}>
                  <View style={styles.cameraBadge}><Ionicons name="scan-outline" size={35} color="#9A3412" /></View>
                  <Text style={styles.previewTitle}>Your receipt goes here</Text>
                  <Text style={styles.previewHint}>Keep the whole receipt visible and the text sharp.</Text>
                </View>}
            </View>
            <View style={styles.photoActions}>
              <Pressable style={styles.photoAction} onPress={takePhoto} disabled={loading}>
                <Ionicons name="camera-outline" size={20} color="#9A3412" />
                <Text style={styles.photoActionText}>Camera</Text>
              </Pressable>
              <Pressable style={styles.photoAction} onPress={choosePhoto} disabled={loading}>
                <Ionicons name="images-outline" size={20} color="#9A3412" />
                <Text style={styles.photoActionText}>Gallery</Text>
              </Pressable>
            </View>
            {imageUri && <Pressable style={[styles.mainButton, loading && styles.disabled]} onPress={processReceipt} disabled={loading}>
              {loading ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="sparkles" size={18} color="#FFFFFF" />}
              <Text style={styles.mainButtonText}>{loading ? 'Reading your receipt…' : 'Read receipt with AI'}</Text>
            </Pressable>}
            {loading && <Text style={styles.loadingNote}>This may take a moment. Please keep the app open.</Text>}
          </View>
        )}

        {receipt && <>
          <View style={styles.summaryCard}>
            <View style={styles.summaryTop}>
              <View style={styles.storeIcon}><Ionicons name="storefront-outline" size={23} color="#9A3412" /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.summaryCaption}>SCANNED FROM</Text>
                <Text style={styles.storeName}>{receipt.store || 'Unknown store'}</Text>
              </View>
              <View style={styles.aiPill}><Ionicons name="sparkles" size={12} color="#9A3412" /><Text style={styles.aiPillText}>AI scan</Text></View>
            </View>
            <View style={styles.summaryDivider} />
            <Text style={styles.summaryCaption}>RECEIPT TOTAL</Text>
            <Text style={styles.totalValue}>{money(receipt.total)}</Text>
            <View style={styles.summaryFoot}>
              <Text style={styles.summarySmall}>{receipt.items.length} products found</Text>
              <Text style={styles.summarySmall}>{currencyLabel}</Text>
            </View>
          </View>

          <View style={[styles.notice, incompleteCount ? styles.noticeWarn : styles.noticeGood]}>
            <Ionicons name={incompleteCount ? 'alert-circle-outline' : 'checkmark-circle-outline'} size={21} color={incompleteCount ? '#9A6329' : '#288361'} />
            <Text style={[styles.noticeText, { color: incompleteCount ? '#8A5A27' : '#277A5B' }]}>
              {incompleteCount ? `${incompleteCount} product${incompleteCount === 1 ? '' : 's'} need review before saving.` : 'All products have the required details. Please verify the prices.'}
            </Text>
          </View>

          <View style={styles.sectionHeading}>
            <View><Text style={styles.sectionTitle}>Detected items</Text><Text style={styles.sectionSub}>Tap an item to edit its details</Text></View>
            <View style={styles.countPill}><Text style={styles.countText}>{receipt.items.length} items</Text></View>
          </View>
          {receipt.items.map((item, index) => {
            const edits = itemEdits[index] || {};
            const current = editedItems[index];
            const incomplete = !current.name || current.quantity == null || current.quantity <= 0 || current.unitPrice == null || current.unitPrice < 0 || current.totalPrice == null || current.totalPrice < 0;
            const expanded = expandedItems[index] ?? incomplete;
            const fields = [
              { key: 'quantity' as const, title: 'Qty', value: item.quantity },
              { key: 'unitPrice' as const, title: 'Unit price', value: item.unitPrice },
              { key: 'totalPrice' as const, title: 'Item total', value: item.totalPrice },
            ];
            return <View key={index} style={styles.itemCard}>
              <Pressable style={styles.itemRow} onPress={() => setExpandedItems(prev => ({ ...prev, [index]: !expanded }))}>
                <View style={styles.itemIndex}><Text style={styles.itemIndexText}>{index + 1}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName} numberOfLines={2}>{current.name || 'Unnamed product'}</Text>
                  <Text style={styles.itemMeta}>{incomplete ? 'Needs review' : `Qty ${current.quantity} · Ready`}</Text>
                </View>
                <View style={styles.itemRight}>
                  <Text style={styles.itemPrice}>{money(current.totalPrice)}</Text>
                  <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={17} color="#64748B" />
                </View>
              </Pressable>
              {expanded && <View style={styles.itemEditor}>
                <Text style={styles.fieldLabel}>PRODUCT NAME</Text>
                <TextInput style={styles.editInput} value={edits.name !== undefined ? edits.name : item.name || ''} onChangeText={value => editItem(index, 'name', value)} placeholder="Product name" />
                <View style={styles.editFieldsRow}>
                  {fields.map(field => <View key={field.key} style={styles.editField}>
                    <Text style={styles.fieldLabel}>{field.title.toUpperCase()}</Text>
                    <TextInput style={[styles.editInput, current[field.key] == null && styles.editInputMissing]} keyboardType="decimal-pad" placeholder="—" value={edits[field.key] !== undefined ? edits[field.key] : field.value == null ? '' : String(field.value)} onChangeText={value => editItem(index, field.key, value)} />
                  </View>)}
                </View>
                <Text style={[styles.itemHint, incomplete && styles.itemHintWarn]}>{incomplete ? 'Fill in the missing values to continue.' : 'Values look complete. Compare with your photo to confirm.'}</Text>
              </View>}
            </View>;
          })}

          <View style={styles.footerCard}>
            <View style={styles.footerLine}><Text style={styles.footerLabel}>Receipt total</Text><Text style={styles.footerTotal}>{money(receipt.total)}</Text></View>
            <Text style={styles.footerHelp}>Saving stores your receipt and products. Assigning items to roommates happens in the receipt details screen.</Text>
            <Pressable style={[styles.mainButton, (saving || savedReceiptId !== null) && styles.disabled]} onPress={saveReceipt} disabled={saving || savedReceiptId !== null}>
              {saving ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="checkmark-circle-outline" size={20} color="#FFFFFF" />}
              <Text style={styles.mainButtonText}>{saving ? 'Saving…' : savedReceiptId ? 'Receipt saved' : 'Save and continue'}</Text>
            </Pressable>
            <Pressable onPress={() => { setReceipt(null); setImageUri(null); setItemEdits({}); setExpandedItems({}); setSavedReceiptId(null); }} style={styles.rescanButton}>
              <Ionicons name="refresh-outline" size={17} color="#9A3412" /><Text style={styles.rescanText}>Scan another receipt</Text>
            </Pressable>
          </View>
        </>}
        <Text style={styles.bottomNote}>Roomie · Smarter shared living</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F3F5F8' },
  container: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 44 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 26 },
  backCircle: { width: 40, height: 40, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.90)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#EDEAF4' },
  topBrand: { fontSize: 15, fontWeight: '800', color: '#1E293B' },
  brandAccent: { fontWeight: '500', color: '#64748B' },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1.7, color: '#9A3412', marginBottom: 8 },
  title: { fontSize: 29, fontWeight: '900', color: '#1E293B', letterSpacing: -0.7 },
  subtitle: { color: '#64748B', fontSize: 14, lineHeight: 21, marginTop: 9, marginBottom: 22 },
  steps: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: 'rgba(255,255,255,0.91)', borderRadius: 20, paddingVertical: 15, marginBottom: 18, borderWidth: 1, borderColor: '#F0ECF7' },
  stepWrap: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  stepCircle: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#FFEDD5', alignItems: 'center', justifyContent: 'center' },
  stepCircleActive: { backgroundColor: '#9A3412' },
  stepNumber: { color: '#9A3412', fontSize: 12, fontWeight: '700' },
  stepNumberActive: { color: '#FFFFFF' },
  stepText: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  stepTextActive: { color: '#9A3412' },
  captureCard: { backgroundColor: 'rgba(255,255,255,0.94)', padding: 18, borderRadius: 24, borderWidth: 1, borderColor: '#E8E1DC' },
  captureHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  captureTitle: { fontSize: 16, fontWeight: '700', color: '#1E293B' },
  preview: { minHeight: 235, borderRadius: 17, backgroundColor: '#FFF7F2', overflow: 'hidden', borderWidth: 1, borderColor: '#FED7AA', borderStyle: 'dashed' },
  emptyPreview: { minHeight: 235, alignItems: 'center', justifyContent: 'center', padding: 22 },
  cameraBadge: { width: 72, height: 72, borderRadius: 24, backgroundColor: '#FFEDD5', alignItems: 'center', justifyContent: 'center', marginBottom: 15 },
  previewTitle: { fontSize: 16, fontWeight: '700', color: '#1E293B' },
  previewHint: { fontSize: 13, color: '#64748B', textAlign: 'center', lineHeight: 19, marginTop: 7 },
  receiptImage: { width: '100%', height: 320, resizeMode: 'contain' },
  photoActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  photoAction: { flex: 1, borderRadius: 13, paddingVertical: 15, backgroundColor: '#FFF1E6', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 9 },
  photoActionText: { fontWeight: '700', color: '#9A3412', fontSize: 14 },
  mainButton: { minHeight: 56, borderRadius: 16, backgroundColor: '#9A3412', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9, marginTop: 15, paddingHorizontal: 12 },
  mainButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  disabled: { opacity: 0.55 },
  loadingNote: { textAlign: 'center', fontSize: 12, color: '#64748B', marginTop: 12 },
  summaryCard: { backgroundColor: '#9A3412', borderRadius: 25, padding: 22, marginBottom: 16, borderWidth: 1, borderColor: '#B4532C', shadowColor: '#9A3412', shadowOpacity: 0.14, shadowRadius: 15, shadowOffset: { width: 0, height: 7 }, elevation: 4 },
  summaryTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  storeIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: '#FFF1E6', alignItems: 'center', justifyContent: 'center' },
  summaryCaption: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: '#FFEDD5' },
  storeName: { fontSize: 17, fontWeight: '800', color: '#FFFFFF', marginTop: 4 },
  aiPill: { borderRadius: 20, backgroundColor: '#FFF1E6', paddingHorizontal: 9, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 4 },
  aiPillText: { color: '#9A3412', fontSize: 10, fontWeight: '800' },
  summaryDivider: { height: 1, backgroundColor: '#FFFFFF32', marginVertical: 19 },
  totalValue: { fontSize: 32, fontWeight: '800', color: '#FFFFFF', marginTop: 5 },
  summaryFoot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  summarySmall: { color: '#FED7AA', fontSize: 12 },
  notice: { flexDirection: 'row', gap: 10, alignItems: 'center', borderRadius: 14, padding: 13, marginBottom: 23 },
  noticeWarn: { backgroundColor: '#FFF2E1' },
  noticeGood: { backgroundColor: '#EAF7EF' },
  noticeText: { flex: 1, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 20, fontWeight: '900', color: '#1E293B' },
  sectionSub: { fontSize: 12, color: '#64748B', marginTop: 4 },
  countPill: { backgroundColor: '#FFF1E6', borderRadius: 20, paddingHorizontal: 11, paddingVertical: 7 },
  countText: { color: '#9A3412', fontSize: 11, fontWeight: '700' },
  itemCard: { backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: 19, borderWidth: 1, borderColor: '#FFFFFF', marginBottom: 12, overflow: 'hidden', shadowColor: '#1E293B', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13 },
  itemIndex: { width: 35, height: 35, borderRadius: 11, backgroundColor: '#FFEDD5', alignItems: 'center', justifyContent: 'center' },
  itemIndexText: { color: '#9A3412', fontWeight: '800' },
  itemName: { fontSize: 14, fontWeight: '700', color: '#1E293B' },
  itemMeta: { fontSize: 11, color: '#64748B', marginTop: 5 },
  itemRight: { alignItems: 'flex-end', gap: 7 },
  itemPrice: { fontSize: 13, fontWeight: '800', color: '#1E293B' },
  itemEditor: { borderTopWidth: 1, borderTopColor: '#E2E8F0', padding: 14, backgroundColor: '#FAFAFA' },
  fieldLabel: { fontSize: 10, fontWeight: '800', color: '#64748B', letterSpacing: 0.5, marginBottom: 7 },
  editInput: { backgroundColor: '#FFFFFF', borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', minHeight: 44, paddingHorizontal: 10, color: '#1E293B', fontSize: 13 },
  editInputMissing: { borderColor: '#D79C58' },
  editFieldsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  editField: { flex: 1, minWidth: 0 },
  itemHint: { fontSize: 11, color: '#368365', marginTop: 12 },
  itemHintWarn: { color: '#9C622E' },
  footerCard: { backgroundColor: 'rgba(255,255,255,0.94)', padding: 19, borderRadius: 23, borderWidth: 1, borderColor: '#E8E1DC', marginTop: 12 },
  footerLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footerLabel: { fontSize: 14, color: '#64748B' },
  footerTotal: { fontSize: 20, fontWeight: '800', color: '#1E293B' },
  footerHelp: { fontSize: 12, color: '#64748B', lineHeight: 19, marginTop: 14 },
  rescanButton: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, padding: 14 },
  rescanText: { fontSize: 13, fontWeight: '700', color: '#9A3412' },
  bottomNote: { fontSize: 11, color: '#94A3B8', textAlign: 'center', marginTop: 24 },
});
