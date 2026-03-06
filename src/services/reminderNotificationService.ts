import { Capacitor } from '@capacitor/core';
import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications';
import { AppState, Transaction } from '../types';

const REMINDER_SENT_STORAGE_KEY = 'meu_controle_reminder_sent_v1';
const REMINDER_SCHEDULED_STORAGE_KEY = 'meu_controle_reminder_scheduled_v1';
const REMINDER_CHANNEL_ID = 'due-reminders';
const REMINDER_CHANNEL_NAME = 'Lembretes de vencimento';
const MAX_INT_32 = 2147483647;

type SentReminderMap = Record<string, string>;
type ScheduledReminderMap = Record<string, number>;

let channelReady = false;

const isNativePlatform = (): boolean => Capacitor.isNativePlatform();

const toIsoDate = (date: Date): string => {
  const local = new Date(date);
  local.setHours(0, 0, 0, 0);
  const year = local.getFullYear();
  const month = String(local.getMonth() + 1).padStart(2, '0');
  const day = String(local.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseIsoDate = (iso: string): Date => {
  const [year, month, day] = iso.split('-').map(Number);
  const parsed = new Date(year, (month || 1) - 1, day || 1);
  parsed.setHours(0, 0, 0, 0);
  return parsed;
};

const addDaysToIsoDate = (isoDate: string, daysToAdd: number): string => {
  const parsed = parseIsoDate(isoDate);
  parsed.setDate(parsed.getDate() + daysToAdd);
  return toIsoDate(parsed);
};

const reminderDateForDue = (dueIso: string, daysBefore: number): Date => {
  const due = parseIsoDate(dueIso);
  due.setDate(due.getDate() - daysBefore);
  due.setHours(9, 0, 0, 0);
  return due;
};

const toStableNotificationId = (seed: string): number => {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  }

  const unsigned = hash >>> 0;
  return (unsigned % MAX_INT_32) + 1;
};

const safeReadJsonRecord = <T extends Record<string, unknown>>(key: string): T => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {} as T;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {} as T;
    return parsed as T;
  } catch {
    return {} as T;
  }
};

const readSentReminders = (): SentReminderMap => safeReadJsonRecord<SentReminderMap>(REMINDER_SENT_STORAGE_KEY);
const readScheduledReminders = (): ScheduledReminderMap =>
  safeReadJsonRecord<ScheduledReminderMap>(REMINDER_SCHEDULED_STORAGE_KEY);

const saveSentReminders = (value: SentReminderMap) => {
  localStorage.setItem(REMINDER_SENT_STORAGE_KEY, JSON.stringify(value));
};

const saveScheduledReminders = (value: ScheduledReminderMap) => {
  localStorage.setItem(REMINDER_SCHEDULED_STORAGE_KEY, JSON.stringify(value));
};

const getDueIso = (transaction: Transaction): string | null => {
  const due = transaction.dueDate || transaction.date;
  if (!due) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return null;
  return due;
};

const buildReminderMessage = (
  transaction: Transaction,
  state: AppState,
  dueIso: string,
  todayIso: string
): { title: string; body: string } => {
  const categoryName = state.categories.find((category) => category.id === transaction.categoryId)?.name || 'Sem categoria';
  const amount = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(transaction.amount);
  const overdue = dueIso < todayIso;
  return {
    title: overdue ? 'Pendencia atrasada' : 'Lembrete de vencimento',
    body: `${transaction.description || categoryName} - ${amount} - vence ${dueIso}`,
  };
};

const shouldNotifyNow = (
  dueIso: string,
  todayIso: string,
  limitIso: string,
  includeOverdue: boolean
): boolean => {
  if (dueIso < todayIso) return includeOverdue;
  return dueIso <= limitIso;
};

const pruneSentReminders = (sent: SentReminderMap): { next: SentReminderMap; changed: boolean } => {
  let changed = false;
  const next = { ...sent };

  for (const [key, value] of Object.entries(sent)) {
    const sentAt = new Date(value);
    if (Number.isNaN(sentAt.getTime())) continue;
    const ageDays = (Date.now() - sentAt.getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays > 15) {
      delete next[key];
      changed = true;
    }
  }

  return { next, changed };
};

const ensureAndroidNotificationChannel = async () => {
  if (!isNativePlatform()) return;
  if (Capacitor.getPlatform() !== 'android') return;
  if (channelReady) return;

  try {
    await LocalNotifications.createChannel({
      id: REMINDER_CHANNEL_ID,
      name: REMINDER_CHANNEL_NAME,
      description: 'Alertas de contas a pagar e a receber',
      importance: 4,
      vibration: true,
    });
  } catch {
    // Channel may already exist.
  } finally {
    channelReady = true;
  }
};

const clearNativeScheduledReminders = async () => {
  const scheduled = readScheduledReminders();
  const toCancel = Object.values(scheduled).map((id) => ({ id }));
  if (toCancel.length) {
    try {
      await LocalNotifications.cancel({ notifications: toCancel });
    } catch (error) {
      console.error('Failed to clear native scheduled reminders:', error);
    }
  }

  localStorage.removeItem(REMINDER_SCHEDULED_STORAGE_KEY);
};

const dispatchWebReminders = (state: AppState) => {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;

  const todayIso = toIsoDate(new Date());
  const limitIso = addDaysToIsoDate(todayIso, state.reminderSettings.daysBefore);
  const sentMap = readSentReminders();
  const { next, changed: pruned } = pruneSentReminders(sentMap);
  let changed = pruned;

  for (const transaction of state.transactions) {
    if (transaction.status !== 'pending') continue;
    const dueIso = getDueIso(transaction);
    if (!dueIso) continue;
    if (!shouldNotifyNow(dueIso, todayIso, limitIso, state.reminderSettings.includeOverdue)) continue;

    const reminderKey = `${todayIso}:${transaction.id}`;
    if (next[reminderKey]) continue;

    const { title, body } = buildReminderMessage(transaction, state, dueIso, todayIso);
    new Notification(title, { body });
    next[reminderKey] = new Date().toISOString();
    changed = true;
  }

  if (changed) {
    saveSentReminders(next);
  }
};

const dispatchNativeReminders = async (state: AppState) => {
  const permission = await LocalNotifications.checkPermissions();
  if (permission.display !== 'granted') return;

  await ensureAndroidNotificationChannel();

  const now = new Date();
  const todayIso = toIsoDate(now);
  const limitIso = addDaysToIsoDate(todayIso, state.reminderSettings.daysBefore);

  const sentMap = readSentReminders();
  const { next: sentNext, changed: sentPruned } = pruneSentReminders(sentMap);
  let sentChanged = sentPruned;

  const scheduledCurrent = readScheduledReminders();
  const scheduledNext: ScheduledReminderMap = {};
  const notificationsToSchedule: LocalNotificationSchema[] = [];

  for (const transaction of state.transactions) {
    if (transaction.status !== 'pending') continue;
    const dueIso = getDueIso(transaction);
    if (!dueIso) continue;
    if (dueIso < todayIso && !state.reminderSettings.includeOverdue) continue;

    const { title, body } = buildReminderMessage(transaction, state, dueIso, todayIso);
    const remindAt = reminderDateForDue(dueIso, state.reminderSettings.daysBefore);

    if (remindAt.getTime() > now.getTime()) {
      const scheduleKey = `future:${transaction.id}:${dueIso}:${state.reminderSettings.daysBefore}`;
      const id = toStableNotificationId(scheduleKey);
      scheduledNext[scheduleKey] = id;

      if (scheduledCurrent[scheduleKey] !== id) {
        notificationsToSchedule.push({
          id,
          title,
          body,
          channelId: REMINDER_CHANNEL_ID,
          schedule: {
            at: remindAt,
            allowWhileIdle: true,
          },
        });
      }

      continue;
    }

    if (!shouldNotifyNow(dueIso, todayIso, limitIso, state.reminderSettings.includeOverdue)) continue;
    const reminderKey = `${todayIso}:${transaction.id}`;
    if (sentNext[reminderKey]) continue;

    sentNext[reminderKey] = new Date().toISOString();
    sentChanged = true;

    notificationsToSchedule.push({
      id: toStableNotificationId(`immediate:${reminderKey}`),
      title,
      body,
      channelId: REMINDER_CHANNEL_ID,
      schedule: {
        at: new Date(Date.now() + 1500),
        allowWhileIdle: true,
      },
    });
  }

  const staleToCancel = Object.entries(scheduledCurrent)
    .filter(([key, id]) => scheduledNext[key] !== id)
    .map(([, id]) => ({ id }));

  if (staleToCancel.length) {
    await LocalNotifications.cancel({ notifications: staleToCancel });
  }

  if (notificationsToSchedule.length) {
    await LocalNotifications.schedule({ notifications: notificationsToSchedule });
  }

  saveScheduledReminders(scheduledNext);
  if (sentChanged) {
    saveSentReminders(sentNext);
  }
};

export const requestReminderPermission = async (): Promise<boolean> => {
  if (typeof window === 'undefined') return false;

  try {
    if (isNativePlatform()) {
      const permission = await LocalNotifications.requestPermissions();
      return permission.display === 'granted';
    }

    if (typeof Notification === 'undefined') return false;
    const result = await Notification.requestPermission();
    return result === 'granted';
  } catch (error) {
    console.error('Failed to request reminder permission:', error);
    return false;
  }
};

export const dispatchPendingReminders = async (state: AppState): Promise<void> => {
  if (typeof window === 'undefined') return;

  if (!state.reminderSettings.enabled) {
    if (isNativePlatform()) {
      await clearNativeScheduledReminders();
    }
    return;
  }

  try {
    if (isNativePlatform()) {
      await dispatchNativeReminders(state);
      return;
    }

    dispatchWebReminders(state);
  } catch (error) {
    console.error('Failed to dispatch reminders:', error);
  }
};
