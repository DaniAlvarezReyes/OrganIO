import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { Button } from '../src/ui/Button';
import { Screen } from '../src/ui/Screen';
import { Text } from '../src/ui/Text';
import { space } from '../src/ui/theme';

export default function NotFound() {
  const router = useRouter();
  return (
    <Screen>
      <View style={{ gap: space.md, marginTop: space.xxl }}>
        <Text variant="heading">Esta página no existe</Text>
        <Button kind="secondary" label="Ir a mis tareas" onPress={() => router.replace('/')} />
      </View>
    </Screen>
  );
}
