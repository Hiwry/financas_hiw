import React, { useMemo, useState } from 'react';
import { useAppStore } from '../store';
import { format, parseISO, addMonths, subMonths, isSameMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Filter, Search, Trash2, Edit2, Calendar as CalendarIcon, Tag, CreditCard, CheckCircle, Clock, X, HandCoins, Ban, RefreshCcw, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { CategoryIcon } from '../components/CategoryIcon';
import { Transaction } from '../types';

interface ConfirmAction {
  message: string;
  onConfirm: () => void;
}

export const Lancamentos: React.FC<{ onEdit?: (tx: Transaction) => void }> = ({ onEdit }) => {
  const {
    transactions,
    categories,
    deleteTransaction,
    updateTransaction,
    settleFutureInstallments,
    cancelFutureInstallments,
    renegotiateInstallments,
    canEdit,
  } = useAppStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [showRenegotiate, setShowRenegotiate] = useState(false);
  const [renegotiateCount, setRenegotiateCount] = useState('3');
  const [renegotiateAmount, setRenegotiateAmount] = useState('');
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const toggleStatus = (transaction: Transaction) => {
    if (!canEdit) return;
    updateTransaction({
      ...transaction,
      status: transaction.status === 'paid' ? 'pending' : 'paid',
    });
  };

  const filteredTransactions = useMemo(() => {
    return transactions
      .filter((transaction) => {
        const txDate = parseISO(transaction.date);
        const matchesMonth = isSameMonth(txDate, currentMonth);
        const matchesType = filterType === 'all' || transaction.type === filterType;
        const matchesCategory = filterCategory === 'all' || transaction.categoryId === filterCategory;
        const description = transaction.description?.toLowerCase() || '';
        const categoryName = categories.find((category) => category.id === transaction.categoryId)?.name.toLowerCase() || '';
        const matchesSearch = description.includes(searchTerm.toLowerCase()) || categoryName.includes(searchTerm.toLowerCase());
        return matchesMonth && matchesType && matchesCategory && matchesSearch;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, filterType, filterCategory, searchTerm, categories, currentMonth]);

  const groupedTransactions = useMemo(() => {
    const groups: Record<string, typeof filteredTransactions> = {};
    filteredTransactions.forEach((transaction) => {
      const dateStr = format(parseISO(transaction.date), "dd 'de' MMMM, yyyy", { locale: ptBR });
      if (!groups[dateStr]) groups[dateStr] = [];
      groups[dateStr].push(transaction);
    });
    return groups;
  }, [filteredTransactions]);

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
        <h2 className="text-2xl font-bold text-gray-800">Extrato</h2>
        <div className="flex items-center space-x-2">
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={`p-2 rounded-full transition-all ${
              showFilters ? 'bg-indigo-600 text-white shadow-md' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 shadow-sm'
            }`}
          >
            <Filter size={20} />
          </button>
        </div>
      </div>

      {/* Month Navigator */}
      <div className="flex items-center justify-between bg-white p-3 rounded-2xl border border-gray-100 shadow-sm">
        <button
          onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          className="p-2 hover:bg-gray-50 rounded-full transition-colors text-gray-600"
        >
          <ChevronLeft size={24} />
        </button>
        
        <div className="flex flex-col items-center">
          <span className="text-sm font-semibold text-gray-900 capitalize">
            {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
          </span>
          {!isSameMonth(currentMonth, new Date()) && (
            <button 
              onClick={() => setCurrentMonth(new Date())}
              className="text-[10px] font-bold text-indigo-600 uppercase tracking-tight mt-0.5 hover:underline"
            >
              Voltar para Hoje
            </button>
          )}
        </div>

        <button
          onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          className="p-2 hover:bg-gray-50 rounded-full transition-colors text-gray-600"
        >
          <ChevronRight size={24} />
        </button>
      </div>

      {showFilters && (
        <div className="space-y-4 animate-in slide-in-from-top-2 duration-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Buscar lancamentos..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow"
            />
          </div>

          <div className="flex space-x-2">
            {['all', 'income', 'expense'].map((type) => (
              <button
                key={type}
                onClick={() => {
                  setFilterType(type as any);
                  setFilterCategory('all');
                }}
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
                {type === 'all' ? 'Todos' : type === 'income' ? 'Receitas' : 'Despesas'}
              </button>
            ))}
          </div>

          <div className="flex space-x-2 overflow-x-auto hide-scrollbar pb-1">
            <button
              onClick={() => setFilterCategory('all')}
              className={`shrink-0 px-4 py-1.5 text-sm font-medium rounded-full transition-colors ${
                filterCategory === 'all'
                  ? 'bg-gray-800 text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              Todas as Categorias
            </button>
            {categories
              .filter((category) => filterType === 'all' || category.type === filterType)
              .map((category) => (
                <button
                  key={category.id}
                  onClick={() => setFilterCategory(category.id)}
                  className={`shrink-0 px-3 py-1.5 text-sm font-medium rounded-full transition-colors flex items-center space-x-1.5 ${
                    filterCategory === category.id
                      ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                      : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <CategoryIcon name={category.icon} type={category.type} size={14} />
                  <span>{category.name}</span>
                </button>
              ))}
          </div>
        </div>
      )}

      <div className="space-y-6">
        {Object.keys(groupedTransactions).length === 0 ? (
          <div className="text-center py-10 text-gray-500 flex flex-col items-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Search size={24} className="text-gray-400" />
            </div>
            <p>Nenhum lancamento encontrado.</p>
          </div>
        ) : (
          Object.entries(groupedTransactions).map(([date, txs]) => (
            <div key={date} className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider sticky top-0 bg-gray-50 py-2 z-10">{date}</h3>

              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {txs.map((transaction, index) => {
                  const category = categories.find((item) => item.id === transaction.categoryId);
                  const isIncome = transaction.type === 'income';
                  const installmentLabel = getInstallmentLabel(transaction);

                  return (
                    <div
                      key={transaction.id}
                      onClick={() => {
                        setSelectedTx(transaction);
                        setShowRenegotiate(false);
                        setRenegotiateCount('3');
                        setRenegotiateAmount('');
                      }}
                      className={`p-4 flex items-start justify-between gap-3 ${index !== txs.length - 1 ? 'border-b border-gray-50' : ''} hover:bg-gray-50 transition-colors cursor-pointer`}
                    >
                      <div className="flex items-start space-x-3 flex-1 min-w-0">
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
                            {transaction.status === 'pending' && (
                              <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 uppercase tracking-wider">
                                Pendente
                              </span>
                            )}
                            {transaction.autoGenerated && (
                              <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 uppercase tracking-wider">
                                Projetado
                              </span>
                            )}
                          </p>

                          <div className="flex items-center text-xs text-gray-500 space-x-2 mt-1 truncate">
                            <span className="flex items-center shrink-0">
                              <Tag size={10} className="mr-1" /> {category?.name}
                            </span>
                            <span className="shrink-0">-</span>
                            <span className="flex items-center truncate">
                              <CreditCard size={10} className="mr-1 shrink-0" /> {transaction.account}
                            </span>
                          </div>

                          {transaction.status === 'pending' && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleStatus(transaction);
                                }}
                                disabled={!canEdit}
                                className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-semibold hover:bg-emerald-100 transition-colors disabled:opacity-50"
                              >
                                Confirmar
                              </button>
                              {onEdit && (
                                <button
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    if (!canEdit) return;
                                    onEdit(transaction);
                                  }}
                                  disabled={!canEdit}
                                  className="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-700 text-xs font-semibold hover:bg-gray-200 transition-colors disabled:opacity-50"
                                >
                                  Editar
                                </button>
                              )}
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  event.preventDefault();
                                  if (!canEdit) return;
                                  setConfirmAction({
                                    message: 'Excluir este lancamento pendente?',
                                    onConfirm: () => deleteTransaction(transaction.id),
                                  });
                                }}
                                disabled={!canEdit}
                                className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 text-xs font-semibold hover:bg-rose-100 transition-colors disabled:opacity-50"
                              >
                                Excluir
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col items-end shrink-0">
                        <span className={`font-bold ${isIncome ? 'text-emerald-600' : 'text-gray-900'} ${transaction.status === 'pending' ? 'opacity-60' : ''}`}>
                          {isIncome ? '+' : '-'}{formatCurrency(transaction.amount)}
                        </span>
                        {transaction.status === 'pending' ? (
                          <span className="text-[11px] font-medium text-amber-700 mt-1">Aguardando</span>
                        ) : (
                          <span className="text-[11px] text-gray-500 mt-1">Concluido</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Detail Modal */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            {(() => {
              const category = categories.find((item) => item.id === selectedTx.categoryId);
              const isIncome = selectedTx.type === 'income';
              const installmentLabel = getInstallmentLabel(selectedTx);
              const hasInstallmentGroup = Boolean(selectedTx.installmentGroupId);
              const currentInstallment = selectedTx.installmentNumber || 1;
              const futureInstallments = hasInstallmentGroup
                ? transactions
                    .filter((transaction) => transaction.installmentGroupId === selectedTx.installmentGroupId)
                    .filter((transaction) => (transaction.installmentNumber || 1) > currentInstallment)
                    .sort((a, b) => (a.installmentNumber || 1) - (b.installmentNumber || 1))
                : [];
              const futureTotal = futureInstallments.reduce((sum, transaction) => sum + transaction.amount, 0);

              return (
                <>
                  <div className={`p-6 text-white relative ${isIncome ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                    <button
                      onClick={() => {
                        setSelectedTx(null);
                        setShowRenegotiate(false);
                      }}
                      className="absolute top-4 right-4 p-2 bg-white/20 hover:bg-white/30 rounded-full transition-colors"
                    >
                      <X size={20} />
                    </button>

                    <div className="flex flex-col items-center text-center mt-2">
                      <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mb-3">
                        <CategoryIcon name={category?.icon} type={selectedTx.type} size={32} />
                      </div>
                      <h3 className="text-xl font-bold mb-1">{selectedTx.description || category?.name}</h3>
                      <p className="text-3xl font-black tracking-tight">
                        {isIncome ? '+' : '-'}{formatCurrency(selectedTx.amount)}
                      </p>
                      <div className="mt-3 inline-flex items-center px-3 py-1 bg-white/20 rounded-full text-sm font-medium">
                        {selectedTx.status === 'paid' ? (
                          <>
                            <CheckCircle size={16} className="mr-1.5" /> {isIncome ? 'Recebido' : 'Pago'}
                          </>
                        ) : (
                          <>
                            <Clock size={16} className="mr-1.5" /> {isIncome ? 'A Receber' : 'Pendente'}
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Data</p>
                        <p className="text-sm font-medium text-gray-900 flex items-center">
                          <CalendarIcon size={14} className="mr-1.5 text-gray-400" />
                          {format(parseISO(selectedTx.date), 'dd/MM/yyyy')}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Categoria</p>
                        <p className="text-sm font-medium text-gray-900 flex items-center">
                          <Tag size={14} className="mr-1.5 text-gray-400" />
                          {category?.name}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Conta</p>
                        <p className="text-sm font-medium text-gray-900 flex items-center">
                          <CreditCard size={14} className="mr-1.5 text-gray-400" />
                          {selectedTx.account}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Pagamento</p>
                        <p className="text-sm font-medium text-gray-900 capitalize">{selectedTx.paymentMethod}</p>
                      </div>
                    </div>

                    {installmentLabel && (
                      <div className="text-sm font-medium text-indigo-700 bg-indigo-50 rounded-lg px-3 py-2">
                        Parcela: {installmentLabel}
                      </div>
                    )}

                    {hasInstallmentGroup && (
                      <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-3 space-y-2">
                        <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wider">
                          Parcelas avancadas
                        </p>
                        <p className="text-xs text-indigo-700">
                          Futuras: {futureInstallments.length} - Total {formatCurrency(futureTotal)}
                        </p>

                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => {
                              if (!canEdit) return;
                              settleFutureInstallments(selectedTx.id);
                              setSelectedTx(null);
                            }}
                            disabled={!canEdit || futureInstallments.length === 0}
                            className="py-2 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-semibold flex items-center justify-center disabled:opacity-50"
                          >
                            <HandCoins size={14} className="mr-1.5" />
                            Quitar futuras
                          </button>
                          <button
                            onClick={() => {
                              if (!canEdit || futureInstallments.length === 0) return;
                              setConfirmAction({
                                message: 'Cancelar todas as parcelas futuras deste grupo?',
                                onConfirm: () => {
                                  cancelFutureInstallments(selectedTx.id);
                                  setSelectedTx(null);
                                },
                              });
                            }}
                            disabled={!canEdit || futureInstallments.length === 0}
                            className="py-2 bg-rose-50 text-rose-700 rounded-lg text-xs font-semibold flex items-center justify-center disabled:opacity-50"
                          >
                            <Ban size={14} className="mr-1.5" />
                            Cancelar futuras
                          </button>
                        </div>

                        <button
                          onClick={() => {
                            setShowRenegotiate((prev) => !prev);
                            if (!renegotiateAmount) {
                              setRenegotiateAmount(String(futureTotal.toFixed(2)));
                            }
                          }}
                          disabled={!canEdit || futureInstallments.length === 0}
                          className="w-full py-2 bg-white border border-indigo-200 text-indigo-700 rounded-lg text-xs font-semibold flex items-center justify-center disabled:opacity-50"
                        >
                          <RefreshCcw size={14} className="mr-1.5" />
                          Renegociar futuras
                        </button>

                        {showRenegotiate && futureInstallments.length > 0 && (
                          <div className="rounded-lg bg-white border border-indigo-100 p-2.5 space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                type="number"
                                min={1}
                                max={48}
                                value={renegotiateCount}
                                onChange={(event) => setRenegotiateCount(event.target.value)}
                                className="p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs"
                                placeholder="Qtd parcelas"
                              />
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={renegotiateAmount}
                                onChange={(event) => setRenegotiateAmount(event.target.value)}
                                className="p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs"
                                placeholder="Total renegociado"
                              />
                            </div>
                            <button
                              onClick={() => {
                                if (!canEdit) return;
                                const count = Math.max(1, Math.floor(Number(renegotiateCount) || 1));
                                const total = Math.max(0, Number(renegotiateAmount) || 0);
                                renegotiateInstallments(selectedTx.id, count, total);
                                setSelectedTx(null);
                              }}
                              className="w-full py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold"
                            >
                              Confirmar renegociacao
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    <div className={`pt-4 mt-2 border-t border-gray-100 grid gap-3 ${selectedTx.status === 'pending' ? 'grid-cols-3' : 'grid-cols-2'}`}>
                      {selectedTx.status === 'pending' && (
                        <button
                          onClick={() => {
                            if (!canEdit) return;
                            toggleStatus(selectedTx);
                            setSelectedTx(null);
                          }}
                          disabled={!canEdit}
                          className="py-3 bg-emerald-50 text-emerald-700 rounded-xl font-semibold text-sm flex items-center justify-center hover:bg-emerald-100 transition-colors disabled:opacity-50"
                        >
                          <CheckCircle size={16} className="mr-1.5" />
                          Confirmar
                        </button>
                      )}

                      <button
                        onClick={() => {
                          if (!canEdit || !onEdit) return;
                          onEdit(selectedTx);
                          setSelectedTx(null);
                        }}
                        disabled={!canEdit || !onEdit}
                        className="py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold text-sm flex items-center justify-center hover:bg-gray-200 transition-colors disabled:opacity-50"
                      >
                        <Edit2 size={18} className="mr-2" />
                        Editar
                      </button>

                      <button
                        onClick={() => {
                          if (!canEdit) return;
                          setConfirmAction({
                            message: 'Tem certeza que deseja excluir este lancamento?',
                            onConfirm: () => {
                              deleteTransaction(selectedTx.id);
                              setSelectedTx(null);
                            },
                          });
                        }}
                        disabled={!canEdit}
                        className="py-3 bg-rose-50 text-rose-600 rounded-xl font-semibold text-sm flex items-center justify-center hover:bg-rose-100 transition-colors disabled:opacity-50"
                      >
                        <Trash2 size={18} className="mr-2" />
                        Excluir
                      </button>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmAction && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-xs shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex flex-col items-center text-center space-y-2">
              <div className="w-12 h-12 bg-rose-100 rounded-full flex items-center justify-center">
                <AlertTriangle size={24} className="text-rose-600" />
              </div>
              <p className="text-sm font-medium text-gray-800">{confirmAction.message}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setConfirmAction(null)}
                className="py-2.5 bg-gray-100 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  confirmAction.onConfirm();
                  setConfirmAction(null);
                }}
                className="py-2.5 bg-rose-600 text-white rounded-xl font-semibold text-sm hover:bg-rose-700 transition-colors"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
