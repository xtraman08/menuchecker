import { useMutation } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Image, Platform, StyleSheet, Text, View } from 'react-native';

import { api, errorMessage, type ScanImage } from '@/api/client';
import { Button, ErrorText, Screen } from '@/components/ui';
import { useAppState } from '@/state/AppState';
import { color, radius, space, type } from '@/theme';

const MAX_BYTES = 8_000_000;

function toScanImage(asset: ImagePicker.ImagePickerAsset): ScanImage {
  const mimeType = asset.mimeType ?? 'image/jpeg';
  const ext = mimeType.split('/')[1] ?? 'jpg';
  return { uri: asset.uri, mimeType, fileName: asset.fileName ?? `menu.${ext}` };
}

export default function Scan() {
  const { setScanDraft } = useAppState();
  const [preview, setPreview] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);

  const scan = useMutation({
    mutationFn: (img: ScanImage) => api.scanMenu(img),
    onSuccess: (result) => {
      setScanDraft(result);
      router.push('/review');
    },
  });

  async function pick(source: 'camera' | 'library') {
    setPickError(null);
    scan.reset();
    if (source === 'camera' && Platform.OS !== 'web') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        setPickError('Camera access is off. Allow it in Settings, or choose a photo from your library instead.');
        return;
      }
    }
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8, exif: false };
    let res: ImagePicker.ImagePickerResult;
    try {
      res =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(opts)
          : await ImagePicker.launchImageLibraryAsync(opts);
    } catch {
      if (source === 'camera' && Platform.OS === 'web') {
        // Browsers without camera capture: fall back to a plain file upload.
        try {
          res = await ImagePicker.launchImageLibraryAsync(opts);
        } catch {
          setPickError("Couldn't open a photo picker. Try a different browser, or enter the dishes by hand.");
          return;
        }
      } else {
        setPickError(
          source === 'camera'
            ? "Couldn't open the camera. Choose a photo from your library instead."
            : "Couldn't open your photo library. Check Fare's photo permission in Settings.",
        );
        return;
      }
    }
    const asset = res.canceled ? undefined : res.assets[0];
    if (!asset) return;
    if (asset.fileSize && asset.fileSize > MAX_BYTES) {
      setPickError('That photo is larger than 8 MB. Crop it to the menu or pick a smaller image.');
      return;
    }
    setPreview(asset.uri);
    scan.mutate(toScanImage(asset));
  }

  const busy = scan.isPending;

  return (
    <Screen testID="scan-screen">
      <View style={{ gap: space.sm }}>
        <Text style={type.title}>Photograph the menu</Text>
        <Text style={type.body}>
          Get the dish names and prices in frame, one page at a time. You'll check the list before anything is
          saved.
        </Text>
      </View>

      {busy ? (
        <View style={styles.progress} testID="scan-progress" accessibilityLiveRegion="polite">
          {preview ? <Image source={{ uri: preview }} style={styles.preview} resizeMode="cover" /> : null}
          <View style={styles.progressRow}>
            <ActivityIndicator color={color.ink} />
            <View style={{ flex: 1 }}>
              <Text style={type.label}>Reading the menu</Text>
              <Text style={type.small}>Finding dish names and prices. This usually takes 10 to 30 seconds.</Text>
            </View>
          </View>
        </View>
      ) : (
        <View style={{ gap: space.md }}>
          <Button label="Take a photo" onPress={() => pick('camera')} testID="scan-camera" />
          <Button
            label="Choose from library"
            variant="secondary"
            onPress={() => pick('library')}
            testID="scan-library"
          />
        </View>
      )}

      {pickError ? <ErrorText testID="scan-error">{pickError}</ErrorText> : null}
      {scan.isError ? (
        <View style={{ gap: space.sm }}>
          <ErrorText testID="scan-error">{errorMessage(scan.error)}</ErrorText>
          <Text style={type.small}>Try a sharper, well-lit photo, or enter the dishes by hand.</Text>
        </View>
      ) : null}

      {!busy ? (
        <Button
          label="Enter dishes by hand"
          variant="quiet"
          onPress={() => {
            setScanDraft(null);
            router.push('/review');
          }}
          testID="scan-manual"
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  progress: { gap: space.md, backgroundColor: color.card, borderRadius: radius.lg, padding: space.lg },
  progressRow: { flexDirection: 'row', gap: space.md, alignItems: 'center' },
  preview: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.md, backgroundColor: color.placeholder },
});
