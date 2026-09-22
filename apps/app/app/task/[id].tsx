import {
  isActive,
  parseQuickAdd,
  staleness,
  STATUS_LABEL,
  tagSchema,
  TASK_STATUSES,
  TRANSITIONS,
  type Task,
  type TaskStatus,
  type UpdateTaskInput,
} from '@organio/core';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useDeleteTask, useProfile, useReportProgress, useTask, useUpdateTask } from '../../src/data/queries';
import { confirmAsync } from '../../src/lib/confirm';
import { formatDue, formatIdle } from '../../src/lib/dates';
import { Button } from '../../src/ui/Button';
import { Chip } from '../../src/ui/Chip';
import { Screen } from '../../src/ui/Screen';
import { Segmented } from '../../src/ui/Segmented';
import { Text } from '../../src/ui/Text';
import { TextField } from '../../src/ui/TextField';
import { space, useTheme } from '../../src/ui/theme';

const createdFmt = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

function atNine(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9, 0);
}

function nextMonday(from: Date): Date {
  const diff = (1 - from.getDay() + 7) % 7 || 7;
  return new Date(from.getFullYear(), from.getMonth(), from.getDate() + diff);
}

export default function TaskDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { c } = useTheme();
  const { data: task, isPending } = useTask(id);
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (!task) {
    return (
      <Screen>
        {isPending ? (
          <ActivityIndicator color={c.accent} style={{ marginTop: space.xxl }} />
        ) : (
          <View style={{ gap: space.md, marginTop: space.xxl }}>
            <Text variant="heading">No se ha encontrado la tarea</Text>
            <Text variant="body" tone="soft">Puede que se haya borrado desde otro dispositivo.</Text>
            <Button kind="secondary" label="Volver a la lista" onPress={() => router.replace('/')} />
          </View>
        )}
      </Screen>
    );
  }
  return <Editor key={task.id} task={task} onClose={close} />;
}

function Editor({ task, onClose }: { task: Task; onClose: () => void }) {
  const update = useUpdateTask();
  const remove = useDeleteTask();
  const progress = useReportProgress();
  const profile = useProfile();
  const staleDefault = profile.data?.stale_days_default ?? 7;

  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');
  const [tagsText, setTagsText] = useState(task.tags.join(', '));
  const [dateText, setDateText] = useState('');
  const [tagsError, setTagsError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);

  // Si la tarea cambia desde otro dispositivo mientras está abierta, se reflejan los campos.
  useEffect(() => setTitle(task.title), [task.title]);
  useEffect(() => setDescription(task.description ?? ''), [task.description]);
  useEffect(() => setTagsText(task.tags.join(', ')), [task.tags]);

  const save = (patch: UpdateTaskInput) => update.mutate({ id: task.id, patch });
  const s = staleness(task, staleDefault);
  const active = isActive(task.status);

  const statusOptions = TASK_STATUSES.filter((st) => st === task.status || TRANSITIONS[task.status].includes(st)).map(
    (st: TaskStatus) => ({ value: st, label: STATUS_LABEL[st] }),
  );

  const saveTitle = () => {
    const t = title.trim();
    if (!t) return setTitle(task.title);
    if (t !== task.title) save({ title: t });
  };

  const saveTags = () => {
    const raw = tagsText.split(/[,\s]+/).map((t) => t.replace(/^#/, '')).filter(Boolean);
    const parsed = raw.map((t) => tagSchema.safeParse(t));
    const bad = parsed.find((p) => !p.success);
    if (bad) return setTagsError('Usa letras, números, guion o guion bajo (sin espacios).');
    const tags = [...new Set(parsed.map((p) => p.data as string))];
    if (tags.length > 20) return setTagsError('Máximo 20 etiquetas.');
    setTagsError(null);
    if (tags.join(',') !== task.tags.join(',')) save({ tags });
  };

  const setDue = (date: Date | null, hasTime = false) => {
    setDateError(null);
    save({ due_at: date ? date.toISOString() : null, due_has_time: date ? hasTime : false });
  };

  const saveDateText = () => {
    if (!dateText.trim()) return;
    const parsed = parseQuickAdd(dateText);
    if (!parsed.dueAt) return setDateError('No he entendido la fecha. Prueba «15/10», «viernes» o «mañana a las 17».');
    setDue(parsed.dueAt, parsed.dueHasTime);
    setDateText('');
  };

  const onDelete = async () => {
    if (!(await confirmAsync('Borrar tarea', `«${task.title}» se borrará para siempre.`, 'Borrar'))) return;
    remove.mutate(task.id);
    onClose();
  };

  const today = new Date();

  return (
    <Screen>
      <View style={styles.top}>
        <Text variant="label" tone="soft">{STATUS_LABEL[task.status]}</Text>
        <Button kind="ghost" label="Cerrar" onPress={onClose} />
      </View>

      <TextField
        value={title}
        onChangeText={setTitle}
        onBlur={saveTitle}
        onSubmitEditing={saveTitle}
        accessibilityLabel="Título"
        style={styles.title}
        maxLength={200}
      />

      {active ? (
        <View style={styles.progress}>
          <Text variant="body" tone={s.isStale ? 'stale' : 'soft'} style={{ flex: 1 }}>
            {formatIdle(s.idleDays)}
          </Text>
          <Button kind="secondary" label="He avanzado hoy" onPress={() => progress.mutate(task.id)} />
        </View>
      ) : null}

      <Segmented label="Estado" options={statusOptions} value={task.status} onChange={(status) => save({ status })} />

      <Segmented
        label="Prioridad"
        options={[
          { value: 0, label: 'Sin prioridad' },
          { value: 1, label: 'Baja' },
          { value: 2, label: 'Media' },
          { value: 3, label: 'Alta' },
        ]}
        value={task.priority}
        onChange={(priority) => save({ priority })}
      />

      <View style={styles.block}>
        <Text variant="label" tone="soft">
          Fecha{task.due_at ? ` · ${formatDue(task.due_at, task.due_has_time).text}` : ''}
        </Text>
        <View style={styles.chips}>
          <Chip label="Hoy" onPress={() => setDue(atNine(today))} />
          <Chip label="Mañana" onPress={() => setDue(atNine(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)))} />
          <Chip label="Próximo lunes" onPress={() => setDue(atNine(nextMonday(today)))} />
          {task.due_at ? <Chip label="Quitar fecha" onPress={() => setDue(null)} /> : null}
        </View>
        <TextField
          value={dateText}
          onChangeText={setDateText}
          onSubmitEditing={saveDateText}
          onBlur={saveDateText}
          placeholder="O escribe: «15/10 a las 17»"
          error={dateError}
          returnKeyType="done"
        />
      </View>

      <TextField
        label="Etiquetas"
        value={tagsText}
        onChangeText={setTagsText}
        onBlur={saveTags}
        onSubmitEditing={saveTags}
        placeholder="coche, casa"
        autoCapitalize="none"
        error={tagsError}
      />

      <Segmented
        label="Avisar si lleva sin avanzar"
        options={[
          { value: null, label: `${staleDefault} días (por defecto)` },
          { value: 3, label: '3 días' },
          { value: 14, label: '14 días' },
          { value: 30, label: '30 días' },
        ]}
        value={task.stale_after_days}
        onChange={(stale_after_days) => save({ stale_after_days })}
      />

      <TextField
        label="Descripción"
        value={description}
        onChangeText={setDescription}
        onBlur={() => description !== (task.description ?? '') && save({ description: description || null })}
        multiline
        maxLength={10000}
        placeholder="Contexto, enlaces, lo que necesites recordar"
        style={styles.description}
      />

      <Text variant="meta" tone="faint">Creada el {createdFmt.format(new Date(task.created_at))}</Text>
      <Button kind="danger" label="Borrar tarea" onPress={onDelete} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '600', lineHeight: 26 },
  progress: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  block: { gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  description: { minHeight: 120, textAlignVertical: 'top' },
});
