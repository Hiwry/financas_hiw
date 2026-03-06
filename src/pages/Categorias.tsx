import React, { useMemo, useRef, useState } from 'react';
import { useAppStore, suggestCategoryIcon } from '../store';
import { CategoryIcon, availableIcons } from '../components/CategoryIcon';
import {
  Download, Edit2, FileDown, Save, Search, Trash2, Upload, Wand2, X, Users, Sun, Moon, AlertTriangle
} from 'lucide-react';
import { toLocalIsoDate } from '../utils/date';

interface ConfirmAction {
  message: string;
  onConfirm: () => void;
}

type HouseholdRole = 'owner' | 'editor' | 'viewer';

const buildCsv = (rows: Array<Record<string, string | number>>) => {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (value: string | number) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  return [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => escape(row[header] ?? '')).join(',')),
  ].join('\n');
};

const downloadText = (fileName: string, text: string, mimeType: string) => {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};

export const Categorias: React.FC = () => {
  const {
    transactions,
    categories,
    accounts,
    creditCards,
    invoicePayments,
    reminderSettings,
    categoryGoals,
    household,
    updateCategory,
    setCategoryGoal,
    clearCategoryGoal,
    replaceState,
    setHouseholdEnabled,
    setActiveMember,
    addHouseholdMember,
    updateHouseholdMember,
    deleteHouseholdMember,
    canEdit,
  } = useAppStore();

  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [searchIcon, setSearchIcon] = useState('');
  const [goalDrafts, setGoalDrafts] = useState<Record<string, string>>({});
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<HouseholdRole>('editor');
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const restoreInputRef = useRef<HTMLInputElement | null>(null);

  const goalMap = useMemo(
    () => new Map(categoryGoals.map((goal) => [goal.categoryId, goal])),
    [categoryGoals]
  );

  const handleIconSelect = (categoryId: string, iconName: string) => {
    if (!canEdit) return;
    const category = categories.find((candidate) => candidate.id === categoryId);
    if (!category) return;
    updateCategory({ ...category, icon: iconName });
    setEditingCategory(null);
    setSearchIcon('');
  };

  const filteredIcons = Object.keys(availableIcons).filter((iconName) =>
    iconName.toLowerCase().includes(searchIcon.toLowerCase())
  );

  const handleAutoAssign = () => {
    if (!canEdit) return;
    categories.forEach((category) => {
      if (!category.icon || category.icon === 'MoreHorizontal' || category.icon === 'HelpCircle') {
        const suggested = suggestCategoryIcon(category.name, category.type);
        if (suggested !== category.icon) {
          updateCategory({ ...category, icon: suggested });
        }
      }
    });
    alert('Icones sugeridos aplicados com sucesso.');
  };

  const handleExportCsv = () => {
    const rows = transactions.map((transaction) => {
      const categoryName = categories.find((category) => category.id === transaction.categoryId)?.name || '';
      return {
        id: transaction.id,
        tipo: transaction.type,
        valor: transaction.amount,
        data: transaction.date,
        categoria: categoryName,
        descricao: transaction.description || '',
        pagamento: transaction.paymentMethod,
        conta: transaction.account,
        status: transaction.status,
        vencimento: transaction.dueDate || '',
      };
    });

    const csv = buildCsv(rows);
    downloadText(`lancamentos-${toLocalIsoDate()}.csv`, csv, 'text/csv;charset=utf-8');
  };

  const handleExportPdf = () => {
    const popup = window.open('', '_blank');
    if (!popup) {
      return;
    }

    const rows = transactions
      .slice()
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .map((transaction) => {
        const categoryName = categories.find((category) => category.id === transaction.categoryId)?.name || '';
        return `
          <tr>
            <td>${transaction.date}</td>
            <td>${transaction.description || categoryName}</td>
            <td>${transaction.type === 'income' ? 'Receita' : 'Despesa'}</td>
            <td>${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(transaction.amount)}</td>
            <td>${transaction.status === 'paid' ? 'Pago' : 'Pendente'}</td>
          </tr>
        `;
      })
      .join('');

    popup.document.write(`
      <html>
        <head>
          <title>Extrato Financeiro</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
            h1 { margin: 0 0 8px; }
            p { color: #6b7280; margin: 0 0 18px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #e5e7eb; padding: 8px; text-align: left; font-size: 12px; }
            th { background: #f3f4f6; }
          </style>
        </head>
        <body>
          <h1>Extrato Financeiro</h1>
          <p>Gerado em ${new Date().toLocaleString('pt-BR')}</p>
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Descricao</th>
                <th>Tipo</th>
                <th>Valor</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <script>window.print();</script>
        </body>
      </html>
    `);
    popup.document.close();
  };

  const handleBackup = () => {
    const payload = {
      transactions,
      categories,
      accounts,
      creditCards,
      invoicePayments,
      reminderSettings,
      categoryGoals,
      household,
    };
    downloadText(
      `backup-financas-${toLocalIsoDate()}.json`,
      JSON.stringify(payload, null, 2),
      'application/json;charset=utf-8'
    );
  };

  const handleRestoreFile = async (file: File) => {
    try {
      const content = await file.text();
      const parsed = JSON.parse(content);
      if (!parsed || !Array.isArray(parsed.transactions) || !Array.isArray(parsed.categories) || !Array.isArray(parsed.accounts)) {
        alert('Backup invalido.');
        return;
      }

      setConfirmAction({
        message: 'Restaurar backup? Isso substitui todos os seus dados atuais por uma versao anterior.',
        onConfirm: () => {
          replaceState(parsed);
          alert('Backup restaurado com sucesso.');
        },
      });
    } catch (error) {
      console.error(error);
      alert('Falha ao restaurar backup.');
    } finally {
      if (restoreInputRef.current) {
        restoreInputRef.current.value = '';
      }
    }
  };

  const saveCategoryGoal = (categoryId: string) => {
    if (!canEdit) return;
    const draft = goalDrafts[categoryId];
    const parsed = Number(draft);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      clearCategoryGoal(categoryId);
      return;
    }
    setCategoryGoal({ categoryId, monthlyLimit: parsed, alertThreshold: 0.8 });
  };

  return (
    <div className="p-4 space-y-6 pb-24 dark:bg-black min-h-screen">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Configuracoes</h2>
        <button
          onClick={handleAutoAssign}
          disabled={!canEdit}
          className="flex items-center space-x-1 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg text-sm font-medium hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors disabled:opacity-50"
        >
          <Wand2 size={16} />
          <span>Sugerir icones</span>
        </button>
      </div>

      {!canEdit && (
        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 text-sm font-medium">
          Perfil atual em modo somente leitura.
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800 space-y-3">
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Exportacao e backup</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleExportCsv}
            className="py-2.5 rounded-lg bg-gray-100 text-gray-800 text-sm font-semibold flex items-center justify-center"
          >
            <Download size={14} className="mr-1.5" />
            Exportar CSV
          </button>
          <button
            onClick={handleExportPdf}
            className="py-2.5 rounded-lg bg-gray-100 text-gray-800 text-sm font-semibold flex items-center justify-center"
          >
            <FileDown size={14} className="mr-1.5" />
            Exportar PDF
          </button>
          <button
            onClick={handleBackup}
            className="py-2.5 rounded-lg bg-indigo-50 text-indigo-700 text-sm font-semibold flex items-center justify-center"
          >
            <Download size={14} className="mr-1.5" />
            Backup JSON
          </button>
          <button
            onClick={() => restoreInputRef.current?.click()}
            disabled={!canEdit}
            className="py-2.5 rounded-lg bg-emerald-50 text-emerald-700 text-sm font-semibold flex items-center justify-center disabled:opacity-50"
          >
            <Upload size={14} className="mr-1.5" />
            Restaurar
          </button>
        </div>
        <input
          ref={restoreInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void handleRestoreFile(file);
            }
          }}
        />
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800 space-y-3">
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center">
          <Users size={15} className="mr-1.5 text-indigo-500" />
          Modo casal/familia
        </p>
        <label className="inline-flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={household.enabled}
            onChange={(event) => setHouseholdEnabled(event.target.checked)}
            className="w-4 h-4 text-indigo-600 rounded border-gray-300 dark:border-gray-700 dark:bg-gray-800"
          />
          <span>Ativar controle compartilhado com permissoes</span>
        </label>

        <div className="space-y-2">
          <label className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-500 font-semibold">Perfil ativo</label>
          <select
            value={household.activeMemberId}
            onChange={(event) => setActiveMember(event.target.value)}
            className="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 outline-none"
          >
            {household.members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name} ({member.role})
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          {household.members.map((member) => (
            <div key={member.id} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center">
              <input
                value={member.name}
                onChange={(event) => updateHouseholdMember({ ...member, name: event.target.value })}
                className="p-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 outline-none"
                disabled={!canEdit}
              />
              <select
                value={member.role}
                onChange={(event) => updateHouseholdMember({ ...member, role: event.target.value as HouseholdRole })}
                className="p-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 outline-none"
                disabled={!canEdit}
              >
                <option value="owner">owner</option>
                <option value="editor">editor</option>
                <option value="viewer">viewer</option>
              </select>
              <button
                onClick={() => {
                  if (household.members.length <= 1) return;
                  setConfirmAction({
                    message: `Remover o membro "${member.name}"?`,
                    onConfirm: () => deleteHouseholdMember(member.id),
                  });
                }}
                disabled={!canEdit || household.members.length <= 1}
                className="p-2 rounded-lg bg-rose-50 dark:bg-rose-900/10 text-rose-600 dark:text-rose-400 disabled:opacity-50"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-[1fr_auto_auto] gap-2">
          <input
            value={newMemberName}
            onChange={(event) => setNewMemberName(event.target.value)}
            placeholder="Novo membro"
            className="p-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 outline-none"
          />
          <select
            value={newMemberRole}
            onChange={(event) => setNewMemberRole(event.target.value as HouseholdRole)}
            className="p-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 outline-none"
          >
            <option value="editor">editor</option>
            <option value="viewer">viewer</option>
            <option value="owner">owner</option>
          </select>
          <button
            onClick={() => {
              if (!canEdit || !newMemberName.trim()) return;
              addHouseholdMember(newMemberName.trim(), newMemberRole);
              setNewMemberName('');
              setNewMemberRole('editor');
            }}
            disabled={!canEdit}
            className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50 hover:bg-indigo-700 transition-colors"
          >
            Add
          </button>
        </div>
      </div>

      {/* Default Settings Section */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800 space-y-3">
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center justify-between">
          <span className="flex items-center">
            <Save size={15} className="mr-1.5 text-indigo-500" />
            Configuracoes e Tema
          </span>
          <button
            onClick={() => useAppStore().toggleTheme()}
            className="p-2 bg-gray-100 dark:bg-gray-800 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            title="Alternar tema"
          >
            {useAppStore().theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-500">
          Personalize sua experiencia e opcoes padrao.
        </p>
        
        <div className="grid grid-cols-1 gap-4 pt-1">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-gray-500 dark:text-gray-500 uppercase tracking-wider">Forma de Pagamento</label>
            <select
              value={useAppStore().defaultPaymentMethod}
              onChange={(e) => useAppStore().setDefaultPaymentMethod(e.target.value as any)}
              className="w-full p-2.5 bg-gray-50 dark:bg-gray-850 border border-gray-200 dark:border-gray-800 rounded-lg text-sm text-gray-900 dark:text-gray-100 outline-none"
            >
              <option value="pix">PIX</option>
              <option value="credito">Cartao de Credito</option>
              <option value="debito">Cartao de Debito</option>
              <option value="dinheiro">Dinheiro</option>
              <option value="boleto">Boleto</option>
              <option value="transferencia">Transferencia</option>
            </select>
          </div>
          
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-gray-500 dark:text-gray-500 uppercase tracking-wider">Conta</label>
            <select
              value={useAppStore().defaultAccount}
              onChange={(e) => useAppStore().setDefaultAccount(e.target.value)}
              className="w-full p-2.5 bg-gray-50 dark:bg-gray-850 border border-gray-200 dark:border-gray-800 rounded-lg text-sm text-gray-900 dark:text-gray-100 outline-none"
            >
              {accounts.map((acc) => (
                <option key={acc} value={acc}>{acc}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {categories.map((category) => (
          <div key={category.id} className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-white shadow-sm shrink-0"
                  style={{ backgroundColor: category.color || '#cbd5e1' }}
                >
                  <CategoryIcon name={category.icon} type={category.type} size={24} />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">{category.name}</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{category.type === 'income' ? 'Receita' : 'Despesa'}</p>
                </div>
              </div>
              <button
                onClick={() => setEditingCategory(editingCategory === category.id ? null : category.id)}
                className="p-2 text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors bg-gray-50 dark:bg-gray-800 rounded-full"
              >
                {editingCategory === category.id ? <X size={20} /> : <Edit2 size={20} />}
              </button>
            </div>

            {category.type === 'expense' && (
              <div className="mt-3 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-850/50 p-3 space-y-2">
                <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-500">Meta mensal por categoria</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={goalDrafts[category.id] ?? String(goalMap.get(category.id)?.monthlyLimit ?? '')}
                    onChange={(event) => setGoalDrafts((prev) => ({ ...prev, [category.id]: event.target.value }))}
                    placeholder="Limite mensal"
                    className="flex-1 min-w-0 p-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-gray-100"
                    disabled={!canEdit}
                  />
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => saveCategoryGoal(category.id)}
                      disabled={!canEdit}
                      className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center shadow-sm hover:bg-indigo-700 transition-colors whitespace-nowrap"
                    >
                      <Save size={14} className="mr-1.5" />
                      Salvar
                    </button>
                    <button
                      onClick={() => clearCategoryGoal(category.id)}
                      disabled={!canEdit}
                      className="flex-1 px-4 py-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-bold disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors whitespace-nowrap"
                    >
                      Limpar
                    </button>
                  </div>
                </div>
              </div>
            )}

            {editingCategory === category.id && (
              <div className="mt-4 pt-4 border-t border-gray-100 animate-in slide-in-from-top-2 duration-200">
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500" size={16} />
                  <input
                    type="text"
                    placeholder="Buscar icone..."
                    value={searchIcon}
                    onChange={(event) => setSearchIcon(event.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                  />
                </div>

                <div className="grid grid-cols-5 gap-2 max-h-48 overflow-y-auto hide-scrollbar p-1">
                  {filteredIcons.map((iconName) => {
                    const Icon = availableIcons[iconName];
                    const isSelected = category.icon === iconName;
                    return (
                      <button
                        key={iconName}
                        onClick={() => handleIconSelect(category.id, iconName)}
                        className={`flex flex-col items-center justify-center p-2 rounded-xl transition-all ${
                          isSelected
                            ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 ring-2 ring-indigo-500'
                            : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'
                        }`}
                        title={iconName}
                      >
                        <Icon size={24} />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Confirmation Modal */}
      {confirmAction && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200 border border-transparent dark:border-gray-800">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-rose-100 dark:bg-rose-900/20 rounded-full flex items-center justify-center mx-auto mb-4 text-rose-600 dark:text-rose-400">
                <AlertTriangle size={32} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Confirmar Acao</h3>
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
                  className="flex-1 py-3.5 px-4 bg-rose-600 text-white font-bold rounded-2xl hover:bg-rose-700 transition-colors shadow-lg shadow-rose-200 dark:shadow-rose-900/20"
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
