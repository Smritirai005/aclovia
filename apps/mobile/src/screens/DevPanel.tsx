import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { useApp, ConflictRecord } from '../context/AppContext';
import { CLIENT_ID } from '../storage';

const SERVER = 'http://localhost:3001';

interface WebhookEntry {
  sessionId: string;
  firedAt: string;
  streak: number;
  coins: number;
}

export function DevPanel() {
  const {
    state, isOnline, toggleOnline, sync,
    pendingCount, conflicts,
  } = useApp();

  const [syncing, setSyncing]               = useState(false);
  const [resetting, setResetting]           = useState(false);
  const [webhooks, setWebhooks]             = useState<WebhookEntry[]>([]);
  const [lastSyncTime, setLastSyncTime]     = useState<string | null>(null);

  // Poll webhook log every 2s
  const fetchWebhooks = useCallback(async () => {
    try {
      const resp = await fetch(`${SERVER}/webhook/fired`);
      if (resp.ok) {
        const data = await resp.json();
        setWebhooks(data.webhooks ?? []);
      }
    } catch { /* server may be unreachable */ }
  }, []);

  useEffect(() => {
    fetchWebhooks();
    const id = setInterval(fetchWebhooks, 2000);
    return () => clearInterval(id);
  }, [fetchWebhooks]);

  const handleSync = async () => {
    setSyncing(true);
    await sync();
    setLastSyncTime(new Date().toLocaleTimeString());
    setSyncing(false);
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      await fetch(`${SERVER}/sync/reset`, { method: 'POST' });
      // Clear local storage too
      const { default: AsyncStorage } = await import(
        '@react-native-async-storage/async-storage'
      );
      const keys = await AsyncStorage.getAllKeys();
      const mine = keys.filter(k => k.startsWith(`alcovia:${CLIENT_ID}:`));
      await AsyncStorage.multiRemove(mine);
      Alert.alert('Reset', 'Server + local state cleared. Reload both tabs.');
    } catch (e) {
      Alert.alert('Error', String(e));
    }
    setResetting(false);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 60 }}>
      <Text style={styles.header}>Dev Panel</Text>
      <Text style={styles.clientId}>device: {CLIENT_ID}</Text>

      {/* ── Network toggle ──────────────────────────────────────────── */}
      <Section title="Network">
        <View style={styles.row}>
          <View style={[styles.dot, { backgroundColor: isOnline ? '#22c55e' : '#ef4444' }]} />
          <Text style={styles.statusText}>{isOnline ? 'Online' : 'Offline'}</Text>
          <TouchableOpacity
            style={[styles.pill, { backgroundColor: isOnline ? '#fee2e2' : '#dcfce7' }]}
            onPress={toggleOnline}
          >
            <Text style={{ color: isOnline ? '#dc2626' : '#16a34a', fontWeight: '700' }}>
              {isOnline ? 'Go offline' : 'Go online'}
            </Text>
          </TouchableOpacity>
        </View>
      </Section>

      {/* ── Sync ────────────────────────────────────────────────────── */}
      <Section title={`Pending: ${pendingCount} change${pendingCount !== 1 ? 's' : ''}`}>
        <TouchableOpacity
          style={[styles.actionBtn, syncing && styles.actionBtnDim]}
          onPress={handleSync}
          disabled={syncing}
        >
          {syncing
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.actionBtnText}>⟳ Force sync</Text>
          }
        </TouchableOpacity>
        {lastSyncTime && (
          <Text style={styles.hint}>Last sync: {lastSyncTime}</Text>
        )}
      </Section>

      {/* ── State ───────────────────────────────────────────────────── */}
      <Section title={`State — ${CLIENT_ID}`}>
        <Row label="Coins"      value={state?.coins ?? 0} />
        <Row label="Streak"     value={`${state?.streak ?? 0} days`} />
        <Row label="Sessions"   value={state?.sessions.length ?? 0} />
        <Row label="Last focus" value={state?.lastFocusDate ?? 'never'} />
        <Row label="Lamport ↑"  value={state?.lamportClock ?? 0} />
      </Section>

      {/* ── n8n notifications ───────────────────────────────────────── */}
      <Section title="n8n notifications">
        <Text style={styles.hint}>
          Count must stay at 1 even when the same session syncs from both devices
        </Text>
        <View style={styles.bigNumRow}>
          <Text style={[styles.bigNum, { color: webhooks.length > 0 ? '#6C63FF' : '#aaa' }]}>
            {webhooks.length}
          </Text>
          <Text style={styles.bigLabel}>webhooks fired (total)</Text>
        </View>
        {webhooks.slice(-4).reverse().map(w => (
          <View key={w.sessionId} style={styles.webhookRow}>
            <Text style={styles.mono}>✓ {w.sessionId.slice(0, 14)}…</Text>
            <Text style={styles.hint}>streak:{w.streak} coins:{w.coins}</Text>
            <Text style={styles.tinyHint}>{w.firedAt}</Text>
          </View>
        ))}
      </Section>

      {/* ── Conflicts ───────────────────────────────────────────────── */}
      {conflicts.length > 0 && (
        <Section title={`⚠ Conflicts resolved (${conflicts.length})`} warn>
          <Text style={styles.hint}>
            Higher Lamport clock wins. Server state is authoritative.
          </Text>
          {conflicts.slice(-4).reverse().map((c: ConflictRecord, i: number) => (
            <View key={i} style={styles.conflictRow}>
              <Text style={styles.mono}>{c.taskId.slice(0, 10)}…</Text>
              <Text style={styles.conflictDetail}>
                <Text style={{ color: '#dc2626' }}>{c.localStatus}</Text>
                {' → '}
                <Text style={{ color: '#16a34a' }}>{c.resolvedTo}</Text>
                {' (server lamport wins)'}
              </Text>
            </View>
          ))}
        </Section>
      )}

      {/* ── Task snapshot ───────────────────────────────────────────── */}
      <Section title="Task snapshot">
        {(state?.subjects ?? []).length === 0 && (
          <Text style={styles.hint}>No subjects — sync to load from server</Text>
        )}
        {(state?.subjects ?? []).flatMap(sub =>
          sub.chapters.flatMap(ch =>
            ch.tasks.map(task => (
              <View key={task.id} style={styles.taskRow}>
                <Text style={styles.taskName} numberOfLines={1}>{task.title}</Text>
                <Text style={[
                  styles.taskStatus,
                  task.status === 'done'        ? styles.green
                  : task.status === 'in_progress' ? styles.amber
                  : styles.muted,
                ]}>
                  {task.status}
                </Text>
                <Text style={styles.mono}>L:{task.lamport}</Text>
              </View>
            ))
          )
        )}
      </Section>

      {/* ── Recent sessions ─────────────────────────────────────────── */}
      <Section title="Sessions (latest 5)">
        {(state?.sessions ?? []).length === 0 && (
          <Text style={styles.hint}>No sessions yet</Text>
        )}
        {(state?.sessions ?? []).slice(-5).reverse().map(s => (
          <View key={s.id} style={styles.sessionRow}>
            <Text style={s.result === 'success' ? styles.green : styles.red}>
              {s.result === 'success' ? '✓' : '✗'} {s.result}
            </Text>
            <Text style={styles.hint}>
              {s.targetMinutes}min · +{s.coinsEarned}c
              {s.streakDay != null ? ` · streak:${s.streakDay}` : ''}
            </Text>
            <Text style={styles.mono}>{s.id.slice(0, 14)}…</Text>
          </View>
        ))}
      </Section>

      {/* ── Reset ───────────────────────────────────────────────────── */}
      <Section title="Danger zone">
        <Text style={styles.hint}>Clears server DB + this device's local storage</Text>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: '#dc2626' }, resetting && styles.actionBtnDim]}
          onPress={handleReset}
          disabled={resetting}
        >
          {resetting
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.actionBtnText}>🗑 Reset everything</Text>
          }
        </TouchableOpacity>
      </Section>
    </ScrollView>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function Section({
  title, children, warn,
}: {
  title: string; children: React.ReactNode; warn?: boolean;
}) {
  return (
    <View style={[styles.card, warn && styles.warnCard]}>
      <Text style={[styles.cardTitle, warn && styles.warnTitle]}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.stateRow}>
      <Text style={styles.stateLabel}>{label}</Text>
      <Text style={styles.stateValue}>{String(value)}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#f4f4f4', padding: 12 },
  header:         { fontSize: 20, fontWeight: '800', marginBottom: 2 },
  clientId:       { fontSize: 11, color: '#999', fontFamily: 'monospace', marginBottom: 14 },
  card:           { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#eee' },
  warnCard:       { borderColor: '#fde68a', backgroundColor: '#fffbeb' },
  cardTitle:      { fontSize: 12, fontWeight: '700', color: '#555', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.6 },
  warnTitle:      { color: '#b45309' },
  row:            { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot:            { width: 10, height: 10, borderRadius: 5 },
  statusText:     { flex: 1, fontSize: 15, fontWeight: '600' },
  pill:           { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  actionBtn:      { backgroundColor: '#6C63FF', padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 4 },
  actionBtnDim:   { opacity: 0.5 },
  actionBtnText:  { color: '#fff', fontWeight: '700', fontSize: 14 },
  hint:           { fontSize: 11, color: '#999', marginTop: 4, fontStyle: 'italic' },
  tinyHint:       { fontSize: 10, color: '#bbb' },
  bigNumRow:      { alignItems: 'center', paddingVertical: 8 },
  bigNum:         { fontSize: 44, fontWeight: '800', lineHeight: 52 },
  bigLabel:       { fontSize: 11, color: '#aaa' },
  webhookRow:     { paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  conflictRow:    { paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#fde68a' },
  conflictDetail: { fontSize: 12, color: '#666', marginTop: 2 },
  stateRow:       { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#f9f9f9' },
  stateLabel:     { fontSize: 13, color: '#666' },
  stateValue:     { fontSize: 13, fontWeight: '600', fontFamily: 'monospace' },
  taskRow:        { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, gap: 6, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  taskName:       { flex: 1, fontSize: 12, color: '#333' },
  taskStatus:     { fontSize: 11, fontFamily: 'monospace' },
  sessionRow:     { paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#f5f5f5', gap: 2 },
  mono:           { fontSize: 10, fontFamily: 'monospace', color: '#aaa' },
  green:          { color: '#16a34a', fontWeight: '600', fontSize: 12 },
  amber:          { color: '#d97706', fontWeight: '600', fontSize: 12 },
  red:            { color: '#dc2626', fontWeight: '600', fontSize: 12 },
  muted:          { color: '#bbb', fontSize: 12 },
});