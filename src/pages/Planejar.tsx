import React, { useMemo, useState } from 'react';
import { useAppStore } from '../store';
import { Target, Heart, TrendingUp, Shield, ChevronDown, ChevronUp } from 'lucide-react';
import { Transaction } from '../types';

type FocusProfile = 'bem-estar' | 'economizar' | 'moderado' | 'investimento';
type BudgetBucket = 'essenciais' | 'estiloVida' | 'investimentos';

type BucketCategorySummary = {
  categoryId: string;
  name: string;
  amount: number;
  count: number;
};

type BucketTransaction = Transaction & { categoryName: string };

const ESSENCIAIS_IDS = ['cat_moradia', 'cat_alimentacao', 'cat_transporte', 'cat_saude', 'cat_contas', 'cat_educacao', 'cat_impostos'];

const getBucketByCategoryId = (categoryId: string): BudgetBucket => {
  if (ESSENCIAIS_IDS.includes(categoryId)) return 'essenciais';
  if (categoryId === 'cat_investimentos') return 'investimentos';
  return 'estiloVida';
};

export const Planejar: React.FC = () => {
  const { transactions, categories } = useAppStore();
  const [focus, setFocus] = useState<FocusProfile>('moderado');
  const [openBucket, setOpenBucket] = useState<BudgetBucket | null>(null);

  const totalIncome = useMemo(() => {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    return transactions
      .filter((transaction) => transaction.type === 'income')
      .filter((transaction) => {
        const date = new Date(transaction.date);
        return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
      })
      .reduce((acc, transaction) => acc + transaction.amount, 0);
  }, [transactions]);

  const monthlyExpenses = useMemo(() => {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    return transactions
      .filter((transaction) => transaction.type === 'expense')
      .filter((transaction) => {
        const date = new Date(transaction.date);
        return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
      });
  }, [transactions]);

  const bucketBreakdown = useMemo(() => {
    const result: Record<BudgetBucket, { total: number; categories: BucketCategorySummary[]; transactions: BucketTransaction[] }> = {
      essenciais: { total: 0, categories: [], transactions: [] },
      estiloVida: { total: 0, categories: [], transactions: [] },
      investimentos: { total: 0, categories: [], transactions: [] },
    };

    const categoryAccumulator: Record<BudgetBucket, Record<string, BucketCategorySummary>> = {
      essenciais: {},
      estiloVida: {},
      investimentos: {},
    };

    monthlyExpenses.forEach((transaction) => {
      const bucket = getBucketByCategoryId(transaction.categoryId);
      const categoryName = categories.find((category) => category.id === transaction.categoryId)?.name || 'Outros';

      result[bucket].total += transaction.amount;
      result[bucket].transactions.push({ ...transaction, categoryName });

      if (!categoryAccumulator[bucket][transaction.categoryId]) {
        categoryAccumulator[bucket][transaction.categoryId] = {
          categoryId: transaction.categoryId,
          name: categoryName,
          amount: 0,
          count: 0,
        };
      }

      categoryAccumulator[bucket][transaction.categoryId].amount += transaction.amount;
      categoryAccumulator[bucket][transaction.categoryId].count += 1;
    });

    (Object.keys(result) as BudgetBucket[]).forEach((bucket) => {
      result[bucket].categories = Object.values(categoryAccumulator[bucket]).sort((a, b) => b.amount - a.amount);
      result[bucket].transactions = result[bucket].transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    });

    return result;
  }, [monthlyExpenses, categories]);

  const actualExpenses = useMemo(
    () => ({
      essenciais: bucketBreakdown.essenciais.total,
      estiloVida: bucketBreakdown.estiloVida.total,
      investimentos: bucketBreakdown.investimentos.total,
    }),
    [bucketBreakdown]
  );

  const profiles = {
    moderado: {
      label: 'Moderado',
      icon: Shield,
      desc: 'Equilibrio entre viver o agora e guardar para o futuro.',
      rules: { essenciais: 0.5, estiloVida: 0.3, investimentos: 0.2 },
    },
    economizar: {
      label: 'Economizar',
      icon: Target,
      desc: 'Foco em cortar gastos e guardar o maximo possivel.',
      rules: { essenciais: 0.5, estiloVida: 0.2, investimentos: 0.3 },
    },
    investimento: {
      label: 'Investidor',
      icon: TrendingUp,
      desc: 'Agressivo nos investimentos para multiplicar patrimonio.',
      rules: { essenciais: 0.4, estiloVida: 0.2, investimentos: 0.4 },
    },
    'bem-estar': {
      label: 'Bem-estar',
      icon: Heart,
      desc: 'Prioriza conforto, lazer e experiencias hoje.',
      rules: { essenciais: 0.5, estiloVida: 0.4, investimentos: 0.1 },
    },
  };

  const currentProfile = profiles[focus];
  const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const renderBar = (bucket: BudgetBucket, label: string, actual: number, targetPercent: number, color: string) => {
    const targetAmount = totalIncome * targetPercent;
    const isOver = actual > targetAmount;
    const percentUsed = targetAmount > 0 ? Math.min((actual / targetAmount) * 100, 100) : 0;
    const isOpen = openBucket === bucket;
    const details = bucketBreakdown[bucket];

    return (
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800 mb-4 transition-colors">
        <button
          onClick={() => setOpenBucket((prev) => (prev === bucket ? null : bucket))}
          className="w-full text-left"
        >
          <div className="flex justify-between items-end mb-2">
            <div>
              <h4 className="font-semibold text-gray-800 dark:text-gray-100">{label}</h4>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Meta: {formatCurrency(targetAmount)} ({(targetPercent * 100).toFixed(0)}%)
              </p>
            </div>
            <div className="text-right">
              <span className={`font-bold ${isOver ? 'text-rose-600 dark:text-rose-400' : 'text-gray-900 dark:text-gray-100'}`}>{formatCurrency(actual)}</span>
              <p className="text-xs text-gray-500 dark:text-gray-400">Gasto Atual</p>
            </div>
          </div>

          <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-3 relative overflow-hidden">
            <div className={`h-3 rounded-full transition-all duration-500 ${isOver ? 'bg-rose-500' : color}`} style={{ width: `${percentUsed}%` }}></div>
          </div>

          <div className="mt-2 flex items-center justify-between">
            {isOver ? (
              <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">Voce ultrapassou a meta em {formatCurrency(actual - targetAmount)}.</p>
            ) : targetAmount > 0 ? (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Voce ainda pode gastar {formatCurrency(targetAmount - actual)}.</p>
            ) : (
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Sem renda no mes para calcular meta.</p>
            )}

            <span className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold inline-flex items-center">
              Ver detalhes
              {isOpen ? <ChevronUp size={14} className="ml-1" /> : <ChevronDown size={14} className="ml-1" />}
            </span>
          </div>
        </button>

        {isOpen && (
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 space-y-3">
            <div>
              <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Categorias Aplicadas</p>
              {details.categories.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">Nenhum gasto nesse grupo no mes atual.</p>
              ) : (
                <div className="space-y-2">
                  {details.categories.map((item) => (
                    <div key={`${bucket}-${item.categoryId}`} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700 dark:text-gray-300">
                        {item.name} <span className="text-gray-400 dark:text-gray-500">({item.count}x)</span>
                      </span>
                      <span className="font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(item.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {details.transactions.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Lancamentos (mais recentes)</p>
                <div className="space-y-2">
                  {details.transactions.slice(0, 6).map((transaction) => (
                    <div key={transaction.id} className="flex items-center justify-between text-sm">
                      <div className="min-w-0 pr-3">
                        <p className="text-gray-800 dark:text-gray-200 truncate">{transaction.description || transaction.categoryName}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {transaction.categoryName} - {new Date(transaction.date).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                      <span className="font-semibold text-gray-900 dark:text-gray-100 shrink-0">{formatCurrency(transaction.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-4 space-y-6 pb-24 dark:bg-black min-h-screen">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Mundo Perfeito</h2>
      </div>

      <div className="bg-indigo-600 rounded-2xl p-5 text-white shadow-lg">
        <p className="text-indigo-200 text-sm mb-1">Sua Renda Total (Mes)</p>
        <div className="text-3xl font-bold">{formatCurrency(totalIncome)}</div>
        <p className="text-xs text-indigo-200 mt-2">Baseado nas suas receitas recebidas e a receber deste mes.</p>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Escolha seu Foco</h3>
        <div className="grid grid-cols-2 gap-3">
          {(Object.keys(profiles) as FocusProfile[]).map((key) => {
            const profile = profiles[key];
            const Icon = profile.icon;
            const isActive = focus === key;

            return (
              <button
                key={key}
                onClick={() => setFocus(key)}
                className={`p-3 rounded-xl border text-left transition-all ${
                  isActive ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-500 ring-1 ring-indigo-500' : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 hover:border-indigo-300 dark:hover:border-indigo-700'
                }`}
              >
                <Icon size={20} className={`mb-2 ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400 dark:text-gray-500'}`} />
                <h4 className={`font-semibold text-sm ${isActive ? 'text-indigo-900 dark:text-gray-100' : 'text-gray-700 dark:text-gray-300'}`}>{profile.label}</h4>
              </button>
            );
          })}
        </div>

        <p className="text-sm text-gray-600 dark:text-gray-400 mt-3 bg-white dark:bg-gray-900 p-3 rounded-lg border border-gray-100 dark:border-gray-800 shadow-sm transition-colors">
          <strong className="dark:text-gray-200">{currentProfile.label}:</strong> {currentProfile.desc}
        </p>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Seu Orcamento Ideal</h3>
        {renderBar('essenciais', 'Gastos Essenciais', actualExpenses.essenciais, currentProfile.rules.essenciais, 'bg-indigo-500')}
        {renderBar('estiloVida', 'Estilo de Vida & Desejos', actualExpenses.estiloVida, currentProfile.rules.estiloVida, 'bg-amber-500')}
        {renderBar('investimentos', 'Investimentos & Poupanca', actualExpenses.investimentos, currentProfile.rules.investimentos, 'bg-emerald-500')}
      </div>
    </div>
  );
};
