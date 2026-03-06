import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../store';
import { getSpendingInsights } from '../services/geminiService';
import { Send, Bot, User, Loader2, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { toLocalIsoDate } from '../utils/date';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export const Assistente: React.FC = () => {
  const { transactions, categories, markTransactionsPaid } = useAppStore();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'Olá! Sou seu assistente financeiro. Como posso te ajudar hoje? Você pode perguntar coisas como "Onde estou gastando mais este mês?" ou "Como posso reduzir meus gastos?".'
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const normalizeText = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

  const buildNextMonthSimulation = (): string => {
    const now = new Date();
    const monthSnapshots = [0, 1, 2].map((offset) => {
      const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      return { month: d.getMonth(), year: d.getFullYear() };
    });

    const monthKeySet = new Set(monthSnapshots.map((item) => `${item.year}-${item.month}`));
    let incomeTotal = 0;
    let expenseTotal = 0;
    const expenseByCategory: Record<string, number> = {};

    transactions
      .filter((transaction) => transaction.status === 'paid')
      .forEach((transaction) => {
        const date = new Date(transaction.date);
        const key = `${date.getFullYear()}-${date.getMonth()}`;
        if (!monthKeySet.has(key)) return;

        if (transaction.type === 'income') {
          incomeTotal += transaction.amount;
        } else {
          expenseTotal += transaction.amount;
          expenseByCategory[transaction.categoryId] = (expenseByCategory[transaction.categoryId] || 0) + transaction.amount;
        }
      });

    const monthlyIncome = incomeTotal / monthSnapshots.length;
    const monthlyExpense = expenseTotal / monthSnapshots.length;
    const nextBalance = monthlyIncome - monthlyExpense;
    const topCategories = Object.entries(expenseByCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([categoryId, value]) => {
        const name = categories.find((category) => category.id === categoryId)?.name || 'Outros';
        return `- ${name}: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value / monthSnapshots.length)}`;
      });

    const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const monthLabel = nextMonthDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

    return [
      `Simulacao de orcamento para **${monthLabel}** (media dos ultimos 3 meses):`,
      `- Receita estimada: **${formatCurrency(monthlyIncome)}**`,
      `- Despesa estimada: **${formatCurrency(monthlyExpense)}**`,
      `- Saldo projetado: **${formatCurrency(nextBalance)}**`,
      ...(topCategories.length ? ['', 'Categorias que mais pesam:'] : []),
      ...topCategories,
    ]
      .filter(Boolean)
      .join('\n');
  };

  const runLocalAction = (question: string): string | null => {
    const normalized = normalizeText(question);

    if (normalized.includes('quitar pendencias de hoje')) {
      const todayIso = toLocalIsoDate();
      const ids = transactions
        .filter((transaction) => transaction.status === 'pending')
        .filter((transaction) => (transaction.dueDate || transaction.date) <= todayIso)
        .map((transaction) => transaction.id);

      if (!ids.length) {
        return 'Nao encontrei pendencias para quitar hoje.';
      }

      markTransactionsPaid(ids);
      return `Pendencias quitadas: **${ids.length}**.`;
    }

    if (normalized.includes('simular orcamento mes que vem') || normalized.includes('simular orçamento mes que vem')) {
      return buildNextMonthSimulation();
    }

    return null;
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');

    const localActionResponse = runLocalAction(userMsg.content);
    if (localActionResponse) {
      const assistantMsg: Message = { id: (Date.now() + 1).toString(), role: 'assistant', content: localActionResponse };
      setMessages(prev => [...prev, assistantMsg]);
      return;
    }

    setIsLoading(true);

    try {
      const response = await getSpendingInsights(transactions, categories, userMsg.content);
      const assistantMsg: Message = { id: (Date.now() + 1).toString(), role: 'assistant', content: response };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (error) {
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'assistant', content: 'Desculpe, ocorreu um erro ao processar sua solicitação.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const suggestions = [
    "Onde estou gastando mais?",
    "Resumo da semana",
    "Como reduzir gastos?",
    "Quitar pendencias de hoje",
    "Simular orcamento mes que vem",
  ];

  return (
    <div className="absolute inset-0 pb-20 flex flex-col bg-gray-50 dark:bg-black z-10 transition-colors">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 p-4 shadow-sm border-b border-gray-100 dark:border-gray-800 flex items-center space-x-3 shrink-0 transition-colors">
        <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center text-indigo-600 dark:text-indigo-400">
          <Bot size={24} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">Assistente IA</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center"><Sparkles size={10} className="mr-1 text-amber-500"/> Powered by Gemini</p>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 hide-scrollbar">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl p-4 shadow-sm ${
              msg.role === 'user' 
                ? 'bg-indigo-600 text-white rounded-tr-sm' 
                : 'bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 text-gray-800 dark:text-gray-100 rounded-tl-sm transition-colors'
            }`}>
              {msg.role === 'assistant' ? (
                <div className="prose prose-sm prose-indigo max-w-none">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              ) : (
                <p className="text-sm">{msg.content}</p>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl rounded-tl-sm p-4 shadow-sm flex items-center space-x-2 transition-colors">
              <Loader2 size={16} className="animate-spin text-indigo-600 dark:text-indigo-400" />
              <span className="text-sm text-gray-500 dark:text-gray-400">Analisando seus dados...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area (Anchored to bottom) */}
      <div className="shrink-0 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 p-4 transition-colors">
        {/* Suggestions */}
        {messages.length < 3 && (
          <div className="pb-3 flex space-x-2 overflow-x-auto hide-scrollbar">
            {suggestions.map((sug, i) => (
              <button
                key={i}
                onClick={() => setInput(sug)}
                className="whitespace-nowrap px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-xs font-medium rounded-full border border-indigo-100 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
              >
                {sug}
              </button>
            ))}
          </div>
        )}
        <form onSubmit={handleSend} className="flex items-center space-x-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Pergunte sobre suas finanças..."
            className="flex-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 disabled:opacity-50 text-gray-900 dark:text-gray-100 transition-colors"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className={`p-3 rounded-full flex items-center justify-center transition-colors shrink-0 ${
              !input.trim() || isLoading 
                ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600' 
                : 'bg-indigo-600 text-white shadow-md hover:bg-indigo-700'
            }`}
          >
            <Send size={20} className={input.trim() && !isLoading ? 'ml-1' : ''} />
          </button>
        </form>
      </div>
    </div>
  );
};
