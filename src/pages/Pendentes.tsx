import React, { useMemo, useState } from 'react';
import { useAppStore } from '../store';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Trash2, Tag, CheckCircle, Clock, Calendar as CalendarIcon, X, Edit2, BellRing } from 'lucide-react';
import { CategoryIcon } from '../components/CategoryIcon';
import { Transaction } from '../types';
import { requestReminderPermission } from '../services/reminderNotificationService';
import { toLocalIsoDate } from '../utils/date';

export const Pendentes: React.FC<{ onEdit?: (tx: Transaction) => void }> = ({ onEdit }) => {
  const {
    transactions,
    categories,
    deleteTransaction,
    updateTransaction,
    updateReminderSettings,
    reminderSettings,
    markTransactionsPaid,
    canEdit,
  } = useAppStore();
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');
  const [transactionToConfirm, setTransactionToConfirm] = useState<Transaction | null>(null);
  const [editingDueDateFor, setEditingDueDateFor] = useState<Transaction | null>(null);
  const [tempDueDate, setTempDueDate] = useState('');

  const confirmToggleStatus = () => {
    if (!transactionToConfirm) return;
    if (!canEdit) return;
    updateTransaction({
      ...transactionToConfirm,
      status: transactionToConfirm.status === 'paid' ? 'pending' : 'paid',
    });
    setTransactionToConfirm(null);
  };

  const handleSaveDueDate = () => {
    if (!editingDueDateFor) return;
    if (!canEdit) return;

    updateTransaction({
      ...editingDueDateFor,
      dueDate: tempDueDate,
    });

    setEditingDueDateFor(null);
  };

  const requestNotificationPermission = async () => {
    const granted = await requestReminderPermission();
    if (!granted) {
      alert('Permissao de notificacao nao concedida.');
      return;
    }
    alert('Notificacoes ativadas com sucesso.');
  };

  const settleTodayPendings = () => {
    if (!canEdit) return;
    const todayIso = toLocalIsoDate();
    const ids = transactions
      .filter((transaction) => transaction.status === 'pending')
      .filter((transaction) => (transaction.dueDate || transaction.date) <= todayIso)
      .map((transaction) => transaction.id);

    if (!ids.length) {
      alert('Nenhuma pendencia vencendo hoje.');
      return;
    }

    markTransactionsPaid(ids);
  };

  const pendingTransactions = useMemo(() => {
    return transactions
      .filter((transaction) => transaction.status === 'pending')
      .filter((transaction) => filterType === 'all' || transaction.type === filterType)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [transactions, filterType]);

  const groupedTransactions = useMemo(() => {
    const groups: Record<string, typeof pendingTransactions> = {};
    pendingTransactions.forEach((transaction) => {
      const dateStr = format(parseISO(transaction.date), "dd 'de' MMMM, yyyy", { locale: ptBR });
      if (!groups[dateStr]) groups[dateStr] = [];
      groups[dateStr].push(transaction);
    });
    return groups;
  }, [pendingTransactions]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const getInstallmentLabel = (transaction: Transaction): string | null => {
    if (!transaction.installmentCount || transaction.installmentCount <= 1) return null;
    const current = transaction.installmentNumber || 1;
    return `${current}/${transaction.installmentCount}x`;
  };

  return (
    <div className="p-4 space-y-6 pb-24">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">A Receber / Pagar</h2>
      </div>

      <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-800 flex items-center">
            <BellRing size={16} className="mr-1.5 text-indigo-500" />
            Lembretes de vencimento
          </p>
          <label className="inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={reminderSettings.enabled}
              onChange={(event) => updateReminderSettings({ enabled: event.target.checked })}
              className="w-4 h-4 text-indigo-600"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <select
            value={String(reminderSettings.daysBefore)}
            onChange={(event) => updateReminderSettings({ daysBefore: Number(event.target.value) })}
            className="p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
          >
            <option value="0">No dia do vencimento</option>
            <option value="1">1 dia antes</option>
            <option value="2">2 dias antes</option>
            <option value="3">3 dias antes</option>
            <option value="5">5 dias antes</option>
            <option value="7">7 dias antes</option>
          </select>
          <button
            onClick={() => void requestNotificationPermission()}
            className="py-2 px-3 bg-indigo-50 text-indigo-700 rounded-lg text-sm font-semibold hover:bg-indigo-100"
          >
            Permitir notificacoes
          </button>
        </div>

        <button
          onClick={settleTodayPendings}
          disabled={!canEdit}
          className="w-full py-2.5 bg-emerald-50 text-emerald-700 rounded-lg text-sm font-semibold hover:bg-emerald-100 disabled:opacity-50"
        >
          Quitar pendencias de hoje
        </button>
      </div>

      <div className="flex space-x-2">
        {['all', 'income', 'expense'].map((type) => (
          <button
            key={type}
            onClick={() => setFilterType(type as any)}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
              filterType === type
                ? type === 'income'
                  ? 'bg-emerald-100 text-emerald-700'
                  : type === 'expense'
                    ? 'bg-rose-100 text-rose-700'
                    : 'bg-indigo-100 text-indigo-700'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {type === 'all' ? 'Todos' : type === 'income' ? 'A Receber' : 'A Pagar'}
          </button>
        ))}
      </div>

      <div className="space-y-6">
        {Object.keys(groupedTransactions).length === 0 ? (
          <div className="text-center py-10 text-gray-500 flex flex-col items-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Clock size={24} className="text-gray-400" />
            </div>
            <p>Nenhum lancamento pendente.</p>
          </div>
        ) : (
          Object.entries(groupedTransactions).map(([date, txs]) => (
            <div key={date} className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider sticky top-0 bg-gray-50 py-2 z-10">{date}</h3>

              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {txs.map((transaction, index) => {
                  const category = categories.find((item) => item.id === transaction.categoryId);
                  const isIncome = transaction.type === 'income';
                  const isOverdue =
                    !!transaction.dueDate && new Date(transaction.dueDate) < new Date(new Date().setHours(0, 0, 0, 0));
                  const installmentLabel = getInstallmentLabel(transaction);

                  return (
                    <div key={transaction.id} className={`p-4 ${index !== txs.length - 1 ? 'border-b border-gray-50' : ''}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start space-x-4 flex-1 min-w-0">
                          <div
                            className="w-10 h-10 rounded-full flex items-center justify-center text-white shadow-sm shrink-0"
                            style={{ backgroundColor: category?.color || '#cbd5e1' }}
                          >
                            <CategoryIcon name={category?.icon} type={transaction.type} size={20} />
                          </div>

                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-gray-900 truncate flex items-center">
                              {transaction.description || category?.name}
                              {installmentLabel && (
                                <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-700 uppercase tracking-wider">
                                  {installmentLabel}
                                </span>
                              )}
                            </p>

                            <div className="flex items-center text-xs text-gray-500 space-x-2 mt-1 truncate">
                              <span className="flex items-center shrink-0">
                                <Tag size={10} className="mr-1" /> {category?.name}
                              </span>
                              <span className="shrink-0">-</span>
                              <button
                                onClick={() => {
                                  if (!canEdit) return;
                                  setEditingDueDateFor(transaction);
                                  setTempDueDate(transaction.dueDate || transaction.date);
                                }}
                                disabled={!canEdit}
                                className={`flex items-center truncate px-1.5 py-0.5 rounded transition-colors ${
                                  transaction.dueDate
                                    ? isOverdue
                                      ? 'bg-rose-100 text-rose-700 font-medium'
                                      : 'bg-indigo-50 text-indigo-700 font-medium'
                                    : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                                } ${!canEdit ? 'opacity-60' : ''}`}
                              >
                                <CalendarIcon size={10} className="mr-1 shrink-0" />
                                {transaction.dueDate ? `Vence: ${format(parseISO(transaction.dueDate), 'dd/MM')}` : 'Definir prazo'}
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col items-end shrink-0 ml-2">
                          <span className={`font-bold ${isIncome ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {isIncome ? '+' : '-'}{formatCurrency(transaction.amount)}
                          </span>
                          <span className={`text-[11px] mt-1 font-medium ${isOverdue ? 'text-rose-700' : 'text-amber-700'}`}>
                            {isOverdue ? 'Atrasado' : 'Pendente'}
                          </span>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <button
                          onClick={() => {
                            if (!canEdit) return;
                            setTransactionToConfirm(transaction);
                          }}
                          disabled={!canEdit}
                          className="py-2.5 bg-emerald-50 text-emerald-700 rounded-xl font-semibold text-xs flex items-center justify-center hover:bg-emerald-100 transition-colors disabled:opacity-50"
                        >
                          <CheckCircle size={14} className="mr-1" />
                          Confirmar
                        </button>

                        <button
                          onClick={() => {
                            if (!canEdit) return;
                            if (onEdit) {
                              onEdit(transaction);
                            } else {
                              alert('Edicao nao disponivel.');
                            }
                          }}
                          disabled={!canEdit}
                          className="py-2.5 bg-gray-100 text-gray-700 rounded-xl font-semibold text-xs flex items-center justify-center hover:bg-gray-200 transition-colors disabled:opacity-50"
                        >
                          <Edit2 size={14} className="mr-1" />
                          Editar
                        </button>

                        <button
                          onClick={() => {
                            if (!canEdit) return;
                            if (window.confirm('Excluir este lancamento?')) {
                              deleteTransaction(transaction.id);
                            }
                          }}
                          disabled={!canEdit}
                          className="py-2.5 bg-rose-50 text-rose-700 rounded-xl font-semibold text-xs flex items-center justify-center hover:bg-rose-100 transition-colors disabled:opacity-50"
                        >
                          <Trash2 size={14} className="mr-1" />
                          Excluir
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {transactionToConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl animate-in fade-in zoom-in duration-200">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Confirmar alteracao</h3>
            <p className="text-gray-600 mb-6 text-sm">
              Deseja marcar "{transactionToConfirm.description || categories.find((category) => category.id === transactionToConfirm.categoryId)?.name}" como pago?
            </p>
            <div className="flex space-x-3">
              <button
                onClick={() => setTransactionToConfirm(null)}
                className="flex-1 py-2.5 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmToggleStatus}
                disabled={!canEdit}
                className="flex-1 py-2.5 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {editingDueDateFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-xl animate-in zoom-in-95 duration-200 relative">
            <button
              onClick={() => setEditingDueDateFor(null)}
              className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X size={20} />
            </button>
            <h3 className="text-xl font-bold text-gray-900 mb-1">Definir Prazo</h3>
            <p className="text-gray-500 text-sm mb-6">Quando este lancamento deve ser pago/recebido?</p>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Data de Vencimento</label>
                <input
                  type="date"
                  value={tempDueDate}
                  onChange={(event) => setTempDueDate(event.target.value)}
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 text-gray-900 font-medium"
                />
              </div>

              <button
                onClick={handleSaveDueDate}
                disabled={!canEdit}
                className="w-full py-3.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors shadow-md disabled:opacity-50"
              >
                Salvar Prazo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
