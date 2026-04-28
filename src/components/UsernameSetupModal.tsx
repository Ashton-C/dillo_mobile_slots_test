import { useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useAuthStore } from '@/store/useAuthStore';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

export function UsernameSetupModal() {
  const { needsUsername, setDisplayName } = useAuthStore();
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const trimmed = name.trim();
  const valid = trimmed.length >= 3 && trimmed.length <= 20;

  async function handleSubmit() {
    if (!valid || submitting) return;
    setSubmitting(true);
    await setDisplayName(trimmed);
    setSubmitting(false);
  }

  return (
    <Modal visible={needsUsername} transparent animationType="fade" statusBarTranslucent>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.card}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarGlyph}>◎</Text>
          </View>

          <Text style={styles.title}>CHOOSE YOUR PILOT NAME</Text>
          <Text style={styles.subtitle}>3–20 characters · No spaces · You can change this later</Text>

          <TextInput
            style={styles.input}
            value={name}
            onChangeText={(t) => setName(t.replace(/\s/g, ''))}
            placeholder="e.g. StellarPilot"
            placeholderTextColor={Colors.textMuted}
            maxLength={20}
            autoFocus
            autoCorrect={false}
            autoCapitalize="none"
            onSubmitEditing={handleSubmit}
            returnKeyType="done"
          />

          <Text style={styles.counter}>{trimmed.length}/20</Text>

          <Pressable
            onPress={handleSubmit}
            disabled={!valid || submitting}
            style={[styles.button, (!valid || submitting) && styles.buttonDisabled]}
          >
            <Text style={styles.buttonText}>
              {submitting ? 'SAVING…' : 'LAUNCH MISSION'}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.md,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 2,
    borderColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  avatarGlyph: {
    fontSize: 36,
    color: Colors.primary,
  },
  title: {
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.bold,
    color: Colors.textPrimary,
    letterSpacing: 3,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 1,
    textAlign: 'center',
    lineHeight: 16,
  },
  input: {
    width: '100%',
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: Typography.sizes.md,
    color: Colors.textPrimary,
    letterSpacing: 1,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
  counter: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    alignSelf: 'flex-end',
    marginTop: -Spacing.sm,
  },
  button: {
    width: '100%',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  buttonDisabled: {
    backgroundColor: Colors.surfaceElevated,
  },
  buttonText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
    color: Colors.textPrimary,
    letterSpacing: 3,
  },
});
