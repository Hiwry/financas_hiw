import {
  Category,
  CreditCard,
  HouseholdSettings,
  ReminderSettings,
  Transaction,
} from './types';

export const DEFAULT_CATEGORIES: Category[] = [
  // Expenses
  { id: 'cat_moradia', name: 'Moradia', type: 'expense', icon: 'Home', color: '#3b82f6' },
  { id: 'cat_alimentacao', name: 'Alimentacao', type: 'expense', icon: 'Utensils', color: '#f59e0b' },
  { id: 'cat_transporte', name: 'Transporte', type: 'expense', icon: 'Car', color: '#10b981' },
  { id: 'cat_saude', name: 'Saude', type: 'expense', icon: 'HeartPulse', color: '#ef4444' },
  { id: 'cat_lazer', name: 'Lazer', type: 'expense', icon: 'Gamepad2', color: '#8b5cf6' },
  { id: 'cat_contas', name: 'Contas', type: 'expense', icon: 'FileText', color: '#64748b' },
  { id: 'cat_assinaturas', name: 'Assinaturas', type: 'expense', icon: 'MonitorPlay', color: '#ec4899' },
  { id: 'cat_educacao', name: 'Educacao', type: 'expense', icon: 'GraduationCap', color: '#f97316' },
  { id: 'cat_impostos', name: 'Impostos', type: 'expense', icon: 'Landmark', color: '#78716c' },
  { id: 'cat_compras', name: 'Compras', type: 'expense', icon: 'ShoppingBag', color: '#06b6d4' },
  { id: 'cat_presentes', name: 'Presentes', type: 'expense', icon: 'Gift', color: '#f43f5e' },
  { id: 'cat_juros_cartao', name: 'Juros Cartao', type: 'expense', icon: 'Landmark', color: '#b91c1c' },
  { id: 'cat_outros_desp', name: 'Outros', type: 'expense', icon: 'MoreHorizontal', color: '#94a3b8' },

  // Incomes
  { id: 'cat_salario', name: 'Salario', type: 'income', icon: 'Briefcase', color: '#22c55e' },
  { id: 'cat_freelance', name: 'Freelance', type: 'income', icon: 'Laptop', color: '#0ea5e9' },
  { id: 'cat_investimentos', name: 'Investimentos', type: 'income', icon: 'TrendingUp', color: '#84cc16' },
  { id: 'cat_reembolsos', name: 'Reembolsos', type: 'income', icon: 'RefreshCcw', color: '#14b8a6' },
  { id: 'cat_outros_rec', name: 'Outros', type: 'income', icon: 'MoreHorizontal', color: '#94a3b8' },
];

export const DEFAULT_ACCOUNTS = ['Nubank', 'Itau', 'Dinheiro', 'Carteira', 'Inter'];

export const DEFAULT_CREDIT_CARDS: CreditCard[] = [
  {
    id: 'card_nubank',
    name: 'Nubank',
    account: 'Nubank',
    closingDay: 8,
    dueDay: 15,
    limit: 2500,
    interestRateMonthly: 12.9,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'card_itau',
    name: 'Itau',
    account: 'Itau',
    closingDay: 5,
    dueDay: 12,
    limit: 3500,
    interestRateMonthly: 11.5,
    createdAt: new Date().toISOString(),
  },
];

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  enabled: false,
  daysBefore: 1,
  includeOverdue: true,
};

export const DEFAULT_HOUSEHOLD_SETTINGS: HouseholdSettings = {
  enabled: false,
  activeMemberId: 'member_me',
  members: [
    {
      id: 'member_me',
      name: 'Eu',
      role: 'owner',
      color: '#4f46e5',
    },
  ],
};

export const SEED_TRANSACTIONS: Transaction[] = [];
