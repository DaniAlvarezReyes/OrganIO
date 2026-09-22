import { isActive, staleness, type Profile, type Task } from '@organio/core';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useProfile, useTasks, useUpdateProfile, useUpdateTask } from '../src/data/queries';
import { toUserError } from '../src/data/errors';
import { deviceTimeZone } from '../src/lib/dates';
import { collectTags, groupTasks } from '../src/tasks/grouping';
import { QuickCapture } from '../src/tasks/QuickCapture';
import { TaskRow } from '../src/tasks/TaskRow';
import { Button } from '../src/ui/Button';
import { Chip } from '../src/ui/Chip';
import { Screen } from '../src/ui/Screen';
import { Text } from '../src/ui/Text';
import { space, useTheme } from '../src/ui/theme';

const todayFmt = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

/** Mantiene la zona horaria del perfil alineada con la del dispositivo (para avisar a la hora local). */
function useSyncTimezone(profile: Profile | undefined) {
  const update = useUpdateProfile();
  const done = useRef(false);
  useEffect(() => {
    const tz = deviceTimeZone();
    if (!profile || !tz || done.current || profile.timezone === tz) return;
    done.current = true;
    update.mutate({ timezone: tz });
  }, [profile, update]);
}

export default function Tasks() {
  const router = useRouter();
  const { c } = useTheme();
  const tasks = useTasks();
  const profile = useProfile();
  const update = useUpdateTask();
  const [tag, setTag] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  useSyncTimezone(profile.data);

  const all = useMemo(() => tasks.data ?? [], [tasks.data]);
  const staleDefault = profile.data?.stale_days_default ?? 7;
  const sections = useMemo(() => groupTasks(all, tag), [all, tag]);
  const tags = useMemo(() => collectTags(all), [all]);
  const open = all.filter((t) => isActive(t.status));
  const staleCount = open.filter((t) => staleness(t, staleDefault).isStale).length;

  const onOpen = useCallback((t: Task) => router.push({ pathname: '/task/[id]', params: { id: t.id } }), [router]);
  // `mutate` es estable entre renders (TanStack Query); depender de él y no del objeto `update`
  // mantiene la memoización de cada fila.
  const mutateTask = update.mutate;
  const onToggleDone = useCallback(
    (t: Task) => mutateTask({ id: t.id, patch: { status: t.status === 'done' ? 'todo' : 'done' } }),
    [mutateTask],
  );

  const today = todayFmt.format(new Date());
  const summary =
    open.length === 0
      ? 'Todo al día'
      : `${open.length} ${open.length === 1 ? 'abierta' : 'abiertas'}${staleCount ? ` · ${staleCount} ${staleCount === 1 ? 'estancada' : 'estancadas'}` : ''}`;

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text variant="title">OrganIO</Text>
          <Text variant="meta" tone="soft">
            {today.charAt(0).toUpperCase() + today.slice(1)} · <Text variant="meta" tone={staleCount ? 'stale' : 'soft'}>{summary}</Text>
          </Text>
        </View>
        <Button kind="ghost" label="Ajustes" onPress={() => router.push('/settings')} />
      </View>

      <QuickCapture />

      {tags.length > 0 ? (
        <View style={styles.tags} accessibilityLabel="Filtrar por etiqueta">
          <Chip label="Todas" selected={tag === null} onPress={() => setTag(null)} />
          {tags.map((t) => (
            <Chip key={t} label={`#${t}`} selected={tag === t} onPress={() => setTag(tag === t ? null : t)} />
          ))}
        </View>
      ) : null}

      {tasks.isPending ? (
        <ActivityIndicator style={{ marginTop: space.xl }} color={c.accent} />
      ) : tasks.isError ? (
        <View style={styles.state}>
          <Text variant="body" tone="danger">{toUserError(tasks.error).message}</Text>
          <Button kind="secondary" label="Reintentar" onPress={() => tasks.refetch()} />
        </View>
      ) : sections.length === 0 ? (
        <View style={styles.state}>
          <Text variant="heading">Nada pendiente</Text>
          <Text variant="body" tone="soft">Escribe arriba lo primero que te venga a la cabeza. Ya lo ordenarás después.</Text>
        </View>
      ) : (
        sections.map((section) => {
          const closed = section.key === 'closed';
          return (
            <View key={section.key} style={styles.section}>
              <Pressable
                disabled={!closed}
                onPress={() => setShowClosed((v) => !v)}
                accessibilityRole={closed ? 'button' : 'header'}
                accessibilityState={closed ? { expanded: showClosed } : undefined}
                style={styles.sectionHeader}
              >
                <Text variant="label" tone="soft">
                  {section.title} <Text variant="label" tone="faint">{section.tasks.length}</Text>
                </Text>
                {closed ? <Text variant="label" tone="accent">{showClosed ? 'Ocultar' : 'Mostrar'}</Text> : null}
              </Pressable>
              {!closed || showClosed ? (
                <View style={[styles.list, { backgroundColor: c.surface }]}>
                  {section.tasks.map((t, i) => (
                    <View key={t.id} style={i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line } : undefined}>
                      <TaskRow task={t} staleDefault={staleDefault} onOpen={onOpen} onToggleDone={onToggleDone} />
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.md },
  headerText: { flex: 1, gap: space.xs },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  state: { gap: space.md, paddingVertical: space.xl },
  section: { gap: space.sm },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: space.sm },
  list: { borderRadius: 14, paddingHorizontal: space.md },
});
