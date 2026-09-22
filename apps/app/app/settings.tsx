import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';
import { signOut, useAuth } from '../src/auth/AuthProvider';
import { useProfile, useUpdateProfile } from '../src/data/queries';
import { confirmAsync } from '../src/lib/confirm';
import { Button } from '../src/ui/Button';
import { Screen } from '../src/ui/Screen';
import { Segmented } from '../src/ui/Segmented';
import { Text } from '../src/ui/Text';
import { radius, space, useTheme } from '../src/ui/theme';

export default function Settings() {
  const router = useRouter();
  const { c } = useTheme();
  const { email } = useAuth();
  const profile = useProfile();
  const update = useUpdateProfile();
  const origin = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : 'organio:/';

  const onSignOut = async () => {
    if (await confirmAsync('Cerrar sesión', 'Tendrás que pedir un código nuevo para volver a entrar.', 'Cerrar sesión')) {
      await signOut();
    }
  };

  return (
    <Screen>
      <View style={styles.top}>
        <Text variant="title">Ajustes</Text>
        <Button kind="ghost" label="Listo" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      </View>

      <View style={styles.block}>
        <Text variant="label" tone="soft">Cuenta</Text>
        <Text variant="body">{email}</Text>
        {profile.data ? <Text variant="meta" tone="faint">Zona horaria: {profile.data.timezone}</Text> : null}
      </View>

      {profile.data ? (
        <Segmented
          label="Una tarea se considera estancada tras"
          options={[3, 5, 7, 10, 14].map((d) => ({ value: d, label: `${d} días` }))}
          value={profile.data.stale_days_default}
          onChange={(stale_days_default) => update.mutate({ stale_days_default })}
        />
      ) : null}

      <View style={[styles.card, { backgroundColor: c.surface }]}>
        <Text variant="heading">Añadir tareas con un toque desde el iPhone</Text>
        <Text variant="body" tone="soft">
          En la app Atajos, crea un atajo con dos acciones: «Dictar texto» y «Abrir URL» con esta dirección, poniendo el texto dictado al final:
        </Text>
        <Text variant="meta" selectable style={[styles.code, { backgroundColor: c.surfaceAlt, color: c.ink }]}>
          {`${origin}/quick-add?text=`}
        </Text>
        <Text variant="body" tone="soft">
          Asígnalo al Botón de Acción o añádelo a la pantalla de inicio. La tarea se abre para que la confirmes: por seguridad, nada se crea solo desde un enlace.
        </Text>
      </View>

      <Button kind="secondary" label="Cerrar sesión" onPress={onSignOut} />
      <Text variant="meta" tone="faint">OrganIO {Constants.expoConfig?.version ?? ''}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  block: { gap: space.xs },
  card: { gap: space.md, padding: space.lg, borderRadius: radius.lg },
  code: { padding: space.md, borderRadius: radius.sm, fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) },
});
