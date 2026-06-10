import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useApp } from '../context/AppContext';
import { CLIENT_ID } from '../storage';

export function DevPanel() {
  const { state, isOnline, toggleOnline, sync, pendingCount } = useApp();

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={styles.header}>Dev Panel</Text>
      <Text style={styles.clientId}>Client: {CLIENT_ID}</Text>

      {/* Online / Offline toggle */}
      <View style={styles.row}>
        <View style={[styles.statusDot, { backgroundColor: isOnline ? '#22c55e' : '#ef4444' }]} />
        <Text style={styles.statusText}>{isOnline ? 'Online' : 'Offline'}</Text>
        <TouchableOpacity style={[styles.btn, { backgroundColor: isOnline ? '#fee' : '#efe' }]} onPress={toggleOnline}>
          <Text style={{ color: isOnline ? '#c00' : '#060' }}>
            {isOnline ? 'Go offline' : 'Go online'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Pending queue */}
      <View style={styles.infoBox}>
        <Text style={styles.infoLabel}>Pending changes (unsynced)</Text>
        <Text style={styles.infoBig}>{pendingCount}</Text>
      </View>

      {/* Manual sync */}
      <TouchableOpacity style={styles.syncBtn} onPress={sync}>
        <Text style={styles.syncBtnText}>Force sync now</Text>
      </TouchableOpacity>

      {/* State dump */}
      <Text style={styles.sectionTitle}>Current state</Text>
      <View style={styles.stateDump}>
        <Text style={styles.stateRow}>Coins: {state?.coins ?? 0}</Text>
        <Text style={styles.stateRow}>Streak: {state?.streak ?? 0} days</Text>
        <Text style={styles.stateRow}>Sessions: {state?.sessions.length ?? 0}</Text>
        <Text style={styles.stateRow}>Subjects: {state?.subjects.length ?? 0}</Text>
        <Text style={styles.stateRow}>Server lamport: {state?.lamportClock ?? 0}</Text>
      </View>

      {/* Last 3 sessions */}
      <Text style={styles.sectionTitle}>Recent sessions</Text>
      {(state?.sessions ?? []).slice(-3).reverse().map(s => (
        <View key={s.id} style={styles.sessionRow}>
          <Text style={styles.sessionResult(s.result ?? 'unknown')}>
            {s.result === 'success' ? '✓' : '✗'} {s.result}
          </Text>
          <Text style={styles.sessionMeta}>{s.targetMinutes}min · +{s.coinsEarned} coins</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
  header: { fontSize: 22, fontWeight: '700', marginBottom: 4 },
  clientId: { fontSize: 12, color: '#888', marginBottom: 20, fontFamily: 'monospace' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { flex: 1, fontSize: 15, fontWeight: '600' },
  btn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  infoBox: { padding: 16, backgroundColor: '#f5f5f5', borderRadius: 12, marginBottom: 16, alignItems: 'center' },
  infoLabel: { fontSize: 12, color: '#888' },
  infoBig: { fontSize: 36, fontWeight: '700', marginTop: 4 },
  syncBtn: { padding: 16, backgroundColor: '#6C63FF', borderRadius: 12, alignItems: 'center', marginBottom: 24 },
  syncBtnText: { color: '#fff', fontWeight: '600' },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: '#666', marginBottom: 8, marginTop: 8 },
  stateDump: { backgroundColor: '#f9f9f9', padding: 12, borderRadius: 8, marginBottom: 16 },
  stateRow: { fontSize: 13, color: '#333', paddingVertical: 2, fontFamily: 'monospace' },
  sessionRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  sessionResult: (result: string) => ({
    fontSize: 13,
    fontWeight: '600',
    color: result === 'success' ? '#22c55e' : '#ef4444',
  }),
  sessionMeta: { fontSize: 12, color: '#888' },
});