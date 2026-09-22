import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './Text';
import { radius, space, useTheme } from './theme';

interface FeedbackValue {
  showError: (message: string) => void;
}

const FeedbackContext = createContext<FeedbackValue | null>(null);

/** Aviso de error no bloqueante en la parte inferior. Se cierra solo a los 6 s o al pulsarlo. */
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showError = useCallback((msg: string) => {
    setMessage(msg);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), 6000);
  }, []);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  return (
    <FeedbackContext.Provider value={{ showError }}>
      {children}
      {message ? (
        <View pointerEvents="box-none" style={[styles.wrap, { bottom: insets.bottom + space.lg }]}>
          <Pressable
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
            onPress={() => setMessage(null)}
            style={[styles.bar, { backgroundColor: c.ink }]}
          >
            <Text variant="body" style={{ color: c.bg }}>
              {message}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </FeedbackContext.Provider>
  );
}

export function useFeedback(): FeedbackValue {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback fuera de FeedbackProvider');
  return ctx;
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: space.lg },
  bar: { maxWidth: 560, width: '100%', paddingVertical: space.md, paddingHorizontal: space.lg, borderRadius: radius.md },
});
