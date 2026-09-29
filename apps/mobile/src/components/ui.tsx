import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { color, font, radius, space, type } from '@/theme';

export function Screen({
  children,
  testID,
  scroll = true,
  footer,
}: {
  children: ReactNode;
  testID: string;
  scroll?: boolean;
  footer?: ReactNode;
}) {
  return (
    <SafeAreaView style={styles.screen} edges={['bottom', 'left', 'right']} testID={testID}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.column}>{children}</View>
        </ScrollView>
      ) : (
        <View style={[styles.content, styles.column, { flex: 1 }]}>{children}</View>
      )}
      {footer}
    </SafeAreaView>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'quiet';

export function Button({
  label,
  onPress,
  testID,
  variant = 'primary',
  disabled,
  loading,
  style,
}: {
  label: string;
  onPress: () => void;
  testID: string;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const inactive = disabled || loading;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      aria-disabled={!!inactive}
      aria-busy={!!loading}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        styles[`button_${variant}`],
        pressed && { opacity: 0.8 },
        inactive && { opacity: 0.45 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? color.card : color.ink} />
      ) : (
        <Text style={[styles.buttonText, variant === 'primary' && { color: color.card }]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  testID,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      // react-native-web ignores accessibilityState; aria-selected reaches the DOM.
      aria-selected={selected}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipText, selected && { color: color.card }]}>{label}</Text>
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string; testID: string }) {
  return (
    <View style={{ gap: space.xs }}>
      <Text style={type.label}>{label}</Text>
      <TextInput
        placeholderTextColor={color.muted}
        accessibilityLabel={label}
        {...props}
        style={[styles.input, props.style]}
      />
    </View>
  );
}

export function Heading({ children, testID }: { children: ReactNode; testID?: string }) {
  return (
    <Text style={type.title} accessibilityRole="header" testID={testID}>
      {children}
    </Text>
  );
}

export function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <View style={{ gap: space.sm }}>
      <Text style={[type.label, { fontSize: 16 }]} accessibilityRole="header">
        {title}
      </Text>
      {hint ? <Text style={type.small}>{hint}</Text> : null}
      {children}
    </View>
  );
}

export function ErrorText({ children, testID }: { children: ReactNode; testID: string }) {
  return (
    <Text testID={testID} accessibilityRole="alert" style={[type.body, { color: color.danger }]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  content: { padding: space.lg, paddingBottom: space.xxl },
  column: { width: '100%', maxWidth: 640, alignSelf: 'center', gap: space.lg },
  button: {
    minHeight: 44,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  button_primary: { backgroundColor: color.ink },
  button_secondary: { backgroundColor: color.card, borderWidth: 1, borderColor: color.ink },
  button_quiet: { backgroundColor: 'transparent', paddingHorizontal: space.sm },
  buttonText: { fontFamily: font.body, fontSize: 15, fontWeight: '600', color: color.ink },
  chip: {
    minHeight: 36,
    paddingHorizontal: space.md,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: color.card,
  },
  chipSelected: { backgroundColor: color.ink, borderColor: color.ink },
  chipText: { fontFamily: font.body, fontSize: 14, color: color.ink },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.sm,
    backgroundColor: color.card,
    paddingHorizontal: space.md,
    fontFamily: font.body,
    fontSize: 16,
    color: color.ink,
  },
});
