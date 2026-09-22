import { StyleSheet, View } from 'react-native';
import { Chip } from './Chip';
import { Text } from './Text';
import { space } from './theme';

interface Option<T> {
  value: T;
  label: string;
}

/** Selector de una opción entre varias, con chips. Accesible como grupo de radio. */
export function Segmented<T extends string | number | null>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<Option<T>>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.wrap} accessibilityRole="radiogroup" accessibilityLabel={label}>
      <Text variant="label" tone="soft">{label}</Text>
      <View style={styles.row}>
        {options.map((o) => (
          <Chip key={String(o.value)} label={o.label} selected={o.value === value} onPress={() => onChange(o.value)} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
