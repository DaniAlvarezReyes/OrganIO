import { LIMITS, parseQuickAdd, type TaskSource } from '@organio/core';
import { randomUUID } from 'expo-crypto';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';
import { useCreateTask } from '../data/queries';
import { formatDue } from '../lib/dates';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { Text } from '../ui/Text';
import { radius, space, type as typeScale, useTheme } from '../ui/theme';
import { captureToTask } from './capture';

const PRIORITY_LABEL = ['', 'Prioridad baja', 'Prioridad media', 'Prioridad alta'] as const;

interface Props {
  source?: TaskSource;
  initialText?: string;
  autoFocus?: boolean;
  onCreated?: () => void;
}

export function QuickCapture({ source = 'app', initialText = '', autoFocus = false, onCreated }: Props) {
  const { c } = useTheme();
  const [text, setText] = useState(initialText);
  const input = useRef<TextInput>(null);
  const create = useCreateTask();

  const parsed = useMemo(() => (text.trim() ? parseQuickAdd(text) : null), [text]);
  const tooLong = !!parsed && parsed.title.length > LIMITS.titleMax;

  // Escritorio: «/» enfoca la captura desde cualquier parte; Escape la vacía.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';
      if (e.key === '/' && !typing) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const submit = () => {
    if (!parsed || tooLong) return;
    create.mutate(captureToTask(text, source, randomUUID()));
    setText('');
    onCreated?.();
  };

  return (
    <View style={styles.wrap}>
      <View style={[styles.box, { backgroundColor: c.surface, borderColor: tooLong ? c.danger : c.line }]}>
        <TextInput
          ref={input}
          value={text}
          onChangeText={setText}
          onSubmitEditing={submit}
          onKeyPress={(e) => {
            if (Platform.OS === 'web' && e.nativeEvent.key === 'Escape') setText('');
          }}
          placeholder="Añade una tarea…"
          placeholderTextColor={c.inkFaint}
          autoFocus={autoFocus}
          returnKeyType="done"
          blurOnSubmit={false}
          maxLength={LIMITS.titleMax + 200}
          accessibilityLabel="Nueva tarea"
          accessibilityHint="Puedes escribir fechas, #etiquetas y !1 a !3 para la prioridad"
          style={[typeScale.body, styles.input, { color: c.ink }]}
        />
        <Button label="Añadir" kind={parsed ? 'primary' : 'secondary'} disabled={!parsed || tooLong} onPress={submit} style={styles.add} />
      </View>

      {parsed ? (
        <View style={styles.preview} accessibilityLiveRegion="polite">
          {parsed.dueAt ? <Chip tone="accent" label={formatDue(parsed.dueAt, parsed.dueHasTime).text} /> : null}
          {parsed.tags.map((t) => <Chip key={t} tone="accent" label={`#${t}`} />)}
          {parsed.priority > 0 ? <Chip tone="accent" label={PRIORITY_LABEL[parsed.priority]} /> : null}
          {tooLong ? <Text variant="meta" tone="danger">El título admite hasta {LIMITS.titleMax} caracteres.</Text> : null}
        </View>
      ) : (
        <Text variant="meta" tone="faint">
          Prueba: «Llamar al seguro mañana a las 10 #coche !2»{Platform.OS === 'web' ? ' · Pulsa / para escribir' : ''}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  box: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radius.lg, paddingLeft: space.md, paddingRight: space.xs, paddingVertical: space.xs, gap: space.sm },
  input: { flex: 1, minHeight: 44, paddingVertical: space.sm },
  add: { minHeight: 38, paddingHorizontal: space.md },
  preview: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
});
