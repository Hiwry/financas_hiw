import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  AppState,
  Category,
  CategoryGoal,
  CreditCard,
  CreditCardInvoicePayment,
  HouseholdMember,
  ReminderSettings,
  Transaction,
} from './types';
import {
  DEFAULT_ACCOUNTS,
  DEFAULT_CATEGORIES,
  DEFAULT_CREDIT_CARDS,
  DEFAULT_HOUSEHOLD_SETTINGS,
  DEFAULT_REMINDER_SETTINGS,
  SEED_TRANSACTIONS,
} from './constants';
import { loadRemoteAppState, saveRemoteAppState } from './services/supabaseStateService';
import { dispatchPendingReminders } from './services/reminderNotificationService';
import { mergeAppStatesOnConflict } from './utils/stateMerge';

const STORAGE_KEY = 'meu_controle_data_v3';
const RECURRING_LOOKAHEAD_DAYS = 120;

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

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

const addMonthsToIsoDate = (isoDate: string, monthsToAdd: number): string => {
  const parsed = parseIsoDate(isoDate);
  parsed.setMonth(parsed.getMonth() + monthsToAdd);
  return toIsoDate(parsed);
};

const addDaysToIsoDate = (isoDate: string, daysToAdd: number): string => {
  const parsed = parseIsoDate(isoDate);
  parsed.setDate(parsed.getDate() + daysToAdd);
  return toIsoDate(parsed);
};

const addRecurrenceStep = (isoDate: string, recurrence: Transaction['recurrence']): string | null => {
  const base = parseIsoDate(isoDate);
  if (Number.isNaN(base.getTime())) return null;

  switch (recurrence) {
    case 'weekly':
      base.setDate(base.getDate() + 7);
      return toIsoDate(base);
    case 'biweekly':
      base.setDate(base.getDate() + 14);
      return toIsoDate(base);
    case 'monthly':
      base.setMonth(base.getMonth() + 1);
      return toIsoDate(base);
    case 'yearly':
      base.setFullYear(base.getFullYear() + 1);
      return toIsoDate(base);
    default:
      return null;
  }
};

const roundCurrency = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
const normalizeCardDay = (value: number): number => Math.min(28, Math.max(1, Math.floor(Number(value) || 1)));

const buildDeterministicCardId = (account: string): string => {
  const normalized = normalizeText(account).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `card_${normalized || 'principal'}`;
};

const getCreditCardCycleKey = (txDateIso: string, closingDay: number): string => {
  const base = parseIsoDate(txDateIso);
  const cycleDate = new Date(base);
  if (base.getDate() > normalizeCardDay(closingDay)) {
    cycleDate.setMonth(cycleDate.getMonth() + 1);
  }
  return `${cycleDate.getFullYear()}-${String(cycleDate.getMonth() + 1).padStart(2, '0')}`;
};

const getCycleDueDate = (cycleKey: string, dueDay: number): string => {
  const [yearRaw, monthRaw] = cycleKey.split('-').map(Number);
  const year = Number.isFinite(yearRaw) ? yearRaw : new Date().getFullYear();
  const month = Number.isFinite(monthRaw) ? monthRaw : new Date().getMonth() + 1;
  const date = new Date(year, month - 1, normalizeCardDay(dueDay));
  return toIsoDate(date);
};

const addMonthsToCycleKey = (cycleKey: string, monthsToAdd: number): string => {
  const [yearRaw, monthRaw] = cycleKey.split('-').map(Number);
  const parsed = new Date(Number.isFinite(yearRaw) ? yearRaw : new Date().getFullYear(), (Number.isFinite(monthRaw) ? monthRaw : 1) - 1, 1);
  parsed.setMonth(parsed.getMonth() + monthsToAdd);
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
};

const getInstallmentNumber = (transaction: Transaction): number => {
  const parsed = Number(transaction.installmentNumber);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
};

const splitAmountEvenly = (totalAmount: number, count: number): number[] => {
  const safeCount = Math.min(48, Math.max(1, Math.floor(Number(count) || 1)));
  const totalCents = Math.max(0, Math.round((Number(totalAmount) || 0) * 100));
  const baseCents = Math.floor(totalCents / safeCount);
  let remainder = totalCents - baseCents * safeCount;

  return Array.from({ length: safeCount }, () => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    return (baseCents + extra) / 100;
  });
};

export const suggestCategoryIcon = (name: string, type: 'income' | 'expense'): string => {
  const n = name.toLowerCase();

  if (n.includes('casa') || n.includes('moradia') || n.includes('aluguel') || n.includes('condominio')) return 'Home';
  if (n.includes('comida') || n.includes('alimentacao') || n.includes('restaurante') || n.includes('mercado') || n.includes('ifood') || n.includes('lanche')) return 'Utensils';
  if (n.includes('carro') || n.includes('transporte') || n.includes('uber') || n.includes('gasolina') || n.includes('combustivel') || n.includes('onibus') || n.includes('metro')) return 'Car';
  if (n.includes('saude') || n.includes('farmacia') || n.includes('medico') || n.includes('hospital') || n.includes('remedio')) return 'HeartPulse';
  if (n.includes('lazer') || n.includes('diversao') || n.includes('jogo') || n.includes('cinema') || n.includes('festa')) return 'Gamepad2';
  if (n.includes('conta') || n.includes('boleto') || n.includes('luz') || n.includes('agua') || n.includes('internet') || n.includes('telefone')) return 'FileText';
  if (n.includes('assinatura') || n.includes('streaming') || n.includes('netflix') || n.includes('spotify')) return 'MonitorPlay';
  if (n.includes('educacao') || n.includes('escola') || n.includes('curso') || n.includes('faculdade') || n.includes('livro')) return 'GraduationCap';
  if (n.includes('imposto') || n.includes('taxa') || n.includes('tarifa') || n.includes('juros')) return 'Landmark';
  if (n.includes('compra') || n.includes('shopping') || n.includes('roupa') || n.includes('calcado')) return 'ShoppingBag';
  if (n.includes('presente') || n.includes('doacao') || n.includes('caridade')) return 'Gift';
  if (n.includes('viagem') || n.includes('ferias') || n.includes('hotel') || n.includes('passagem')) return 'Plane';
  if (n.includes('pet') || n.includes('cachorro') || n.includes('gato') || n.includes('veterinario') || n.includes('racao')) return 'PawPrint';
  if (n.includes('cafe') || n.includes('padaria')) return 'Coffee';
  if (n.includes('beleza') || n.includes('cabelo') || n.includes('salao') || n.includes('barbearia')) return 'Scissors';
  if (n.includes('bebe') || n.includes('filho') || n.includes('crianca') || n.includes('fralda')) return 'Baby';

  if (n.includes('salario') || n.includes('pagamento') || n.includes('renda') || n.includes('adiantamento')) return 'Briefcase';
  if (n.includes('freela') || n.includes('trabalho') || n.includes('projeto') || n.includes('servico')) return 'Laptop';
  if (n.includes('investimento') || n.includes('rendimento') || n.includes('acoes') || n.includes('dividendos') || n.includes('poupanca')) return 'TrendingUp';
  if (n.includes('reembolso') || n.includes('devolucao') || n.includes('cashback')) return 'RefreshCcw';
  if (n.includes('venda') || n.includes('negocio') || n.includes('loja')) return 'Store';

  return 'MoreHorizontal';
};

interface AppContextType extends AppState {
  activeMember: HouseholdMember;
  canEdit: boolean;
  addTransaction: (tx: Transaction) => void;
  addTransactions: (txs: Transaction[]) => void;
  updateTransaction: (tx: Transaction) => void;
  updateInstallmentGroupFrom: (transactionId: string, template: Transaction) => void;
  settleFutureInstallments: (transactionId: string) => void;
  cancelFutureInstallments: (transactionId: string) => void;
  renegotiateInstallments: (transactionId: string, futureCount: number, totalAmount: number, firstDueDate?: string) => void;
  markTransactionsPaid: (ids: string[]) => void;
  deleteTransaction: (id: string) => void;
  addCategory: (cat: Category) => void;
  updateCategory: (cat: Category) => void;
  deleteCategory: (id: string) => void;
  addAccount: (acc: string) => void;
  setCategoryGoal: (goal: CategoryGoal) => void;
  clearCategoryGoal: (categoryId: string) => void;
  addCreditCard: (card: Omit<CreditCard, 'id' | 'createdAt'>) => void;
  updateCreditCard: (card: CreditCard) => void;
  deleteCreditCard: (id: string) => void;
  payCreditCardInvoice: (cardId: string, cycleKey: string, amount: number, paidAt: string) => void;
  updateReminderSettings: (settings: Partial<ReminderSettings>) => void;
  setHouseholdEnabled: (enabled: boolean) => void;
  setActiveMember: (memberId: string) => void;
  addHouseholdMember: (name: string, role: HouseholdMember['role']) => void;
  updateHouseholdMember: (member: HouseholdMember) => void;
  deleteHouseholdMember: (memberId: string) => void;
  replaceState: (next: AppState) => void;
  resetData: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const isValidState = (value: unknown): value is Partial<AppState> => {
  if (!value || typeof value !== 'object') return false;
  const parsed = value as Partial<AppState>;
  return Array.isArray(parsed.transactions) && Array.isArray(parsed.categories) && Array.isArray(parsed.accounts);
};

const applySuggestedIcons = (state: AppState): AppState => ({
  ...state,
  categories: state.categories.map((category) => {
    if (!category.icon || category.icon === 'MoreHorizontal' || category.icon === 'HelpCircle') {
      return { ...category, icon: suggestCategoryIcon(category.name, category.type) };
    }
    return category;
  }),
});

const normalizeCreditCard = (card: CreditCard): CreditCard => ({
  ...card,
  id: card.id || buildDeterministicCardId(card.account || card.name || 'principal'),
  name: card.name || card.account || 'Cartao',
  account: card.account || card.name || 'Cartao',
  closingDay: normalizeCardDay(card.closingDay),
  dueDay: normalizeCardDay(card.dueDay),
  limit: Math.max(0, Number(card.limit) || 0),
  interestRateMonthly: Math.max(0, roundCurrency(Number(card.interestRateMonthly) || 0)),
  createdAt: card.createdAt || new Date().toISOString(),
});

const normalizeHousehold = (value: Partial<AppState>): AppState['household'] => {
  const incoming = value.household;
  const baseMembers = Array.isArray(incoming?.members) && incoming?.members.length
    ? incoming.members
    : DEFAULT_HOUSEHOLD_SETTINGS.members;

  const members = baseMembers.map((member) => ({
    id: member.id || uuidv4(),
    name: (member.name || 'Pessoa').trim(),
    role: member.role === 'viewer' || member.role === 'editor' || member.role === 'owner' ? member.role : 'editor',
    color: member.color,
  }));

  const activeMemberId = members.some((member) => member.id === incoming?.activeMemberId)
    ? String(incoming?.activeMemberId)
    : members[0]?.id || DEFAULT_HOUSEHOLD_SETTINGS.activeMemberId;

  return {
    enabled: Boolean(incoming?.enabled),
    members,
    activeMemberId,
  };
};

const normalizeReminderSettings = (value: Partial<AppState>): ReminderSettings => {
  const incoming = value.reminderSettings || DEFAULT_REMINDER_SETTINGS;
  return {
    enabled: Boolean(incoming.enabled),
    daysBefore: Math.min(30, Math.max(0, Math.floor(Number(incoming.daysBefore) || 0))),
    includeOverdue: incoming.includeOverdue !== false,
  };
};

const resolveActiveMember = (household: AppState['household']): HouseholdMember => {
  return household.members.find((member) => member.id === household.activeMemberId) || household.members[0];
};

const canEditFromState = (state: AppState): boolean => {
  if (!state.household.enabled) return true;
  const active = resolveActiveMember(state.household);
  return active?.role !== 'viewer';
};

const enrichCreditCards = (cards: CreditCard[], transactions: Transaction[]): CreditCard[] => {
  const next = [...cards];
  const usedCreditAccounts = Array.from(
    new Set(
      transactions
        .filter((transaction) => transaction.paymentMethod === 'credito')
        .map((transaction) => transaction.account)
        .filter(Boolean)
    )
  );

  for (const account of usedCreditAccounts) {
    const exists = next.some((card) => normalizeText(card.account) === normalizeText(account));
    if (exists) continue;

    next.push({
      id: buildDeterministicCardId(account),
      name: account,
      account,
      closingDay: 8,
      dueDay: 15,
      limit: 0,
      interestRateMonthly: 0,
      createdAt: new Date().toISOString(),
    });
  }

  if (!next.length) {
    return DEFAULT_CREDIT_CARDS.map((card) => ({ ...card }));
  }

  return next;
};

const withCreditCardMetadata = (transaction: Transaction, cards: CreditCard[]): Transaction => {
  if (transaction.paymentMethod !== 'credito' || transaction.type !== 'expense') {
    return {
      ...transaction,
      creditCardId: undefined,
      creditCardCycleKey: undefined,
      isCreditCardInterest: Boolean(transaction.isCreditCardInterest),
    };
  }

  const card =
    cards.find((candidate) => candidate.id === transaction.creditCardId) ||
    cards.find((candidate) => normalizeText(candidate.account) === normalizeText(transaction.account)) ||
    cards[0];

  if (!card) {
    return transaction;
  }

  const cycleKey = transaction.creditCardCycleKey || getCreditCardCycleKey(transaction.date, card.closingDay);
  const dueDate = transaction.dueDate || getCycleDueDate(cycleKey, card.dueDay);

  return {
    ...transaction,
    account: transaction.account || card.account,
    creditCardId: card.id,
    creditCardCycleKey: cycleKey,
    dueDate,
  };
};

const normalizeTransaction = (transaction: Transaction, cards: CreditCard[], activeMemberId: string): Transaction => {
  const normalized: Transaction = {
    ...transaction,
    id: transaction.id || uuidv4(),
    type: transaction.type === 'income' ? 'income' : 'expense',
    nature: transaction.nature === 'fixed' ? 'fixed' : 'variable',
    paymentMethod: transaction.paymentMethod || 'pix',
    recurrence: transaction.recurrence || 'none',
    status: transaction.status === 'paid' ? 'paid' : 'pending',
    createdAt: transaction.createdAt || new Date().toISOString(),
    tags: Array.isArray(transaction.tags) ? transaction.tags.filter(Boolean) : [],
    installmentCount: Math.max(1, Math.floor(Number(transaction.installmentCount) || 1)),
    installmentNumber:
      Number.isFinite(Number(transaction.installmentNumber)) && Number(transaction.installmentNumber) > 0
        ? Math.floor(Number(transaction.installmentNumber))
        : undefined,
    ownerMemberId: transaction.ownerMemberId || activeMemberId,
    dueDate: transaction.dueDate || (transaction.status === 'pending' ? transaction.date : undefined),
  };

  return withCreditCardMetadata(normalized, cards);
};

const applyRecurringProjection = (state: AppState): AppState => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + RECURRING_LOOKAHEAD_DAYS);

  let normalizedSourceChanged = false;
  const normalizedTransactions = state.transactions.map((transaction) => {
    if (transaction.recurrence === 'none') return transaction;
    if (transaction.installmentGroupId) return transaction;
    if (transaction.recurrenceSourceId) return transaction;

    normalizedSourceChanged = true;
    return { ...transaction, recurrenceSourceId: transaction.id };
  });

  const grouped = new Map<string, Transaction[]>();
  for (const transaction of normalizedTransactions) {
    if (transaction.recurrence === 'none') continue;
    if (transaction.installmentGroupId) continue;

    const sourceId = transaction.recurrenceSourceId || transaction.id;
    const list = grouped.get(sourceId) || [];
    list.push(transaction);
    grouped.set(sourceId, list);
  }

  const generated: Transaction[] = [];

  for (const [sourceId, list] of grouped.entries()) {
    const ordered = [...list].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const dateIndex = new Map<string, Transaction>();
    ordered.forEach((item) => dateIndex.set(item.date, item));

    let cursor = ordered[ordered.length - 1];
    let safety = 0;

    while (safety < 500) {
      safety += 1;
      const nextDate = addRecurrenceStep(cursor.date, cursor.recurrence);
      if (!nextDate || nextDate === cursor.date) break;

      const nextDateObj = parseIsoDate(nextDate);
      if (nextDateObj > horizon) break;

      const existing = dateIndex.get(nextDate);
      if (existing) {
        cursor = existing;
        continue;
      }

      const createdAt = new Date().toISOString();
      const nextTransaction: Transaction = {
        ...cursor,
        id: uuidv4(),
        date: nextDate,
        dueDate: nextDate,
        status: 'pending',
        createdAt,
        autoGenerated: true,
        recurrenceSourceId: sourceId,
      };

      generated.push(nextTransaction);
      dateIndex.set(nextDate, nextTransaction);
      cursor = nextTransaction;
    }
  }

  if (!generated.length && !normalizedSourceChanged) {
    return state;
  }

  return {
    ...state,
    transactions: [...normalizedTransactions, ...generated],
  };
};

const normalizeCoreState = (value: Partial<AppState>): AppState => {
  const categories = Array.isArray(value.categories) && value.categories.length
    ? value.categories.map((category) => ({
        ...category,
        icon: category.icon || suggestCategoryIcon(category.name, category.type),
      }))
    : DEFAULT_CATEGORIES.map((category) => ({ ...category }));

  const accounts = Array.isArray(value.accounts) && value.accounts.length
    ? Array.from(new Set(value.accounts.filter(Boolean)))
    : [...DEFAULT_ACCOUNTS];

  const household = normalizeHousehold(value);
  const activeMember = resolveActiveMember(household) || DEFAULT_HOUSEHOLD_SETTINGS.members[0];

  const baseTransactions = Array.isArray(value.transactions)
    ? value.transactions.map((transaction) => ({
        ...transaction,
        account: transaction.account || accounts[0] || 'Conta',
      }))
    : [...SEED_TRANSACTIONS];

  const baseCards = Array.isArray(value.creditCards) && value.creditCards.length
    ? value.creditCards.map((card) => normalizeCreditCard(card))
    : DEFAULT_CREDIT_CARDS.map((card) => normalizeCreditCard(card));
  const creditCards = enrichCreditCards(baseCards, baseTransactions);

  const transactions = baseTransactions.map((transaction) => normalizeTransaction(transaction, creditCards, activeMember.id));

  // Deduplicate transactions: remove copies with same fingerprint, keeping the oldest
  const deduplicatedTransactions = (() => {
    // First strip any auto-generated recurring projections that were accidentally persisted
    const nonAutoGenerated = transactions.filter((tx) => !tx.autoGenerated);

    const seen = new Map<string, Transaction>();
    for (const tx of nonAutoGenerated) {
      const fingerprint = `${normalizeText(tx.description || '')}_${tx.amount}_${tx.date}_${tx.categoryId || ''}_${tx.type}`;
      const existing = seen.get(fingerprint);
      if (!existing) {
        seen.set(fingerprint, tx);
      } else {
        // Keep the one with the earliest createdAt (original)
        const existingTime = new Date(existing.createdAt || 0).getTime();
        const currentTime = new Date(tx.createdAt || 0).getTime();
        if (currentTime < existingTime) {
          seen.set(fingerprint, tx);
        }
      }
    }
    return Array.from(seen.values());
  })();

  const invoicePayments = Array.isArray(value.invoicePayments)
    ? value.invoicePayments
        .filter((payment): payment is CreditCardInvoicePayment => Boolean(payment && payment.cardId && payment.cycleKey))
        .map((payment) => ({
          ...payment,
          id: payment.id || uuidv4(),
          amount: Math.max(0, Number(payment.amount) || 0),
          paidAt: payment.paidAt || toIsoDate(new Date()),
          createdAt: payment.createdAt || new Date().toISOString(),
        }))
    : [];

  const categoryGoals = Array.isArray(value.categoryGoals)
    ? value.categoryGoals
        .filter((goal): goal is CategoryGoal => Boolean(goal && goal.categoryId))
        .map((goal) => ({
          categoryId: goal.categoryId,
          monthlyLimit: Math.max(0, Number(goal.monthlyLimit) || 0),
          alertThreshold: Math.min(1, Math.max(0.1, Number(goal.alertThreshold) || 0.8)),
        }))
    : [];

  return {
    transactions: deduplicatedTransactions,
    categories,
    accounts,
    creditCards,
    invoicePayments,
    reminderSettings: normalizeReminderSettings(value),
    categoryGoals,
    household,
  };
};

const withStateNormalization = (value: Partial<AppState>): AppState => {
  const normalized = normalizeCoreState(value);
  const recurring = applyRecurringProjection(normalized);
  const activeMember = resolveActiveMember(recurring.household);
  const transactions = recurring.transactions.map((transaction) =>
    normalizeTransaction(transaction, recurring.creditCards, activeMember.id)
  );

  return applySuggestedIcons({
    ...recurring,
    transactions,
  });
};

const getDefaultState = (): AppState => withStateNormalization({
  transactions: [...SEED_TRANSACTIONS],
  categories: DEFAULT_CATEGORIES.map((category) => ({ ...category })),
  accounts: [...DEFAULT_ACCOUNTS],
  creditCards: DEFAULT_CREDIT_CARDS.map((card) => ({ ...card })),
  invoicePayments: [],
  reminderSettings: { ...DEFAULT_REMINDER_SETTINGS },
  categoryGoals: [],
  household: {
    ...DEFAULT_HOUSEHOLD_SETTINGS,
    members: DEFAULT_HOUSEHOLD_SETTINGS.members.map((member) => ({ ...member })),
  },
});

const getInitialState = (): AppState => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return getDefaultState();

  try {
    const parsed = JSON.parse(stored) as unknown;
    if (!isValidState(parsed)) return getDefaultState();
    return withStateNormalization(parsed);
  } catch (error) {
    console.error('Failed to parse stored data', error);
    return getDefaultState();
  }
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AppState>(getInitialState);
  const [remoteHydrated, setRemoteHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const hydrateFromSupabase = async () => {
      const remoteState = await loadRemoteAppState();
      if (cancelled) return;

      if (remoteState) {
        const normalizedRemote = withStateNormalization(remoteState);
        setState((current) => {
          const merged = withStateNormalization(mergeAppStatesOnConflict(current, normalizedRemote));
          const currentSnapshot = JSON.stringify(current);
          const mergedSnapshot = JSON.stringify(merged);
          return currentSnapshot === mergedSnapshot ? current : merged;
        });
      }

      setRemoteHydrated(true);
    };

    void hydrateFromSupabase();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    if (!remoteHydrated) return;

    const timeoutId = window.setTimeout(() => {
      void (async () => {
        const result = await saveRemoteAppState(state);
        if (result !== 'conflict') return;

        const remoteState = await loadRemoteAppState();
        if (!remoteState) return;

        const normalized = withStateNormalization(remoteState);
        setState((current) => {
          const merged = withStateNormalization(mergeAppStatesOnConflict(current, normalized));
          const currentSnapshot = JSON.stringify(current);
          const mergedSnapshot = JSON.stringify(merged);
          return currentSnapshot === mergedSnapshot ? current : merged;
        });
      })();
    }, 400);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [state, remoteHydrated]);

  useEffect(() => {
    void dispatchPendingReminders(state);
  }, [state.transactions, state.reminderSettings, state.categories]);

  const editState = (updater: (prev: AppState) => AppState) => {
    setState((prev) => {
      if (!canEditFromState(prev)) return prev;
      return withStateNormalization(updater(prev));
    });
  };

  const addTransaction = (transaction: Transaction) => {
    editState((prev) => ({
      ...prev,
      transactions: [
        ...prev.transactions,
        {
          ...transaction,
          ownerMemberId: transaction.ownerMemberId || prev.household.activeMemberId,
        },
      ],
    }));
  };

  const addTransactions = (transactions: Transaction[]) => {
    if (!transactions.length) return;
    editState((prev) => ({
      ...prev,
      transactions: [
        ...prev.transactions,
        ...transactions.map((transaction) => ({
          ...transaction,
          ownerMemberId: transaction.ownerMemberId || prev.household.activeMemberId,
        })),
      ],
    }));
  };

  const updateTransaction = (transaction: Transaction) => {
    editState((prev) => ({
      ...prev,
      transactions: prev.transactions.map((item) => (item.id === transaction.id ? transaction : item)),
    }));
  };

  const updateInstallmentGroupFrom = (transactionId: string, template: Transaction) => {
    editState((prev) => {
      const target = prev.transactions.find((transaction) => transaction.id === transactionId);
      if (!target?.installmentGroupId) {
        return {
          ...prev,
          transactions: prev.transactions.map((transaction) => (transaction.id === template.id ? template : transaction)),
        };
      }

      const groupId = target.installmentGroupId;
      const fromInstallment = getInstallmentNumber(target);
      const baseDate = template.date;
      const baseDueDate = template.dueDate || template.date;

      return {
        ...prev,
        transactions: prev.transactions.map((transaction) => {
          if (transaction.installmentGroupId !== groupId) return transaction;
          if (getInstallmentNumber(transaction) < fromInstallment) return transaction;

          const offset = getInstallmentNumber(transaction) - fromInstallment;
          const nextDate = addMonthsToIsoDate(baseDate, offset);
          const nextDueDate = template.status === 'pending' ? addMonthsToIsoDate(baseDueDate, offset) : undefined;

          return {
            ...transaction,
            type: template.type,
            nature: template.nature,
            amount: template.amount,
            date: nextDate,
            categoryId: template.categoryId,
            subcategoryId: template.subcategoryId,
            paymentMethod: template.paymentMethod,
            account: template.account,
            description: template.description,
            tags: [...template.tags],
            recurrence: template.recurrence,
            status: template.status,
            dueDate: nextDueDate,
            creditCardId: template.creditCardId,
            creditCardCycleKey: template.creditCardCycleKey,
          };
        }),
      };
    });
  };

  const settleFutureInstallments = (transactionId: string) => {
    editState((prev) => {
      const target = prev.transactions.find((transaction) => transaction.id === transactionId);
      if (!target?.installmentGroupId) return prev;

      const fromInstallment = getInstallmentNumber(target);
      return {
        ...prev,
        transactions: prev.transactions.map((transaction) => {
          if (transaction.installmentGroupId !== target.installmentGroupId) return transaction;
          if (getInstallmentNumber(transaction) <= fromInstallment) return transaction;
          return { ...transaction, status: 'paid' };
        }),
      };
    });
  };

  const cancelFutureInstallments = (transactionId: string) => {
    editState((prev) => {
      const target = prev.transactions.find((transaction) => transaction.id === transactionId);
      if (!target?.installmentGroupId) return prev;
      const fromInstallment = getInstallmentNumber(target);

      const remaining = prev.transactions
        .filter((transaction) => transaction.installmentGroupId === target.installmentGroupId)
        .filter((transaction) => getInstallmentNumber(transaction) <= fromInstallment);
      const nextCount = remaining.length;

      const keepIds = new Set(remaining.map((transaction) => transaction.id));
      return {
        ...prev,
        transactions: prev.transactions
          .filter((transaction) => transaction.installmentGroupId !== target.installmentGroupId || keepIds.has(transaction.id))
          .map((transaction) => {
            if (transaction.installmentGroupId !== target.installmentGroupId) return transaction;
            return {
              ...transaction,
              installmentCount: nextCount,
            };
          }),
      };
    });
  };

  const renegotiateInstallments = (transactionId: string, futureCount: number, totalAmount: number, firstDueDate?: string) => {
    editState((prev) => {
      const target = prev.transactions.find((transaction) => transaction.id === transactionId);
      if (!target?.installmentGroupId) return prev;

      const safeFutureCount = Math.min(48, Math.max(1, Math.floor(Number(futureCount) || 1)));
      const safeTotalAmount = Math.max(0, Number(totalAmount) || 0);
      const groupId = target.installmentGroupId;
      const currentInstallment = getInstallmentNumber(target);
      const nextInstallmentCount = currentInstallment + safeFutureCount;
      const firstDate = firstDueDate || addMonthsToIsoDate(target.date, 1);
      const distributed = splitAmountEvenly(safeTotalAmount, safeFutureCount);

      const withoutFuture = prev.transactions
        .filter((transaction) => transaction.installmentGroupId !== groupId || getInstallmentNumber(transaction) <= currentInstallment)
        .map((transaction) => {
          if (transaction.installmentGroupId !== groupId) return transaction;
          return { ...transaction, installmentCount: nextInstallmentCount };
        });

      const newFuture = distributed.map((amount, index) => {
        const installmentNumber = currentInstallment + index + 1;
        const date = addMonthsToIsoDate(firstDate, index);
        return {
          ...target,
          id: uuidv4(),
          amount,
          date,
          dueDate: date,
          status: 'pending',
          createdAt: new Date().toISOString(),
          installmentNumber,
          installmentCount: nextInstallmentCount,
          recurrence: 'none',
          autoGenerated: false,
        } satisfies Transaction;
      });

      return {
        ...prev,
        transactions: [...withoutFuture, ...newFuture],
      };
    });
  };

  const markTransactionsPaid = (ids: string[]) => {
    if (!ids.length) return;
    const set = new Set(ids);
    editState((prev) => ({
      ...prev,
      transactions: prev.transactions.map((transaction) => (set.has(transaction.id) ? { ...transaction, status: 'paid' } : transaction)),
    }));
  };

  const deleteTransaction = (id: string) => {
    editState((prev) => ({
      ...prev,
      transactions: prev.transactions.filter((transaction) => transaction.id !== id),
    }));
  };

  const addCategory = (category: Category) => {
    const categoryWithIcon = {
      ...category,
      icon: category.icon || suggestCategoryIcon(category.name, category.type),
    };
    editState((prev) => ({ ...prev, categories: [...prev.categories, categoryWithIcon] }));
  };

  const updateCategory = (category: Category) => {
    editState((prev) => ({
      ...prev,
      categories: prev.categories.map((item) => (item.id === category.id ? category : item)),
    }));
  };

  const deleteCategory = (id: string) => {
    editState((prev) => ({
      ...prev,
      categories: prev.categories.filter((item) => item.id !== id),
      categoryGoals: prev.categoryGoals.filter((goal) => goal.categoryId !== id),
    }));
  };

  const addAccount = (account: string) => {
    editState((prev) => (prev.accounts.includes(account) ? prev : { ...prev, accounts: [...prev.accounts, account] }));
  };

  const setCategoryGoal = (goal: CategoryGoal) => {
    const safeGoal: CategoryGoal = {
      categoryId: goal.categoryId,
      monthlyLimit: Math.max(0, Number(goal.monthlyLimit) || 0),
      alertThreshold: Math.min(1, Math.max(0.1, Number(goal.alertThreshold) || 0.8)),
    };

    editState((prev) => {
      const exists = prev.categoryGoals.some((item) => item.categoryId === safeGoal.categoryId);
      return {
        ...prev,
        categoryGoals: exists
          ? prev.categoryGoals.map((item) => (item.categoryId === safeGoal.categoryId ? safeGoal : item))
          : [...prev.categoryGoals, safeGoal],
      };
    });
  };

  const clearCategoryGoal = (categoryId: string) => {
    editState((prev) => ({
      ...prev,
      categoryGoals: prev.categoryGoals.filter((goal) => goal.categoryId !== categoryId),
    }));
  };

  const addCreditCard = (card: Omit<CreditCard, 'id' | 'createdAt'>) => {
    const baseId = buildDeterministicCardId(card.account || card.name);
    editState((prev) => {
      const hasCollision = prev.creditCards.some((item) => item.id === baseId);
      const id = hasCollision ? `${baseId}_${Date.now()}` : baseId;
      const next: CreditCard = normalizeCreditCard({
        ...card,
        id,
        createdAt: new Date().toISOString(),
      });
      return {
        ...prev,
        creditCards: [...prev.creditCards, next],
      };
    });
  };

  const updateCreditCard = (card: CreditCard) => {
    editState((prev) => ({
      ...prev,
      creditCards: prev.creditCards.map((item) => (item.id === card.id ? normalizeCreditCard(card) : item)),
    }));
  };

  const deleteCreditCard = (id: string) => {
    editState((prev) => {
      const remaining = prev.creditCards.filter((card) => card.id !== id);
      return {
        ...prev,
        creditCards: remaining,
        invoicePayments: prev.invoicePayments.filter((payment) => payment.cardId !== id),
      };
    });
  };

  const payCreditCardInvoice = (cardId: string, cycleKey: string, amount: number, paidAt: string) => {
    editState((prev) => {
      const card = prev.creditCards.find((candidate) => candidate.id === cardId);
      if (!card) return prev;

      const pendingInvoiceTransactions = prev.transactions.filter((transaction) => (
        transaction.type === 'expense' &&
        transaction.paymentMethod === 'credito' &&
        transaction.creditCardId === cardId &&
        transaction.creditCardCycleKey === cycleKey &&
        transaction.status === 'pending'
      ));

      if (!pendingInvoiceTransactions.length) return prev;

      const invoiceTotal = roundCurrency(
        pendingInvoiceTransactions.reduce((sum, transaction) => sum + transaction.amount, 0)
      );
      const alreadyPaid = roundCurrency(
        prev.invoicePayments
          .filter((payment) => payment.cardId === cardId && payment.cycleKey === cycleKey)
          .reduce((sum, payment) => sum + payment.amount, 0)
      );
      const remainingBefore = Math.max(0, roundCurrency(invoiceTotal - alreadyPaid));
      const appliedAmount = Math.min(Math.max(0, roundCurrency(amount)), remainingBefore);
      if (appliedAmount <= 0) return prev;

      const nextPayments: CreditCardInvoicePayment[] = [
        ...prev.invoicePayments,
        {
          id: uuidv4(),
          cardId,
          cycleKey,
          amount: appliedAmount,
          paidAt,
          createdAt: new Date().toISOString(),
        },
      ];

      let nextTransactions = [...prev.transactions];
      let nextCategories = [...prev.categories];
      const remainingAfter = Math.max(0, roundCurrency(remainingBefore - appliedAmount));

      if (remainingAfter <= 0) {
        const ids = new Set(pendingInvoiceTransactions.map((transaction) => transaction.id));
        nextTransactions = nextTransactions.map((transaction) =>
          ids.has(transaction.id) ? { ...transaction, status: 'paid' } : transaction
        );
      } else if (card.interestRateMonthly > 0) {
        const nextCycleKey = addMonthsToCycleKey(cycleKey, 1);
        const hasInterest = nextTransactions.some((transaction) => (
          transaction.isCreditCardInterest &&
          transaction.creditCardId === cardId &&
          transaction.creditCardCycleKey === nextCycleKey
        ));

        if (!hasInterest) {
          let interestCategory = nextCategories.find((category) => category.id === 'cat_juros_cartao');
          if (!interestCategory) {
            interestCategory = {
              id: 'cat_juros_cartao',
              name: 'Juros Cartao',
              type: 'expense',
              icon: 'Landmark',
              color: '#b91c1c',
            };
            nextCategories = [...nextCategories, interestCategory];
          }

          const interestAmount = roundCurrency(remainingAfter * (card.interestRateMonthly / 100));
          if (interestAmount > 0) {
            const dueDate = getCycleDueDate(nextCycleKey, card.dueDay);
            nextTransactions = [
              ...nextTransactions,
              {
                id: uuidv4(),
                type: 'expense',
                nature: 'fixed',
                amount: interestAmount,
                date: dueDate,
                categoryId: interestCategory.id,
                paymentMethod: 'credito',
                account: card.account,
                description: `Juros rotativo ${card.name}`,
                tags: ['juros', 'cartao'],
                recurrence: 'none',
                status: 'pending',
                createdAt: new Date().toISOString(),
                dueDate,
                installmentCount: 1,
                installmentNumber: undefined,
                installmentGroupId: undefined,
                creditCardId: card.id,
                creditCardCycleKey: nextCycleKey,
                isCreditCardInterest: true,
                ownerMemberId: prev.household.activeMemberId,
              },
            ];
          }
        }
      }

      return {
        ...prev,
        transactions: nextTransactions,
        categories: nextCategories,
        invoicePayments: nextPayments,
      };
    });
  };

  const updateReminderSettings = (settings: Partial<ReminderSettings>) => {
    setState((prev) => withStateNormalization({
      ...prev,
      reminderSettings: {
        ...prev.reminderSettings,
        ...settings,
      },
    }));
  };

  const setHouseholdEnabled = (enabled: boolean) => {
    setState((prev) => withStateNormalization({
      ...prev,
      household: {
        ...prev.household,
        enabled,
      },
    }));
  };

  const setActiveMember = (memberId: string) => {
    setState((prev) => {
      if (!prev.household.members.some((member) => member.id === memberId)) return prev;
      return withStateNormalization({
        ...prev,
        household: {
          ...prev.household,
          activeMemberId: memberId,
        },
      });
    });
  };

  const addHouseholdMember = (name: string, role: HouseholdMember['role']) => {
    editState((prev) => ({
      ...prev,
      household: {
        ...prev.household,
        members: [
          ...prev.household.members,
          {
            id: uuidv4(),
            name: name.trim() || 'Pessoa',
            role: role === 'owner' || role === 'editor' || role === 'viewer' ? role : 'editor',
          },
        ],
      },
    }));
  };

  const updateHouseholdMember = (member: HouseholdMember) => {
    editState((prev) => ({
      ...prev,
      household: {
        ...prev.household,
        members: prev.household.members.map((item) => (item.id === member.id ? member : item)),
      },
    }));
  };

  const deleteHouseholdMember = (memberId: string) => {
    editState((prev) => {
      const remaining = prev.household.members.filter((member) => member.id !== memberId);
      if (!remaining.length) return prev;
      const activeMemberId = remaining.some((member) => member.id === prev.household.activeMemberId)
        ? prev.household.activeMemberId
        : remaining[0].id;

      return {
        ...prev,
        household: {
          ...prev.household,
          members: remaining,
          activeMemberId,
        },
      };
    });
  };

  const replaceState = (next: AppState) => {
    setState(withStateNormalization(next));
  };

  const resetData = () => {
    setState(getDefaultState());
  };

  const activeMember = useMemo(() => resolveActiveMember(state.household), [state.household]);
  const canEdit = useMemo(() => canEditFromState(state), [state]);

  return (
    <AppContext.Provider
      value={{
        ...state,
        activeMember,
        canEdit,
        addTransaction,
        addTransactions,
        updateTransaction,
        updateInstallmentGroupFrom,
        settleFutureInstallments,
        cancelFutureInstallments,
        renegotiateInstallments,
        markTransactionsPaid,
        deleteTransaction,
        addCategory,
        updateCategory,
        deleteCategory,
        addAccount,
        setCategoryGoal,
        clearCategoryGoal,
        addCreditCard,
        updateCreditCard,
        deleteCreditCard,
        payCreditCardInvoice,
        updateReminderSettings,
        setHouseholdEnabled,
        setActiveMember,
        addHouseholdMember,
        updateHouseholdMember,
        deleteHouseholdMember,
        replaceState,
        resetData,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useAppStore = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppStore must be used within an AppProvider');
  }
  return context;
};
