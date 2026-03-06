import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAppStore } from '../store';
import { format, parseISO, addMonths, subMonths, isSameMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Filter, Search, Trash2, Edit2, Calendar as CalendarIcon, Tag, CreditCard, CheckCircle, Clock, X, HandCoins, Ban, RefreshCcw, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { CategoryIcon } from '../components/CategoryIcon';
import { SwipeableItem } from '../components/SwipeableItem';
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
    <div className="p-4 space-y-6 pb-24 dark:bg-black min-h-screen">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Extrato</h2>
        <div className="flex items-center space-x-2">
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={`p-2 rounded-full transition-all ${
              showFilters ? 'bg-indigo-600 text-white shadow-md' : 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 shadow-sm'
            }`}
          >
            <Filter size={20} />
          </button>
        </div>
      </div>

      {/* Month Navigator */}
      <div className="flex items-center justify-between bg-white dark:bg-gray-900 p-3 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
        <button
          onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          className="p-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-full transition-colors text-gray-600 dark:text-gray-400"
        >
          <ChevronLeft size={24} />
        </button>
        
        <div className="flex flex-col items-center">
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 capitalize">
            {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
          </span>
          {!isSameMonth(currentMonth, new Date()) && (
            <button 
              onClick={() => setCurrentMonth(new Date())}
              className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-tight mt-0.5 hover:underline"
            >
              Voltar para Hoje
            </button>
          )}
        </div>

        <button
          onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          className="p-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-full transition-colors text-gray-600 dark:text-gray-400"
        >
          <ChevronRight size={24} />
        </button>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={currentMonth.toISOString()}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.7}
          onDragEnd={(_, info) => {
            const threshold = 100;
            if (info.offset.x < -threshold) {
              setCurrentMonth(addMonths(currentMonth, 1));
            } else if (info.offset.x > threshold) {
              setCurrentMonth(subMonths(currentMonth, 1));
            }
          }}
          className="space-y-6"
        >
          {showFilters && (
            <div className="space-y-4 animate-in slide-in-from-top-2 duration-200">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500" size={18} />
                <input
                  type="text"
                  placeholder="Buscar lancamentos..."
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-gray-100 transition-shadow"
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
                          ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400'
                          : type === 'expense'
                            ? 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-400'
                            : 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400'
                        : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    {type === 'all' ? 'Todos' : type === 'income' ? 'Receitas' : 'Despesas'}
                  </button>
                ))}
              </div>

              <div className="flex overflow-x-auto pb-2 space-x-2 scrollbar-hide -mx-4 px-4">
                <button
                  onClick={() => setFilterCategory('all')}
                  className={`whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                    filterCategory === 'all'
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  Todas Categorias
                </button>
                {categories
                  .filter((cat) => filterType === 'all' || cat.type === filterType)
                  .map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setFilterCategory(cat.id)}
                      className={`whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-medium transition-colors border flex items-center space-x-1.5 ${
                        filterCategory === cat.id
                          ? 'bg-indigo-600 border-indigo-600 text-white'
                          : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      <CategoryIcon name={cat.icon} type={cat.type} size={14} />
                      <span>{cat.name}</span>
                    </button>
                  ))}
              </div>
            </div>
          )}

          <div className="space-y-4">
            {Object.keys(groupedTransactions).length === 0 ? (
              <div className="text-center py-12 bg-white dark:bg-gray-900 rounded-3xl border border-dashed border-gray-200 dark:border-gray-800">
                <CalendarIcon className="mx-auto h-12 w-12 text-gray-300 dark:text-gray-700 mb-3" />
                <p className="text-gray-500 dark:text-gray-400 font-medium">Nenhum lancamento neste periodo.</p>
              </div>
            ) : (
              Object.entries(groupedTransactions).map(([date, items]) => (
                <div key={date} className="space-y-2">
                  <div className="sticky top-0 z-10 bg-gray-50/95 dark:bg-black/95 backdrop-blur-md py-2 px-1 mb-2 border-b border-gray-100 dark:border-gray-800 transition-colors">
                    <h3 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center">
                      <span className="w-8 h-[1px] bg-gray-200 dark:bg-gray-800 mr-2"></span>
                      {date}
                    </h3>
                  </div>
      <div className="space-y-2">
                    {items.map((tx) => {
                      const category = categories.find((cat) => cat.id === tx.categoryId);
                      const isIncome = tx.type === 'income';
                      const installmentLabel = getInstallmentLabel(tx);

                      return (
                        <SwipeableItem
                          key={tx.id}
                          rightActions={
                            <div className="flex h-full">
                              <button
                                onClick={() => onEdit?.(tx)}
                                className="w-16 h-full bg-indigo-500 text-white flex items-center justify-center"
                              >
                                <Edit2 size={20} />
                              </button>
                              <button
                                onClick={() => setConfirmAction({
                                  message: tx.installmentGroupId ? 'Deseja excluir este lancamento parcelado?' : 'Excluir este lancamento?',
                                  onConfirm: () => deleteTransaction(tx.id),
                                })}
                                className="w-16 h-full bg-rose-500 text-white flex items-center justify-center"
                              >
                                <Trash2 size={20} />
                              </button>
                            </div>
                          }
                        >
                          <button
                            onClick={() => setSelectedTx(tx)}
                            className="w-full flex items-center justify-between p-4 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl shadow-sm hover:border-indigo-100 dark:hover:border-indigo-900/50 transition-all group"
                          >
                            <div className="flex items-center space-x-3">
                              <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
                                isIncome ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' : 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400'
                              }`}>
                                <CategoryIcon name={category?.icon} type={tx.type} size={24} />
                              </div>
                              <div className="text-left">
                                <p className="font-bold text-gray-900 dark:text-gray-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                                  {tx.description || category?.name}
                                  {installmentLabel && (
                                    <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-700 uppercase tracking-wider">
                                      {installmentLabel}
                                    </span>
                                  )}
                                </p>
                                <div className="flex items-center space-x-2">
                                  <span className="text-[10px] font-medium px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded">
                                    {tx.account}
                                  </span>
                                  {tx.status === 'pending' && <Clock size={12} className="text-amber-500" />}
                                  {tx.autoGenerated && <RefreshCcw size={12} className="text-blue-500" />}
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className={`font-black text-lg tracking-tighter ${
                                isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                              }`}>
                                {isIncome ? '+' : '-'} {formatCurrency(tx.amount)}
                              </p>
                              <p className="text-[10px] font-bold text-gray-300 dark:text-gray-600 group-hover:text-indigo-200 dark:group-hover:text-indigo-800">DETALHES</p>
                            </div>
                          </button>
                        </SwipeableItem>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Detail Modal */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-transparent dark:border-gray-800">
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
                  <div className={`p-6 text-white relative ${isIncome ? 'bg-emerald-500 dark:bg-emerald-600' : 'bg-rose-500 dark:bg-rose-600'}`}>
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
                        <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-semibold mb-1">Data</p>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center">
                          <CalendarIcon size={14} className="mr-1.5 text-gray-400 dark:text-gray-500" />
                          {format(parseISO(selectedTx.date), 'dd/MM/yyyy')}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-semibold mb-1">Categoria</p>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center">
                          <Tag size={14} className="mr-1.5 text-gray-400 dark:text-gray-500" />
                          {category?.name}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-semibold mb-1">Conta</p>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center">
                          <CreditCard size={14} className="mr-1.5 text-gray-400 dark:text-gray-500" />
                          {selectedTx.account}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-semibold mb-1">Pagamento</p>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 capitalize">{selectedTx.paymentMethod}</p>
                      </div>
                    </div>

                    {installmentLabel && (
                      <div className="text-sm font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg px-3 py-2">
                        Parcela: {installmentLabel}
                      </div>
                    )}

                    {hasInstallmentGroup && (
                      <div className="rounded-lg border border-indigo-100 dark:border-indigo-900/50 bg-indigo-50/60 dark:bg-indigo-950/40 p-3 space-y-2">
                        <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-400 uppercase tracking-wider">
                          Parcelas avancadas
                        </p>
                        <p className="text-xs text-indigo-700 dark:text-indigo-400">
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
                            className="py-2 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-lg text-xs font-semibold flex items-center justify-center disabled:opacity-50"
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
                            className="py-2 bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 rounded-lg text-xs font-semibold flex items-center justify-center disabled:opacity-50"
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
                          className="w-full py-2 bg-white dark:bg-gray-900 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-400 rounded-lg text-xs font-semibold flex items-center justify-center disabled:opacity-50"
                        >
                          <RefreshCcw size={14} className="mr-1.5" />
                          Renegociar futuras
                        </button>

                        {showRenegotiate && futureInstallments.length > 0 && (
                          <div className="rounded-lg bg-white dark:bg-gray-900 border border-indigo-100 dark:border-indigo-800 p-2.5 space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                type="number"
                                min={1}
                                max={48}
                                value={renegotiateCount}
                                onChange={(event) => setRenegotiateCount(event.target.value)}
                                className="p-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-gray-100"
                                placeholder="Qtd parcelas"
                              />
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={renegotiateAmount}
                                onChange={(event) => setRenegotiateAmount(event.target.value)}
                                className="p-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-gray-100"
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

                    <div className={`pt-4 mt-2 border-t border-gray-100 dark:border-gray-800 grid gap-3 ${selectedTx.status === 'pending' ? 'grid-cols-3' : 'grid-cols-2'}`}>
                      {selectedTx.status === 'pending' && (
                        <button
                          onClick={() => {
                            if (!canEdit) return;
                            toggleStatus(selectedTx);
                            setSelectedTx(null);
                          }}
                          disabled={!canEdit}
                          className="py-3 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-xl font-semibold text-sm flex items-center justify-center hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors disabled:opacity-50"
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
                        className="py-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl font-semibold text-sm flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
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
                        className="py-3 bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-xl font-semibold text-sm flex items-center justify-center hover:bg-rose-100 dark:hover:bg-rose-900/50 transition-colors disabled:opacity-50"
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
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-xs shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-150 border border-transparent dark:border-gray-800">
            <div className="flex flex-col items-center text-center space-y-2">
              <div className="w-12 h-12 bg-rose-100 dark:bg-rose-900/30 rounded-full flex items-center justify-center">
                <AlertTriangle size={24} className="text-rose-600 dark:text-rose-400" />
              </div>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{confirmAction.message}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setConfirmAction(null)}
                className="py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl font-semibold text-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
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
