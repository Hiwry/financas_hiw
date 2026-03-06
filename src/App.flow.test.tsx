import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

const STORAGE_KEY = 'meu_controle_data_v3';

const buildInitialState = () => ({
  transactions: [],
  categories: [
    {
      id: 'cat_expense_test',
      name: 'Teste Despesa',
      type: 'expense',
      icon: 'ShoppingBag',
      color: '#2563eb',
    },
    {
      id: 'cat_income_test',
      name: 'Teste Receita',
      type: 'income',
      icon: 'TrendingUp',
      color: '#22c55e',
    },
  ],
  accounts: ['Conta Teste'],
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
    activeMemberId: 'member_me',
    members: [{ id: 'member_me', name: 'Eu', role: 'owner' }],
  },
});

describe('Fluxo Adicionar -> Resumo', () => {
  it('salva um lancamento e atualiza os totais da pagina inicial', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(buildInitialState()));
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Adicionar' }));
    expect(screen.getByRole('heading', { name: 'Novo Lancamento' })).toBeInTheDocument();

    const amountInput = screen.getByPlaceholderText('0,00');
    await user.clear(amountInput);
    await user.type(amountInput, '50');
    await user.click(screen.getByRole('button', { name: 'Salvar Lancamento' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Resumo' })).toBeInTheDocument();
    });

    const expenseLabel = screen.getByText('Despesas');
    const expenseCard = expenseLabel.closest('div')?.parentElement;
    expect(expenseCard).toBeInTheDocument();
    expect(expenseCard).toHaveTextContent(/50,00/);
  });
});
