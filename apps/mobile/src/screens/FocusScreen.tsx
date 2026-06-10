import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useApp } from '../context/AppContext';

export function FocusScreen() {
  const { state, activeSession, elapsedSeconds, startSession, giveUpSession } = useApp();
  const [selectedMinutes, setSelectedMinutes] = useState(25);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const targetSecs = (activeSession?.targetMinutes ?? selectedMinutes) * 60;
  const progress = activeSession ? (elapsedSeconds / targetSecs) * 100 : 0;

  if (activeSession) {
    return (
      <View style={styles.container}>
        <Text style={styles.label}>Focus session</Text>
        <Text style={styles.timer}>{formatTime(elapsedSeconds)}</Text>
        <Text style={styles.sub}>/ {formatTime(targetSecs)}</Text>

        {/* Simple progress bar */}
        <View style={styles.progressBg}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>

        <TouchableOpacity style={styles.giveUpBtn} onPress={giveUpSession}>
          <Text style={styles.giveUpText}>Give up</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Start a focus session</Text>

      {/* Stat row */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statNum}>{state?.coins ?? 0}</Text>
          <Text style={styles.statLabel}>Coins</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statNum}>{state?.streak ?? 0}</Text>
          <Text style={styles.statLabel}>Day streak</Text>
        </View>
      </View>

      {/* Duration picker */}
      <Text style={styles.sub}>Choose duration</Text>
      <View style={styles.durationRow}>
        {[15, 25, 45, 60].map(m => (
          <TouchableOpacity
            key={m}
            style={[styles.durationBtn, selectedMinutes === m && styles.durationBtnActive]}
            onPress={() => setSelectedMinutes(m)}
          >
            <Text style={[styles.durationText, selectedMinutes === m && styles.durationTextActive]}>
              {m}m
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.startBtn} onPress={() => startSession(selectedMinutes)}>
        <Text style={styles.startText}>Start</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff' },
  label: { fontSize: 22, fontWeight: '600', marginBottom: 24 },
  timer: { fontSize: 64, fontWeight: '700', textAlign: 'center', marginTop: 40 },
  sub: { fontSize: 14, color: '#888', textAlign: 'center', marginBottom: 12 },
  progressBg: { height: 8, backgroundColor: '#eee', borderRadius: 4, marginVertical: 24 },
  progressFill: { height: 8, backgroundColor: '#6C63FF', borderRadius: 4 },
  giveUpBtn: { marginTop: 16, padding: 16, backgroundColor: '#fee', borderRadius: 12, alignItems: 'center' },
  giveUpText: { color: '#c00', fontWeight: '600', fontSize: 16 },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 32 },
  statBox: { flex: 1, padding: 16, backgroundColor: '#f5f5f5', borderRadius: 12, alignItems: 'center' },
  statNum: { fontSize: 28, fontWeight: '700' },
  statLabel: { fontSize: 12, color: '#888', marginTop: 4 },
  durationRow: { flexDirection: 'row', gap: 8, marginBottom: 32 },
  durationBtn: { flex: 1, padding: 12, borderRadius: 10, borderWidth: 1.5, borderColor: '#ddd', alignItems: 'center' },
  durationBtnActive: { borderColor: '#6C63FF', backgroundColor: '#f0eeff' },
  durationText: { fontSize: 15, color: '#888' },
  durationTextActive: { color: '#6C63FF', fontWeight: '600' },
  startBtn: { padding: 18, backgroundColor: '#6C63FF', borderRadius: 14, alignItems: 'center' },
  startText: { color: '#fff', fontSize: 18, fontWeight: '700' },
});