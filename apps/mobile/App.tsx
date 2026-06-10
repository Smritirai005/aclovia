import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AppProvider } from './src/context/AppContext';
import { FocusScreen } from './src/screens/FocusScreen';
import { SyllabusScreen } from './src/screens/SyllabusScreen';
import { DevPanel } from './src/screens/DevPanel';

type Tab = 'focus' | 'syllabus' | 'dev';

export default function App() {
  const [tab, setTab] = useState<Tab>('focus');

  return (
    <AppProvider>
      <SafeAreaView style={styles.root}>
        <StatusBar style="auto" />
        <View style={styles.content}>
          {tab === 'focus' && <FocusScreen />}
          {tab === 'syllabus' && <SyllabusScreen />}
          {tab === 'dev' && <DevPanel />}
        </View>
        <View style={styles.tabBar}>
          {(['focus', 'syllabus', 'dev'] as Tab[]).map(t => (
            <TouchableOpacity key={t} style={styles.tabBtn} onPress={() => setTab(t)}>
              <Text style={[styles.tabLabel, tab === t && styles.tabActive]}>
                {t === 'focus' ? '⏱ Focus' : t === 'syllabus' ? '📚 Syllabus' : '🔧 Dev'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </SafeAreaView>
    </AppProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  content: { flex: 1 },
  tabBar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#eee', backgroundColor: '#fff' },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabLabel: { fontSize: 13, color: '#aaa' },
  tabActive: { color: '#6C63FF', fontWeight: '700' },
});