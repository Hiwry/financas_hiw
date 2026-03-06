import React, { useMemo, useState } from 'react';
import { useAppStore } from '../store';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';
import { format, parseISO, startOfMonth, endOfMonth, isWithinInterval, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ArrowUpCircle, ArrowDownCircle, Wallet, Calendar, PieChart as PieChartIcon, TrendingUp, Clock } from 'lucide-react';

export const Resumo: React.FC = () => {
  const { transactions, categories, categoryGoals } = useAppStore();
  const [filter, setFilter] = useState<'hoje' | '7dias' | 'mes' | 'custom'>('mes');
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));

  const filteredTransactions = useMemo(() => {
    const today = new Date();
    let start, end;

    if (filter === 'hoje') {
      start = new Date(today.setHours(0, 0, 0, 0));
      end = new Date(today.setHours(23, 59, 59, 999));
    } else if (filter === '7dias') {
      start = subDays(today, 7);
      end = today;
    } else if (filter === 'mes') {
      start = startOfMonth(today);
      end = endOfMonth(today);
    } else {
      start = startDate ? parseISO(startDate) : new Date(0);
      end = endDate ? parseISO(endDate) : new Date();
      end = new Date(end.setHours(23, 59, 59, 999));
    }

    return transactions.filter(t => {
      const tDate = parseISO(t.date);
      return isWithinInterval(tDate, { start, end });
    });
  }, [transactions, filter, startDate, endDate]);

  const { income, expense, balance, fixedExpense, variableExpense, incomePending, expensePending } = useMemo(() => {
    let inc = 0, exp = 0, fExp = 0, vExp = 0, incPend = 0, expPend = 0;
    filteredTransactions.forEach(t => {
      if (t.type === 'income') {
        if (t.status === 'paid') inc += t.amount;
        else incPend += t.amount;
      } else {
        if (t.status === 'paid') {
          exp += t.amount;
          if (t.nature === 'fixed') fExp += t.amount;
          else vExp += t.amount;
        } else {
          expPend += t.amount;
        }
      }
    });
    return { income: inc, expense: exp, balance: inc - exp, fixedExpense: fExp, variableExpense: vExp, incomePending: incPend, expensePending: expPend };
  }, [filteredTransactions]);

  const expensesByCategory = useMemo(() => {
    const expenses = filteredTransactions.filter(t => t.type === 'expense');
    const grouped = expenses.reduce((acc, t) => {
      acc[t.categoryId] = (acc[t.categoryId] || 0) + t.amount;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(grouped)
      .map(([id, amount]) => {
        const cat = categories.find(c => c.id === id);
        return {
          name: cat?.name || 'Outros',
          value: amount,
          color: cat?.color || '#cbd5e1'
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [filteredTransactions, categories]);

  const categoryGoalAlerts = useMemo(() => {
    if (!categoryGoals.length) return [];

    const monthStart = startOfMonth(new Date());
    const monthEnd = endOfMonth(new Date());
    const spentByCategory: Record<string, number> = {};

    transactions
      .filter((transaction) => transaction.type === 'expense')
      .filter((transaction) => {
        const date = parseISO(transaction.date);
        return isWithinInterval(date, { start: monthStart, end: monthEnd });
      })
      .forEach((transaction) => {
        spentByCategory[transaction.categoryId] = (spentByCategory[transaction.categoryId] || 0) + transaction.amount;
      });

    return categoryGoals
      .map((goal) => {
        const spent = spentByCategory[goal.categoryId] || 0;
        const progress = goal.monthlyLimit > 0 ? spent / goal.monthlyLimit : 0;
        const category = categories.find((item) => item.id === goal.categoryId);
        return {
          categoryId: goal.categoryId,
          categoryName: category?.name || 'Categoria',
          spent,
          monthlyLimit: goal.monthlyLimit,
          progress,
          isCritical: progress >= 1,
          isWarning: progress >= goal.alertThreshold,
        };
      })
      .filter((item) => item.isWarning)
      .sort((a, b) => b.progress - a.progress);
  }, [transactions, categories, categoryGoals]);

  const balanceEvolution = useMemo(() => {
    const dailyNet: Record<string, number> = {};
    
    if (filteredTransactions.length > 0) {
      const today = new Date();
      let start, end;
      if (filter === 'hoje') {
        start = new Date(today.setHours(0, 0, 0, 0));
        end = new Date(today.setHours(23, 59, 59, 999));
      } else if (filter === '7dias') {
        start = subDays(today, 7);
        end = today;
      } else if (filter === 'mes') {
        start = startOfMonth(today);
        end = endOfMonth(today);
      } else {
        start = startDate ? parseISO(startDate) : new Date();
        end = endDate ? parseISO(endDate) : new Date();
      }

      let current = new Date(start);
      while (current <= end) {
        const dateStr = format(current, 'yyyy-MM-dd');
        dailyNet[dateStr] = 0;
        current.setDate(current.getDate() + 1);
      }
    }

    filteredTransactions.forEach(t => {
      if (t.status === 'paid') {
        const dateStr = t.date;
        if (dailyNet[dateStr] !== undefined) {
          dailyNet[dateStr] += t.type === 'income' ? t.amount : -t.amount;
        } else {
          dailyNet[dateStr] = t.type === 'income' ? t.amount : -t.amount;
        }
      }
    });

    const sortedDates = Object.keys(dailyNet).sort();
    
    let cumulative = 0;
    return sortedDates.map(date => {
      cumulative += dailyNet[date];
      return {
        date: format(parseISO(date), 'dd/MM'),
        saldo: cumulative
      };
    });
  }, [filteredTransactions, filter, startDate, endDate]);

  const formatCurrency = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  return (
    <div className="p-4 space-y-6 pb-24">
      {/* Header & Filters */}
      <div className="flex flex-col space-y-3">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Resumo</h2>
          <div className="flex space-x-1 bg-gray-200 dark:bg-gray-800 p-1 rounded-lg overflow-x-auto hide-scrollbar w-full sm:w-auto">
            {['hoje', '7dias', 'mes', 'custom'].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f as any)}
                className={`flex-1 sm:flex-none px-3 py-1.5 text-sm rounded-md font-medium transition-colors whitespace-nowrap text-center ${filter === f ? 'bg-white dark:bg-gray-700 shadow text-indigo-600 dark:text-indigo-400' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}
              >
                {f === 'hoje' ? 'Hoje' : f === '7dias' ? '7 Dias' : f === 'mes' ? 'Mês' : 'Custom'}
              </button>
            ))}
          </div>
        </div>
        
        {filter === 'custom' && (
          <div className="flex space-x-2 items-center bg-white dark:bg-gray-900 p-2 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 animate-in slide-in-from-top-2 duration-200">
            <input 
              type="date" 
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="flex-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-gray-100"
            />
            <span className="text-gray-400 text-sm">até</span>
            <input 
              type="date" 
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="flex-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-gray-100"
            />
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4">
        <div className="bg-indigo-600 rounded-2xl p-5 text-white shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-white opacity-10 rounded-full blur-2xl"></div>
          <div className="flex items-center space-x-2 mb-2">
            <Wallet size={20} className="text-indigo-200" />
            <span className="text-indigo-100 font-medium">Saldo Atual (Realizado)</span>
          </div>
          <div className="text-4xl font-bold tracking-tight">{formatCurrency(balance)}</div>
          {(incomePending > 0 || expensePending > 0) && (
            <div className="mt-4 pt-4 border-t border-indigo-500/50 flex justify-between text-sm">
              <div className="text-indigo-100">
                <span className="block text-xs opacity-80">A Receber</span>
                <span className="font-semibold text-emerald-300">+{formatCurrency(incomePending)}</span>
              </div>
              <div className="text-indigo-100 text-right">
                <span className="block text-xs opacity-80">A Pagar</span>
                <span className="font-semibold text-rose-300">-{formatCurrency(expensePending)}</span>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col justify-between">
            <div className="flex items-center space-x-2 text-emerald-600 dark:text-emerald-500 mb-2">
              <ArrowUpCircle size={18} />
              <span className="text-sm font-semibold">Receitas</span>
            </div>
            <div className="text-xl font-bold text-gray-800 dark:text-gray-100">{formatCurrency(income)}</div>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col justify-between">
            <div className="flex items-center space-x-2 text-rose-600 dark:text-rose-500 mb-2">
              <ArrowDownCircle size={18} />
              <span className="text-sm font-semibold">Despesas</span>
            </div>
            <div className="text-xl font-bold text-gray-800 dark:text-gray-100">{formatCurrency(expense)}</div>
          </div>
        </div>
      </div>

      {/* Pending Summary Card */}
      {(incomePending > 0 || expensePending > 0) && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-800">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center">
            <Clock size={18} className="mr-2 text-indigo-500 dark:text-indigo-400" />
            Lançamentos Pendentes
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-4 border border-emerald-100 dark:border-emerald-800/50 flex flex-col justify-between">
              <div className="flex items-center space-x-2 text-emerald-600 dark:text-emerald-400 mb-2">
                <ArrowUpCircle size={16} />
                <span className="text-sm font-semibold">A Receber</span>
              </div>
              <div className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{formatCurrency(incomePending)}</div>
            </div>
            <div className="bg-rose-50 dark:bg-rose-900/20 rounded-xl p-4 border border-rose-100 dark:border-rose-800/50 flex flex-col justify-between">
              <div className="flex items-center space-x-2 text-rose-600 dark:text-rose-400 mb-2">
                <ArrowDownCircle size={16} />
                <span className="text-sm font-semibold">A Pagar</span>
              </div>
              <div className="text-lg font-bold text-rose-700 dark:text-rose-300">{formatCurrency(expensePending)}</div>
            </div>
          </div>
        </div>
      )}

      {categoryGoalAlerts.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-800">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Alertas de Metas (tempo real)</h3>
          <div className="space-y-3">
            {categoryGoalAlerts.map((alert) => (
              <div
                key={alert.categoryId}
                className={`rounded-xl p-3 border ${
                  alert.isCritical ? 'bg-rose-50 border-rose-200' : 'bg-amber-50 border-amber-200'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{alert.categoryName}</p>
                  <p className={`text-xs font-bold ${alert.isCritical ? 'text-rose-700 dark:text-rose-400' : 'text-amber-700 dark:text-amber-400'}`}>
                    {(alert.progress * 100).toFixed(0)}%
                  </p>
                </div>
                <div className="w-full bg-white/80 dark:bg-gray-800 rounded-full h-2 mb-2">
                  <div
                    className={`h-2 rounded-full ${alert.isCritical ? 'bg-rose-500' : 'bg-amber-500'}`}
                    style={{ width: `${Math.min(alert.progress * 100, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-gray-700 dark:text-gray-400">
                  {formatCurrency(alert.spent)} de {formatCurrency(alert.monthlyLimit)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fixed vs Variable */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-800">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center">
          <Calendar size={18} className="mr-2 text-indigo-500 dark:text-indigo-400" />
          Natureza das Despesas
        </h3>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600 dark:text-gray-400">Fixas</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">{formatCurrency(fixedExpense)}</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div className="bg-indigo-500 h-2 rounded-full" style={{ width: expense > 0 ? `${(fixedExpense / expense) * 100}%` : '0%' }}></div>
            </div>
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600 dark:text-gray-400">Variáveis</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">{formatCurrency(variableExpense)}</span>
            </div>
            <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2">
              <div className="bg-amber-500 h-2 rounded-full" style={{ width: expense > 0 ? `${(variableExpense / expense) * 100}%` : '0%' }}></div>
            </div>
          </div>
        </div>
      </div>

      {/* Balance Evolution Chart */}
      {balanceEvolution.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-800">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center">
            <TrendingUp size={18} className="mr-2 text-indigo-500 dark:text-indigo-400" />
            Evolução do Saldo
          </h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={balanceEvolution}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: '#64748b' }} 
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  tickFormatter={(value) => `R$ ${value}`}
                  width={60}
                />
                <Tooltip 
                  formatter={(value: number) => [formatCurrency(value), 'Saldo']}
                  labelStyle={{ color: '#64748b', fontSize: 12 }}
                  contentStyle={{ 
                    borderRadius: '12px', 
                    border: 'none', 
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    backgroundColor: useAppStore().theme === 'dark' ? '#1f2937' : '#fff',
                    color: useAppStore().theme === 'dark' ? '#f3f4f6' : '#1f2937'
                  }}
                />
                <Line 
                  type="monotone" 
                  dataKey="saldo" 
                  stroke="#4f46e5" 
                  strokeWidth={3}
                  dot={{ r: 0 }}
                  activeDot={{ r: 6, fill: '#4f46e5', stroke: '#fff', strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Top Categories Chart */}
      {expensesByCategory.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-800">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center">
            <PieChartIcon size={18} className="mr-2 text-indigo-500 dark:text-indigo-400" />
            Gastos por Categoria
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={expensesByCategory.slice(0, 5)}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {expensesByCategory.slice(0, 5).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2 mt-4">
            {expensesByCategory.slice(0, 5).map((cat, i) => (
              <div key={i} className="flex justify-between items-center text-sm">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }}></div>
                  <span className="text-gray-700 dark:text-gray-300">{cat.name}</span>
                </div>
                <span className="font-medium text-gray-900 dark:text-gray-100">{formatCurrency(cat.value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
