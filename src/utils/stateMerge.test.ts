import { describe, expect, it } from 'vitest';
import { AppState } from '../types';
import { mergeAppStatesOnConflict } from './stateMerge';

const buildState = (overrides?: Partial<AppState>): AppState => ({
  transactions: [],
  categories: [
    { id: 'cat_expense', name: 'Despesa', type: 'expense', icon: 'ShoppingBag', color: '#2563eb' },
  ],
  accounts: ['Conta Local'],
  creditCards: [],
  invoicePayments: [],
  reminderSettings: {
    enabled: false,
    daysBefore: 1,
    includeOverdue: true,
  },
  categoryGoals: [],
  household: {
    enabled: false,
    activeMemberId: 'member_local',
    members: [{ id: 'member_local', name: 'Local', role: 'owner' }],
  },
  ...overrides,
});

describe('mergeAppStatesOnConflict', () => {
  it('mantem transacoes de ambos os lados e prioriza versao local por id', () => {
    const remote = buildState({
      transactions: [
        {
          id: 'tx_1',
          type: 'expense',
          nature: 'variable',
          amount: 10,
          date: '2026-03-01',
          categoryId: 'cat_expense',
          paymentMethod: 'pix',
          account: 'Conta Remota',
          tags: [],
          recurrence: 'none',
          status: 'paid',
          createdAt: '2026-03-01T10:00:00.000Z',
        },
      ],
      accounts: ['Conta Remota'],
      household: {
        enabled: false,
        activeMemberId: 'member_remote',
        members: [{ id: 'member_remote', name: 'Remoto', role: 'owner' }],
      },
    });

    const local = buildState({
      transactions: [
        {
          id: 'tx_1',
          type: 'expense',
          nature: 'variable',
          amount: 20,
          date: '2026-03-01',
          categoryId: 'cat_expense',
          paymentMethod: 'pix',
          account: 'Conta Local',
          tags: [],
          recurrence: 'none',
          status: 'paid',
          createdAt: '2026-03-01T10:00:00.000Z',
        },
        {
          id: 'tx_2',
          type: 'expense',
          nature: 'variable',
          amount: 30,
          date: '2026-03-02',
          categoryId: 'cat_expense',
          paymentMethod: 'pix',
          account: 'Conta Local',
          tags: [],
          recurrence: 'none',
          status: 'paid',
          createdAt: '2026-03-02T10:00:00.000Z',
        },
      ],
    });

    const merged = mergeAppStatesOnConflict(local, remote);

    expect(merged.transactions).toHaveLength(2);
    expect(merged.transactions.find((item) => item.id === 'tx_1')?.amount).toBe(20);
    expect(merged.transactions.find((item) => item.id === 'tx_2')?.amount).toBe(30);
    expect(merged.accounts).toEqual(expect.arrayContaining(['Conta Local', 'Conta Remota']));
    expect(merged.household.members).toHaveLength(2);
  });
});
