import { canTransition, staleness, STATUS_LABEL, type Task } from '@organio/core';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { formatDue, formatIdle } from '../lib/dates';
import { Text } from '../ui/Text';
import { Thread } from '../ui/Thread';
import { space, useTheme } from '../ui/theme';

interface Props {
  task: Task;
  staleDefault: number;
  onOpen: (task: Task) => void;
  onToggleDone: (task: Task) => void;
}

export const TaskRow = memo(function TaskRow({ task, staleDefault, onOpen, onToggleDone }: Props) {
  const { c } = useTheme();
  const s = staleness(task, staleDefault);
  const closed = task.status === 'done' || task.status === 'discarded';
  const due = task.due_at && !closed ? formatDue(task.due_at, task.due_has_time) : null;
  const canComplete = canTransition(task.status, 'done') && !closed;
  const canReopen = task.status === 'done';

  const meta: Array<{ text: string; tone: 'soft' | 'danger' | 'stale' | 'faint' | 'accent' }> = [];
  if (due) meta.push({ text: due.text, tone: due.tone === 'overdue' ? 'danger' : due.tone === 'soon' ? 'accent' : 'soft' });
  if (s.isStale) meta.push({ text: formatIdle(s.idleDays), tone: 'stale' });
  if (task.status === 'blocked') meta.push({ text: 'Bloqueada', tone: 'soft' });
  for (const tag of task.tags.slice(0, 3)) meta.push({ text: `#${tag}`, tone: 'faint' });

  return (
    <View style={styles.row}>
      <Thread ratio={s.isStale ? 1 : s.ratio} closed={closed} />
      <Pressable
        onPress={() => onOpen(task)}
        accessibilityRole="button"
        accessibilityLabel={`${task.title}. ${STATUS_LABEL[task.status]}${s.isStale ? `. ${formatIdle(s.idleDays)}` : ''}`}
        style={({ pressed }) => [styles.body, { opacity: pressed ? 0.6 : 1 }]}
      >
        <Text
          variant="body"
          tone={closed ? 'faint' : 'ink'}
          numberOfLines={2}
          style={closed ? { textDecorationLine: 'line-through' } : undefined}
        >
          {task.priority === 3 && !closed ? '‼ ' : ''}
          {task.title}
        </Text>
        {meta.length > 0 ? (
          <Text variant="meta" numberOfLines={1}>
            {meta.map((m, i) => (
              <Text key={i} variant="meta" tone={m.tone}>
                {i > 0 ? '   ' : ''}
                {m.text}
              </Text>
            ))}
          </Text>
        ) : null}
      </Pressable>
      {canComplete || canReopen ? (
        <Pressable
          onPress={() => onToggleDone(task)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: canReopen }}
          accessibilityLabel={canReopen ? 'Reabrir tarea' : 'Marcar como hecha'}
          hitSlop={10}
          style={[styles.check, { borderColor: canReopen ? c.ok : c.inkFaint, backgroundColor: canReopen ? c.ok : 'transparent' }]}
        >
          {canReopen ? <Text variant="label" style={{ color: c.surface, lineHeight: 16 }}>✓</Text> : null}
        </Pressable>
      ) : (
        <View style={styles.checkSpacer} />
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  body: { flex: 1, gap: 2 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  checkSpacer: { width: 24 },
});
