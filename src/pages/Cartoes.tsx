import React, { useMemo, useState } from 'react';
import { useAppStore } from '../store';
import { AlertTriangle, Calendar, CreditCard, Pencil, Percent, Plus, Save, Trash2, Wallet } from 'lucide-react';
import { toLocalIsoDate } from '../utils/date';

interface ConfirmAction {
  message: string;
  onConfirm: () => void;
}

type InvoiceSummary = {
  cycleKey: string;
  total: number;
  paid: number;
  remaining: number;
  dueDate: string;
};

type EditingCardDraft = {
  id: string;
  name: string;
  account: string;
  closingDay: string;
  dueDay: string;
  limit: string;
  interestRateMonthly: string;
};

const clampDay = (value: string | number) => {
  const parsed = Math.floor(Number(value) || 1);
  return Math.min(28, Math.max(1, parsed));
};

export const Cartoes: React.FC = () => {
  const {
    creditCards,
    transactions,
    invoicePayments,
    addCreditCard,
    updateCreditCard,
    deleteCreditCard,
    payCreditCardInvoice,
    canEdit,
  } = useAppStore();

  const [newName, setNewName] = useState('');
  const [newAccount, setNewAccount] = useState('');
  const [newClosingDay, setNewClosingDay] = useState('8');
  const [newDueDay, setNewDueDay] = useState('15');
  const [newLimit, setNewLimit] = useState('');
  const [newInterest, setNewInterest] = useState('12');

  const [editingCard, setEditingCard] = useState<EditingCardDraft | null>(null);
  const [paying, setPaying] = useState<{
    cardId: string;
    cycleKey: string;
    amount: string;
    paidAt: string;
  } | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const invoicesByCard = useMemo(() => {
    const map = new Map<string, InvoiceSummary[]>();

    for (const card of creditCards) {
      const grouped = new Map<string, number>();

      transactions
        .filter((transaction) =>
          transaction.type === 'expense' &&
          transaction.paymentMethod === 'credito' &&
          transaction.creditCardId === card.id &&
          transaction.status === 'pending' &&
          Boolean(transaction.creditCardCycleKey)
        )
        .forEach((transaction) => {
          const cycleKey = transaction.creditCardCycleKey as string;
          grouped.set(cycleKey, (grouped.get(cycleKey) || 0) + transaction.amount);
        });

      const summaries: InvoiceSummary[] = Array.from(grouped.entries())
        .map(([cycleKey, total]) => {
          const paid = invoicePayments
            .filter((payment) => payment.cardId === card.id && payment.cycleKey === cycleKey)
            .reduce((sum, payment) => sum + payment.amount, 0);
          const remaining = Math.max(0, total - paid);
          const [yearRaw, monthRaw] = cycleKey.split('-').map(Number);
          const dueDate = new Date(yearRaw, (monthRaw || 1) - 1, clampDay(card.dueDay));
          const dueIso = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}-${String(dueDate.getDate()).padStart(2, '0')}`;

          return {
            cycleKey,
            total,
            paid,
            remaining,
            dueDate: dueIso,
          };
        })
        .sort((a, b) => a.cycleKey.localeCompare(b.cycleKey));

      map.set(card.id, summaries);
    }

    return map;
  }, [creditCards, transactions, invoicePayments]);

  const handleCreateCard = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canEdit) return;
    if (!newName.trim()) return;

    addCreditCard({
      name: newName.trim(),
      account: (newAccount.trim() || newName.trim()),
      closingDay: clampDay(newClosingDay),
      dueDay: clampDay(newDueDay),
      limit: Math.max(0, Number(newLimit) || 0),
      interestRateMonthly: Math.max(0, Number(newInterest) || 0),
    });

    setNewName('');
    setNewAccount('');
    setNewClosingDay('8');
    setNewDueDay('15');
    setNewLimit('');
    setNewInterest('12');
  };

  const startEditCard = (cardId: string) => {
    const card = creditCards.find((item) => item.id === cardId);
    if (!card) return;

    setEditingCard({
      id: card.id,
      name: card.name,
      account: card.account,
      closingDay: String(card.closingDay),
      dueDay: String(card.dueDay),
      limit: String(card.limit),
      interestRateMonthly: String(card.interestRateMonthly),
    });
  };

  const saveEditCard = () => {
    if (!editingCard || !canEdit) return;
    const existing = creditCards.find((card) => card.id === editingCard.id);
    if (!existing) return;

    updateCreditCard({
      ...existing,
      name: editingCard.name.trim() || existing.name,
      account: editingCard.account.trim() || existing.account,
      closingDay: clampDay(editingCard.closingDay),
      dueDay: clampDay(editingCard.dueDay),
      limit: Math.max(0, Number(editingCard.limit) || 0),
      interestRateMonthly: Math.max(0, Number(editingCard.interestRateMonthly) || 0),
    });
    setEditingCard(null);
  };

  const handlePayInvoice = () => {
    if (!paying || !canEdit) return;
    const amount = Math.max(0, Number(paying.amount) || 0);
    if (!amount) return;
    payCreditCardInvoice(paying.cardId, paying.cycleKey, amount, paying.paidAt);
    setPaying(null);
  };

  return (
    <div className="p-4 space-y-6 pb-24">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Cartoes de Credito</h2>
        {!canEdit && (
          <span className="text-xs font-semibold px-2 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
            Somente leitura
          </span>
        )}
      </div>

      <form onSubmit={handleCreateCard} className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800 shadow-sm space-y-3 transition-colors">
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center">
          <Plus size={16} className="mr-1.5 text-indigo-500 dark:text-indigo-400" />
          Novo cartao
        </p>
        <div className="grid grid-cols-2 gap-2">
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Nome do cartao"
            className="p-2.5 bg-gray-50 dark:bg-gray-850 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
          />
          <input
            value={newAccount}
            onChange={(event) => setNewAccount(event.target.value)}
            placeholder="Conta vinculada"
            className="p-2.5 bg-gray-50 dark:bg-gray-850 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
          />
          <input
            type="number"
            min={1}
            max={28}
            value={newClosingDay}
            onChange={(event) => setNewClosingDay(event.target.value)}
            placeholder="Fechamento"
            className="p-2.5 bg-gray-50 dark:bg-gray-850 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
          />
          <input
            type="number"
            min={1}
            max={28}
            value={newDueDay}
            onChange={(event) => setNewDueDay(event.target.value)}
            placeholder="Vencimento"
            className="p-2.5 bg-gray-50 dark:bg-gray-850 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
          />
          <input
            type="number"
            min={0}
            step="0.01"
            value={newLimit}
            onChange={(event) => setNewLimit(event.target.value)}
            placeholder="Limite"
            className="p-2.5 bg-gray-50 dark:bg-gray-850 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
          />
          <input
            type="number"
            min={0}
            step="0.01"
            value={newInterest}
            onChange={(event) => setNewInterest(event.target.value)}
            placeholder="Juros % am"
            className="p-2.5 bg-gray-50 dark:bg-gray-850 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
          />
        </div>
        <button
          type="submit"
          disabled={!canEdit}
          className="w-full py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50"
        >
          Cadastrar cartao
        </button>
      </form>

      <div className="space-y-4">
        {creditCards.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 text-center border border-gray-100 dark:border-gray-800 text-gray-500 dark:text-gray-400 transition-colors">
            Nenhum cartao cadastrado.
          </div>
        ) : (
          creditCards.map((card) => {
            const invoices = invoicesByCard.get(card.id) || [];
            const outstanding = invoices.reduce((sum, invoice) => sum + invoice.remaining, 0);
            const available = card.limit - outstanding;
            const isNegative = available < 0;

            return (
              <div key={card.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-4 space-y-4 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center">
                      <CreditCard size={18} className="mr-2 text-indigo-500 dark:text-indigo-400" />
                      {card.name}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{card.account}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => startEditCard(card.id)}
                      className="p-2 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                      aria-label={`Editar ${card.name}`}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => {
                        if (!canEdit) return;
                        setConfirmAction({
                          message: `Remover o cartão "${card.name}" e todas as suas despesas pendentes?`,
                          onConfirm: () => deleteCreditCard(card.id),
                        });
                      }}
                      className="p-2 rounded-full bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/50 transition-colors"
                      aria-label={`Excluir ${card.name}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                    <p className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold flex items-center">
                      <Wallet size={12} className="mr-1 text-gray-400 dark:text-gray-500" />
                      Limite disponivel
                    </p>
                    <p className={`font-bold text-lg ${isNegative ? 'text-rose-600 dark:text-rose-400' : 'text-gray-900 dark:text-gray-100'}`}>
                      {formatCurrency(available)}
                    </p>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 space-y-1">
                    <p className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">Configuracao</p>
                    <p className="text-sm text-gray-800 dark:text-gray-200 flex items-center">
                      <Calendar size={12} className="mr-1.5 text-indigo-500 dark:text-indigo-400" />
                      Fecha dia {card.closingDay} / vence dia {card.dueDay}
                    </p>
                    <p className="text-sm text-gray-800 dark:text-gray-200 flex items-center">
                      <Percent size={12} className="mr-1.5 text-indigo-500 dark:text-indigo-400" />
                      {card.interestRateMonthly}% a.m.
                    </p>
                  </div>
                </div>

                {editingCard?.id === card.id && (
                  <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/50 rounded-xl p-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        value={editingCard.name}
                        onChange={(event) => setEditingCard((prev) => prev ? { ...prev, name: event.target.value } : prev)}
                        className="p-2 bg-white dark:bg-gray-800 border border-indigo-200 dark:border-indigo-700/50 rounded-lg text-sm text-gray-900 dark:text-gray-100"
                        placeholder="Nome"
                      />
                      <input
                        value={editingCard.account}
                        onChange={(event) => setEditingCard((prev) => prev ? { ...prev, account: event.target.value } : prev)}
                        className="p-2 bg-white dark:bg-gray-800 border border-indigo-200 dark:border-indigo-700/50 rounded-lg text-sm text-gray-900 dark:text-gray-100"
                        placeholder="Conta"
                      />
                      <input
                        type="number"
                        min={1}
                        max={28}
                        value={editingCard.closingDay}
                        onChange={(event) => setEditingCard((prev) => prev ? { ...prev, closingDay: event.target.value } : prev)}
                        className="p-2 bg-white dark:bg-gray-800 border border-indigo-200 dark:border-indigo-700/50 rounded-lg text-sm text-gray-900 dark:text-gray-100"
                        placeholder="Fechamento"
                      />
                      <input
                        type="number"
                        min={1}
                        max={28}
                        value={editingCard.dueDay}
                        onChange={(event) => setEditingCard((prev) => prev ? { ...prev, dueDay: event.target.value } : prev)}
                        className="p-2 bg-white dark:bg-gray-800 border border-indigo-200 dark:border-indigo-700/50 rounded-lg text-sm text-gray-900 dark:text-gray-100"
                        placeholder="Vencimento"
                      />
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={editingCard.limit}
                        onChange={(event) => setEditingCard((prev) => prev ? { ...prev, limit: event.target.value } : prev)}
                        className="p-2 bg-white dark:bg-gray-800 border border-indigo-200 dark:border-indigo-700/50 rounded-lg text-sm text-gray-900 dark:text-gray-100"
                        placeholder="Limite"
                      />
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={editingCard.interestRateMonthly}
                        onChange={(event) => setEditingCard((prev) => prev ? { ...prev, interestRateMonthly: event.target.value } : prev)}
                        className="p-2 bg-white dark:bg-gray-800 border border-indigo-200 dark:border-indigo-700/50 rounded-lg text-sm text-gray-900 dark:text-gray-100"
                        placeholder="Juros % am"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={saveEditCard}
                        disabled={!canEdit}
                        className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50 flex items-center justify-center transition-colors hover:bg-indigo-700"
                      >
                        <Save size={14} className="mr-1.5" />
                        Salvar cartao
                      </button>
                      <button
                        onClick={() => setEditingCard(null)}
                        className="flex-1 py-2 bg-white dark:bg-gray-800 border border-indigo-200 dark:border-indigo-700/50 text-indigo-700 dark:text-indigo-400 rounded-lg text-sm font-semibold transition-colors hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">Faturas em aberto</p>
                  {invoices.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">Sem faturas pendentes.</p>
                  ) : (
                    invoices.map((invoice) => {
                      const partial = invoice.paid > 0 && invoice.remaining > 0;
                      return (
                        <div key={`${card.id}-${invoice.cycleKey}`} className="border border-gray-100 dark:border-gray-800 rounded-xl p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-semibold text-gray-900 dark:text-gray-100">Ciclo {invoice.cycleKey}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">Vencimento: {new Date(`${invoice.dueDate}T00:00:00`).toLocaleDateString('pt-BR')}</p>
                            </div>
                            {partial && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                                <AlertTriangle size={12} className="mr-1" />
                                Parcial
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-3 gap-2 text-xs">
                            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2">
                              <p className="text-gray-500 dark:text-gray-400">Total</p>
                              <p className="font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(invoice.total)}</p>
                            </div>
                            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2">
                              <p className="text-gray-500 dark:text-gray-400">Pago</p>
                              <p className="font-semibold text-emerald-700 dark:text-emerald-400">{formatCurrency(invoice.paid)}</p>
                            </div>
                            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2">
                              <p className="text-gray-500 dark:text-gray-400">Restante</p>
                              <p className="font-semibold text-rose-700 dark:text-rose-400">{formatCurrency(invoice.remaining)}</p>
                            </div>
                          </div>

                          {paying?.cardId === card.id && paying?.cycleKey === invoice.cycleKey ? (
                            <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/50 rounded-lg p-2.5 space-y-2">
                              <input
                                type="number"
                                min={0}
                                max={invoice.remaining}
                                step="0.01"
                                value={paying.amount}
                                onChange={(event) => setPaying((prev) => prev ? { ...prev, amount: event.target.value } : prev)}
                                className="w-full p-2 bg-white dark:bg-gray-800 border border-indigo-200 dark:border-indigo-700/50 rounded-lg text-sm text-gray-900 dark:text-gray-100"
                              />
                              <input
                                type="date"
                                value={paying.paidAt}
                                onChange={(event) => setPaying((prev) => prev ? { ...prev, paidAt: event.target.value } : prev)}
                                className="w-full p-2 bg-white dark:bg-gray-800 border border-indigo-200 dark:border-indigo-700/50 rounded-lg text-sm text-gray-900 dark:text-gray-100"
                              />
                              <div className="grid grid-cols-3 gap-2">
                                <button
                                  onClick={() => setPaying((prev) => prev ? { ...prev, amount: String(invoice.remaining) } : prev)}
                                  className="col-span-1 py-2 bg-white dark:bg-gray-800 border border-indigo-200 dark:border-indigo-700/50 text-indigo-700 dark:text-indigo-400 rounded-lg text-xs font-semibold transition-colors hover:bg-gray-50 dark:hover:bg-gray-700"
                                >
                                  Pagar total
                                </button>
                                <button
                                  onClick={handlePayInvoice}
                                  disabled={!canEdit}
                                  className="col-span-1 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold disabled:opacity-50 transition-colors hover:bg-indigo-700"
                                >
                                  Confirmar
                                </button>
                                <button
                                  onClick={() => setPaying(null)}
                                  className="col-span-1 py-2 bg-white dark:bg-gray-800 border border-indigo-200 dark:border-indigo-700/50 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-semibold transition-colors hover:bg-gray-50 dark:hover:bg-gray-700"
                                >
                                  Cancelar
                                </button>
                              </div>
                              {Number(paying.amount) < invoice.remaining && Number(paying.amount) > 0 && (
                                <p className="text-[11px] text-amber-700 dark:text-amber-400 flex items-center">
                                  <AlertTriangle size={12} className="mr-1" />
                                  Pagamento parcial pode gerar juros no proximo ciclo.
                                </p>
                              )}
                            </div>
                          ) : (
                            <button
                              onClick={() =>
                                setPaying({
                                  cardId: card.id,
                                  cycleKey: invoice.cycleKey,
                                  amount: String(invoice.remaining),
                                  paidAt: toLocalIsoDate(),
                                })
                              }
                              disabled={!canEdit || invoice.remaining <= 0}
                              className="w-full py-2.5 rounded-lg text-sm font-semibold bg-indigo-600 text-white disabled:opacity-50 transition-colors hover:bg-indigo-700"
                            >
                              Registrar pagamento
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Confirmation Modal */}
      {confirmAction && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200 border border-transparent dark:border-gray-800">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-rose-100 dark:bg-rose-900/30 rounded-full flex items-center justify-center mx-auto mb-4 text-rose-600 dark:text-rose-400">
                <AlertTriangle size={32} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Confirmar Exclusão</h3>
              <p className="text-gray-500 dark:text-gray-400 mb-6">{confirmAction.message}</p>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmAction(null)}
                  className="flex-1 py-3.5 px-4 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold rounded-2xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    confirmAction.onConfirm();
                    setConfirmAction(null);
                  }}
                  className="flex-1 py-3.5 px-4 bg-rose-600 text-white font-bold rounded-2xl hover:bg-rose-700 transition-colors shadow-lg shadow-rose-200 dark:shadow-none"
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
