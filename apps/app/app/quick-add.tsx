import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { QuickCapture } from '../src/tasks/QuickCapture';
import { Button } from '../src/ui/Button';
import { Screen } from '../src/ui/Screen';
import { Text } from '../src/ui/Text';
import { space } from '../src/ui/theme';

/**
 * Entrada desde fuera de la app (Atajos de iOS, Botón de Acción, más adelante el widget):
 *   /quick-add?text=Llamar%20al%20seguro%20mañana
 * El texto llega precargado pero NUNCA se crea la tarea sin confirmación: un enlace malicioso
 * no puede meterte tareas sin que lo veas.
 */
export default function QuickAdd() {
  const router = useRouter();
  const params = useLocalSearchParams<{ text?: string | string[] }>();
  const raw = Array.isArray(params.text) ? params.text[0] : params.text;
  const text = (raw ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 400);
  const done = () => router.replace('/');

  return (
    <Screen>
      <View style={styles.top}>
        <Text variant="title">Nueva tarea</Text>
        <Button kind="ghost" label="Cancelar" onPress={done} />
      </View>
      <Text variant="body" tone="soft">Revisa el texto y pulsa Añadir. Irá a la Bandeja.</Text>
      <QuickCapture source="shortcut" initialText={text} autoFocus onCreated={done} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md },
});
