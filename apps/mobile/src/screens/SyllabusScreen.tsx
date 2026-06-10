import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useApp } from '../context/AppContext';
import { TaskStatus, Subject } from '../types';

const STATUS_LABELS: Record<TaskStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  done: 'Done',
};

const NEXT_STATUS: Record<TaskStatus, TaskStatus> = {
  not_started: 'in_progress',
  in_progress: 'done',
  done: 'not_started',
};

const STATUS_COLOR: Record<TaskStatus, string> = {
  not_started: '#ccc',
  in_progress: '#f0a500',
  done: '#22c55e',
};

function calcChapterProgress(tasks: Subject['chapters'][0]['tasks']) {
  if (tasks.length === 0) return 0;
  const done = tasks.filter(t => t.status === 'done').length;
  return Math.round((done / tasks.length) * 100);
}

function calcSubjectProgress(subject: Subject) {
  const allTasks = subject.chapters.flatMap(c => c.tasks);
  return calcChapterProgress(allTasks);
}

export function SyllabusScreen() {
  const { state, updateTaskStatus } = useApp();

  if (!state || state.subjects.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.empty}>No subjects loaded yet. Sync to load.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={styles.header}>Syllabus</Text>
      {state.subjects.map(subject => (
        <View key={subject.id} style={styles.subjectCard}>
          <View style={styles.subjectHeader}>
            <Text style={styles.subjectTitle}>{subject.title}</Text>
            <Text style={styles.progress}>{calcSubjectProgress(subject)}%</Text>
          </View>

          {subject.chapters.map(chapter => (
            <View key={chapter.id} style={styles.chapter}>
              <View style={styles.chapterHeader}>
                <Text style={styles.chapterTitle}>{chapter.title}</Text>
                <Text style={styles.chapterProgress}>
                  {calcChapterProgress(chapter.tasks)}%
                </Text>
              </View>

              {chapter.tasks.map(task => (
                <TouchableOpacity
                  key={task.id}
                  style={styles.taskRow}
                  onPress={() => updateTaskStatus(task.id, NEXT_STATUS[task.status])}
                >
                  <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[task.status] }]} />
                  <Text style={styles.taskTitle}>{task.title}</Text>
                  <Text style={styles.statusLabel}>{STATUS_LABELS[task.status]}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
  header: { fontSize: 22, fontWeight: '700', marginBottom: 16 },
  empty: { color: '#888', textAlign: 'center', marginTop: 40 },
  subjectCard: { marginBottom: 24, borderRadius: 12, borderWidth: 1, borderColor: '#eee', padding: 16 },
  subjectHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  subjectTitle: { fontSize: 18, fontWeight: '700' },
  progress: { fontSize: 16, fontWeight: '600', color: '#6C63FF' },
  chapter: { marginBottom: 12 },
  chapterHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  chapterTitle: { fontSize: 14, fontWeight: '600', color: '#444' },
  chapterProgress: { fontSize: 13, color: '#888' },
  taskRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  taskTitle: { flex: 1, fontSize: 14 },
  statusLabel: { fontSize: 12, color: '#888' },
});