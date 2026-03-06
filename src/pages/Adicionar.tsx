import React, { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store';
import { v4 as uuidv4 } from 'uuid';
import { Mic, XCircle, Loader2, Save, Type, Calendar, DollarSign, Tag, CreditCard, ScanLine } from 'lucide-react';
import { categorizeTransaction, extractTransactionFromReceipt } from '../services/geminiService';
import { Transaction } from '../types';
import { Capacitor } from '@capacitor/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { toLocalIsoDate } from '../utils/date';

const NATIVE_SPEECH_TIMEOUT_MS = 22000;
const DEFAULT_INSTALLMENT_COUNT = 1;

const normalizeInstallmentCount = (value: string | number): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_INSTALLMENT_COUNT;
  return Math.min(48, Math.max(1, Math.floor(parsed)));
};

const addMonthsToIsoDate = (isoDate: string, monthsToAdd: number): string => {
  const [yearRaw, monthRaw, dayRaw] = isoDate.split('-').map(Number);
  const year = Number.isFinite(yearRaw) ? yearRaw : new Date().getFullYear();
  const month = Number.isFinite(monthRaw) ? monthRaw : new Date().getMonth() + 1;
  const day = Number.isFinite(dayRaw) ? dayRaw : new Date().getDate();

  const date = new Date(year, month - 1, day);
  date.setMonth(date.getMonth() + monthsToAdd);

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const splitAmountByInstallments = (totalAmount: number, installmentCount: number): number[] => {
  const count = normalizeInstallmentCount(installmentCount);
  const totalCents = Math.max(0, Math.round(totalAmount * 100));
  const baseCents = Math.floor(totalCents / count);
  let remainder = totalCents - baseCents * count;

  return Array.from({ length: count }, () => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    return (baseCents + extra) / 100;
  });
};

export const Adicionar: React.FC<{ onSave: () => void; editTransaction?: Transaction | null; onCancelEdit?: () => void }> = ({
  onSave,
  editTransaction,
  onCancelEdit,
}) => {
  const {
    addTransaction,
    addTransactions,
    updateTransaction,
    updateInstallmentGroupFrom,
    categories,
    accounts,
    creditCards,
    canEdit,
    defaultPaymentMethod,
    defaultAccount,
  } = useAppStore();
  const isNativePlatform = Capacitor.isNativePlatform();

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isProcessingReceipt, setIsProcessingReceipt] = useState(false);
  const [showForm, setShowForm] = useState(true);

  const [type, setType] = useState<'income' | 'expense'>(editTransaction?.type || 'expense');
  const [nature, setNature] = useState<'fixed' | 'variable'>(editTransaction?.nature || 'variable');
  const [amount, setAmount] = useState(editTransaction?.amount?.toString() || '');
  const [date, setDate] = useState(editTransaction?.date || toLocalIsoDate());
  const [categoryId, setCategoryId] = useState(
    editTransaction?.categoryId || categories.find((category) => category.type === (editTransaction?.type || 'expense'))?.id || ''
  );
  const [paymentMethod, setPaymentMethod] = useState<Transaction['paymentMethod']>(
    editTransaction?.paymentMethod || defaultPaymentMethod || 'pix'
  );
  const [account, setAccount] = useState(editTransaction?.account || defaultAccount || accounts[0]);
  const [description, setDescription] = useState(editTransaction?.description || '');
  const [subcategoryId, setSubcategoryId] = useState(editTransaction?.subcategoryId || '');
  const [tagsInput, setTagsInput] = useState(editTransaction?.tags?.join(', ') || '');
  const [recurrence, setRecurrence] = useState(editTransaction?.recurrence || 'none');
  const [status, setStatus] = useState<'paid' | 'pending'>(editTransaction?.status || 'paid');
  const [installmentCountInput, setInstallmentCountInput] = useState(
    String(editTransaction?.installmentCount || DEFAULT_INSTALLMENT_COUNT)
  );
  const [applyToFutureInstallments, setApplyToFutureInstallments] = useState(false);
  const [selectedCreditCardId, setSelectedCreditCardId] = useState(
    editTransaction?.creditCardId ||
      creditCards.find((card) => card.account === editTransaction?.account)?.id ||
      creditCards[0]?.id ||
      ''
  );

  const recognitionRef = useRef<any>(null);
  const receiptInputRef = useRef<HTMLInputElement | null>(null);

  const applyParsedTransaction = (parsed: Partial<Transaction>) => {
    const parsedType = parsed.type || 'expense';
    const parsedPaymentMethod = parsed.paymentMethod || 'pix';
    const candidateCardId = parsed.creditCardId || selectedCreditCardId || creditCards[0]?.id || '';
    const selectedCard = creditCards.find((card) => card.id === candidateCardId);

    setType(parsedType);
    setNature(parsed.nature || 'variable');
    setAmount(parsed.amount?.toString() || amount);
    setDate(parsed.date || toLocalIsoDate());
    setCategoryId(parsed.categoryId || categories.find((category) => category.type === parsedType)?.id || categories[0]?.id || '');
    setPaymentMethod(parsedPaymentMethod);
    setSelectedCreditCardId(parsedPaymentMethod === 'credito' ? candidateCardId : selectedCreditCardId);
    setAccount(parsed.account || selectedCard?.account || accounts[0]);
    setDescription(parsed.description || description);
    setSubcategoryId(parsed.subcategoryId || subcategoryId);
    setTagsInput(parsed.tags ? parsed.tags.join(', ') : tagsInput);
    setRecurrence(parsed.recurrence || 'none');
    setStatus(parsed.status || 'paid');
    setInstallmentCountInput(String(normalizeInstallmentCount(parsed.installmentCount || DEFAULT_INSTALLMENT_COUNT)));
    setShowForm(true);
  };

  const toBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const payload = result.includes(',') ? result.split(',')[1] : result;
        resolve(payload);
      };
      reader.onerror = () => reject(new Error('file-read-error'));
      reader.readAsDataURL(file);
    });

  const handleReceiptFile = async (file: File) => {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      alert('Arquivo grande demais. Use imagem de ate 4MB.');
      return;
    }

    setIsProcessingReceipt(true);
    try {
      const base64 = await toBase64(file);
      const parsed = await extractTransactionFromReceipt(base64, file.type || 'image/jpeg', categories, accounts);
      if (!parsed) {
        alert('Nao consegui interpretar o comprovante. Tente uma foto mais nitida.');
        return;
      }

      applyParsedTransaction(parsed);
    } catch (error) {
      console.error(error);
      alert('Falha ao ler comprovante. Tente novamente.');
    } finally {
      setIsProcessingReceipt(false);
      if (receiptInputRef.current) {
        receiptInputRef.current.value = '';
      }
    }
  };

  const handleVoiceProcess = async (text: string) => {
    setIsProcessing(true);
    try {
      const parsed = await categorizeTransaction(text, categories, accounts);
      if (!parsed) {
        alert('Nao consegui interpretar o audio. Tente de novo falando mais devagar.');
        return;
      }

      applyParsedTransaction(parsed);
    } catch (error) {
      console.error(error);
      alert('Erro ao processar voz. Tente novamente ou preencha manualmente.');
    } finally {
      setIsProcessing(false);
    }
  };

  const stopNativeListening = async () => {
    try {
      await SpeechRecognition.stop();
    } catch (error) {
      console.error('Native stop speech recognition error:', error);
    } finally {
      setIsListening(false);
    }
  };

  const startNativeListening = async () => {
    let partialListener: { remove: () => Promise<void> } | null = null;
    let latestPartialMatch = '';

    try {
      const availability = await SpeechRecognition.available();
      if (!availability.available) {
        alert('Reconhecimento de voz nao disponivel neste dispositivo.');
        return;
      }

      let permissions = await SpeechRecognition.checkPermissions();
      if (permissions.speechRecognition !== 'granted') {
        permissions = await SpeechRecognition.requestPermissions();
      }

      if (permissions.speechRecognition !== 'granted') {
        alert('Permissao de microfone negada. Ative nas configuracoes do app.');
        return;
      }

      setTranscript('');
      setIsListening(true);

      partialListener = await SpeechRecognition.addListener('partialResults', (event: { matches?: string[] }) => {
        const candidate = (event.matches || [])
          .map((item) => item.trim())
          .filter(Boolean)
          .sort((a, b) => b.length - a.length)[0];

        if (!candidate) return;
        latestPartialMatch = candidate;
        setTranscript(candidate);
      });

      const result = await Promise.race([
        SpeechRecognition.start({
          language: 'pt-BR',
          maxResults: 5,
          partialResults: true,
          popup: true,
          prompt: 'Fale o lancamento completo com valor, data e descricao.',
        }),
        new Promise<{ matches?: string[] }>((_, reject) => {
          setTimeout(() => reject(new Error('speech-timeout')), NATIVE_SPEECH_TIMEOUT_MS);
        }),
      ]);

      const bestMatch = [...(result.matches || []), latestPartialMatch]
        .map((item) => (item || '').trim())
        .filter(Boolean)
        .sort((a, b) => b.length - a.length)[0];

      if (!bestMatch) {
        alert('Nao consegui capturar a frase completa. Tente de novo.');
        return;
      }

      setTranscript(bestMatch);
      await handleVoiceProcess(bestMatch);
    } catch (error) {
      console.error('Native speech recognition error:', error);
      alert('Erro ao capturar audio. Tente novamente.');
    } finally {
      if (partialListener) {
        try {
          await partialListener.remove();
        } catch (error) {
          console.error('Native partial listener remove error:', error);
        }
      }
      setIsListening(false);
    }
  };

  useEffect(() => {
    if (isNativePlatform) return;

    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const BrowserSpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognitionRef.current = new BrowserSpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'pt-BR';

      recognitionRef.current.onresult = (event: any) => {
        let finalTranscript = '';
        for (let index = event.resultIndex; index < event.results.length; ++index) {
          if (event.results[index].isFinal) {
            finalTranscript += event.results[index][0].transcript;
          }
        }

        if (finalTranscript) {
          setTranscript(finalTranscript);
          void handleVoiceProcess(finalTranscript);
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, [isNativePlatform]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop?.();
      void SpeechRecognition.removeAllListeners();
    };
  }, []);

  const toggleListening = () => {
    if (isNativePlatform) {
      if (isListening) {
        void stopNativeListening();
      } else {
        void startNativeListening();
      }
      return;
    }

    if (!recognitionRef.current) {
      alert('Reconhecimento de voz nao disponivel neste navegador.');
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    setTranscript('');
    recognitionRef.current.start();
    setIsListening(true);
  };



  useEffect(() => {
    if (!(type === 'expense' && paymentMethod === 'credito')) return;
    const selectedCard = creditCards.find((card) => card.id === selectedCreditCardId) || creditCards[0];
    if (!selectedCard) return;

    if (selectedCard.id !== selectedCreditCardId) {
      setSelectedCreditCardId(selectedCard.id);
    }
    if (account !== selectedCard.account) {
      setAccount(selectedCard.account);
    }
  }, [type, paymentMethod, selectedCreditCardId, creditCards, account]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canEdit) {
      alert('Perfil atual sem permissao para editar.');
      return;
    }
    if (!amount) {
      alert('Informe um valor.');
      return;
    }
    if (!categoryId) {
      alert('Selecione uma categoria para salvar o lancamento.');
      return;
    }
    const parsedAmount = Number.parseFloat(amount.replace(',', '.'));
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      alert('Informe um valor valido.');
      return;
    }

    const parsedInstallmentCount = normalizeInstallmentCount(installmentCountInput);
    const isCreditExpense = type === 'expense' && paymentMethod === 'credito';
    const selectedCard = isCreditExpense
      ? (creditCards.find((card) => card.id === selectedCreditCardId) || creditCards[0])
      : null;

    if (isCreditExpense && !selectedCard) {
      alert('Cadastre um cartao de credito antes de lancar parcelado.');
      return;
    }

    const tags = tagsInput
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag);

    if (editTransaction) {
      const installmentCount = editTransaction.installmentCount || parsedInstallmentCount;

      const updatedTransaction: Transaction = {
        id: editTransaction.id,
        type,
        nature,
        amount: parsedAmount,
        date,
        categoryId,
        paymentMethod: paymentMethod as any,
        account: isCreditExpense ? selectedCard?.account || account : account,
        description,
        subcategoryId,
        tags,
        recurrence: recurrence as any,
        status,
        createdAt: editTransaction.createdAt,
        dueDate: status === 'pending' ? editTransaction.dueDate || date : undefined,
        installmentCount,
        installmentNumber: editTransaction.installmentNumber || (parsedInstallmentCount > 1 ? 1 : undefined),
        installmentGroupId: editTransaction.installmentGroupId,
        creditCardId: isCreditExpense ? selectedCard?.id : undefined,
      };

      if (applyToFutureInstallments && editTransaction.installmentGroupId) {
        updateInstallmentGroupFrom(editTransaction.id, updatedTransaction);
      } else {
        updateTransaction(updatedTransaction);
      }
      onSave();
      return;
    }

    if (parsedInstallmentCount > 1) {
      const createdAt = new Date().toISOString();
      const installmentGroupId = uuidv4();
      const installmentAmounts = splitAmountByInstallments(parsedAmount, parsedInstallmentCount);
      const installmentTransactions: Transaction[] = installmentAmounts.map((installmentAmount, index) => {
        const installmentDate = addMonthsToIsoDate(date, index);

        return {
          id: uuidv4(),
          type,
          nature,
          amount: installmentAmount,
          date: installmentDate,
          categoryId,
          paymentMethod: paymentMethod as any,
          account: isCreditExpense ? selectedCard?.account || account : account,
          description,
          subcategoryId,
          tags,
          recurrence: recurrence as any,
          status,
          createdAt,
          dueDate: status === 'pending' ? installmentDate : undefined,
          installmentCount: parsedInstallmentCount,
          installmentNumber: index + 1,
          installmentGroupId,
          creditCardId: isCreditExpense ? selectedCard?.id : undefined,
        };
      });

      addTransactions(installmentTransactions);
      onSave();
      return;
    }

    const newTransaction: Transaction = {
      id: uuidv4(),
      type,
      nature,
      amount: parsedAmount,
      date,
      categoryId,
      paymentMethod: paymentMethod as any,
      account: isCreditExpense ? selectedCard?.account || account : account,
      description,
      subcategoryId,
      tags,
      recurrence: recurrence as any,
      status,
      createdAt: new Date().toISOString(),
      dueDate: status === 'pending' ? date : undefined,
      installmentCount: parsedInstallmentCount,
      installmentNumber: undefined,
      installmentGroupId: undefined,
      creditCardId: isCreditExpense ? selectedCard?.id : undefined,
    };

    addTransaction(newTransaction);
    onSave();
  };

  return (
    <div className="p-4 space-y-6 pb-24">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">{editTransaction ? 'Editar Lancamento' : 'Novo Lancamento'}</h2>
        {editTransaction && onCancelEdit && (
          <button onClick={onCancelEdit} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors">
            <XCircle size={24} />
          </button>
        )}
      </div>

      {!editTransaction && (
        <div className="bg-gradient-to-br from-indigo-500 to-purple-600 dark:from-indigo-600 dark:to-purple-700 rounded-3xl p-6 text-white shadow-xl flex flex-col items-center justify-center space-y-4 relative overflow-hidden transition-all">
          <div className="absolute top-0 left-0 w-full h-full bg-white opacity-5 pointer-events-none" />
          <button
            onClick={toggleListening}
            disabled={isProcessing}
            className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg ${
              isListening ? 'bg-rose-500 animate-pulse scale-110' : 'bg-white dark:bg-gray-100 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-white'
            } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isProcessing ? <Loader2 size={32} className="animate-spin" /> : isListening ? <Mic size={32} className="text-white" /> : <Mic size={32} />}
          </button>
          <div className="text-center z-10">
            <p className="font-semibold text-lg">{isListening ? 'Ouvindo...' : isProcessing ? 'Processando com IA...' : 'Lancar por Voz'}</p>
            <p className="text-indigo-100 text-sm mt-1 max-w-xs mx-auto">
              {transcript ? `"${transcript}"` : 'Ex: "Paguei 35 reais no ifood ontem no debito"'}
            </p>
            <button
              type="button"
              onClick={() => receiptInputRef.current?.click()}
              disabled={isProcessingReceipt}
              className="mt-4 inline-flex items-center px-3 py-2 rounded-lg bg-white/20 hover:bg-white/30 text-sm font-medium disabled:opacity-60"
            >
              {isProcessingReceipt ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <ScanLine size={14} className="mr-1.5" />}
              Ler comprovante (OCR)
            </button>
          </div>
        </div>
      )}

      <input
        ref={receiptInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void handleReceiptFile(file);
          }
        }}
      />

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-800 space-y-5 transition-colors">
          {!canEdit && (
            <div className="p-3 rounded-xl bg-amber-50 text-amber-700 text-sm font-medium border border-amber-200">
              Perfil atual em modo somente leitura.
            </div>
          )}
          <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setType('expense')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${type === 'expense' ? 'bg-white dark:bg-gray-700 text-rose-600 dark:text-rose-400 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
            >
              Despesa
            </button>
            <button
              type="button"
              onClick={() => setType('income')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${type === 'income' ? 'bg-white dark:bg-gray-700 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
            >
              Receita
            </button>
          </div>

          <div className="flex items-center justify-center space-x-4">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="radio"
                name="status"
                value="paid"
                checked={status === 'paid'}
                onChange={() => setStatus('paid')}
                 className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 dark:bg-gray-800 dark:border-gray-700"
              />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{type === 'income' ? 'Recebido' : 'Pago'}</span>
            </label>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="radio"
                name="status"
                value="pending"
                checked={status === 'pending'}
                onChange={() => setStatus('pending')}
                 className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 dark:bg-gray-800 dark:border-gray-700"
              />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{type === 'income' ? 'A Receber' : 'A Pagar'}</span>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center">
                <DollarSign size={12} className="mr-1" /> Valor
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 font-semibold text-lg text-gray-900 dark:text-gray-100"
                placeholder="0,00"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center">
                <Calendar size={12} className="mr-1" /> Data
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 text-sm text-gray-900 dark:text-gray-300"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center">
              <Type size={12} className="mr-1" /> Descricao
            </label>
            <input
              type="text"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 text-sm text-gray-900 dark:text-gray-100"
              placeholder="Ex: Almoco restaurante X"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center">
                <Tag size={12} className="mr-1" /> Categoria
              </label>
              <select
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                className="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 text-sm text-gray-900 dark:text-gray-300"
              >
                {categories
                  .filter((category) => category.type === type)
                  .map((category) => (
                    <option key={category.id} value={category.id} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                      {category.name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center">
                <CreditCard size={12} className="mr-1" /> Conta
              </label>
              {type === 'expense' && paymentMethod === 'credito' ? (
                <input
                  value={creditCards.find((card) => card.id === selectedCreditCardId)?.account || account}
                  readOnly
                  className="w-full p-2.5 bg-indigo-50 border border-indigo-200 rounded-xl text-sm text-indigo-800"
                />
              ) : (
                <select
                  value={account}
                  onChange={(event) => setAccount(event.target.value)}
                  className="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 text-sm text-gray-900 dark:text-gray-300"
                >
                  {accounts.map((item) => (
                    <option key={item} value={item} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                      {item}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center">
                <Tag size={12} className="mr-1" /> Subcategoria
              </label>
              <input
                type="text"
                value={subcategoryId}
                onChange={(event) => setSubcategoryId(event.target.value)}
                className="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 text-sm text-gray-900 dark:text-gray-100"
                placeholder="Ex: Uber, Luz"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center">
                <Tag size={12} className="mr-1" /> Tags
              </label>
              <input
                type="text"
                value={tagsInput}
                onChange={(event) => setTagsInput(event.target.value)}
                className="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 text-sm text-gray-900 dark:text-gray-100"
                placeholder="Ex: viagem, ifood"
              />
            </div>
          </div>

          <details className="group">
            <summary className="text-sm font-medium text-indigo-600 dark:text-indigo-400 cursor-pointer list-none flex items-center">
              <span className="mr-2">Opcoes Avancadas</span>
              <span className="transition group-open:rotate-180">▼</span>
            </summary>
            <div className="mt-4 space-y-4 p-4 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl border border-indigo-100 dark:border-indigo-800/50">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-indigo-800 uppercase">Natureza</label>
                  <select
                    value={nature}
                    onChange={(event) => setNature(event.target.value as any)}
                    className="w-full p-2 bg-white dark:bg-gray-900 border border-indigo-200 dark:border-indigo-800 rounded-lg text-sm text-gray-900 dark:text-gray-100"
                  >
                    <option value="variable" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">Variavel</option>
                    <option value="fixed" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">Fixo</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-indigo-800 uppercase">Recorrencia</label>
                  <select
                    value={recurrence}
                    onChange={(event) => setRecurrence(event.target.value as any)}
                    className="w-full p-2 bg-white dark:bg-gray-900 border border-indigo-200 dark:border-indigo-800 rounded-lg text-sm text-gray-900 dark:text-gray-100"
                  >
                    <option value="none" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">Nenhuma</option>
                    <option value="monthly" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">Mensal</option>
                    <option value="weekly" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">Semanal</option>
                    <option value="yearly" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">Anual</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-indigo-800 uppercase">Forma de Pagamento</label>
                <select
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value as Transaction['paymentMethod'])}
                  className="w-full p-2 bg-white dark:bg-gray-900 border border-indigo-200 dark:border-indigo-800 rounded-lg text-sm text-gray-900 dark:text-gray-100"
                >
                  <option value="pix" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">PIX</option>
                  <option value="credito" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">Cartao de Credito</option>
                  <option value="debito" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">Cartao de Debito</option>
                  <option value="dinheiro" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">Dinheiro</option>
                  <option value="boleto" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">Boleto</option>
                  <option value="transferencia" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">Transferencia</option>
                </select>
              </div>

              {type === 'expense' && paymentMethod === 'credito' && (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-indigo-800 uppercase">Cartao de Credito</label>
                  {creditCards.length > 0 ? (
                    <>
                      <select
                        value={selectedCreditCardId}
                        onChange={(event) => setSelectedCreditCardId(event.target.value)}
                        className="w-full p-2 bg-white dark:bg-gray-900 border border-indigo-200 dark:border-indigo-800 rounded-lg text-sm text-gray-900 dark:text-gray-300"
                      >
                        {creditCards.map((card) => (
                          <option key={card.id} value={card.id} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                            {card.name} - Fecha {card.closingDay} / Vence {card.dueDay}
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-indigo-700">
                        Limite e faturas podem ser acompanhados na tela de Cartoes.
                      </p>
                    </>
                  ) : (
                    <p className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2">
                      Nenhum cartao cadastrado. Cadastre primeiro em Cartoes.
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-2 mt-4 pt-4 border-t border-indigo-200/50">
                <label className="text-xs font-semibold text-indigo-800 uppercase">Parcelamento / Divisao</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    min={1}
                    max={48}
                    step={1}
                    value={installmentCountInput}
                    disabled={Boolean(editTransaction?.installmentGroupId)}
                    onChange={(event) => setInstallmentCountInput(String(normalizeInstallmentCount(event.target.value)))}
                    className="w-24 p-2 bg-white dark:bg-gray-900 border border-indigo-200 dark:border-indigo-800 rounded-lg text-sm font-semibold text-center disabled:opacity-60 text-gray-900 dark:text-gray-100"
                  />
                  <span className="text-xs text-indigo-700 font-medium">
                    x de{' '}
                    {Number.isFinite(Number.parseFloat(amount.replace(',', '.'))) && Number.parseFloat(amount.replace(',', '.')) > 0
                      ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                          Number.parseFloat(amount.replace(',', '.')) / normalizeInstallmentCount(installmentCountInput)
                        )
                      : 'R$ 0,00'}
                  </span>
                </div>
                {editTransaction?.installmentGroupId && (
                  <p className="text-[11px] text-indigo-700">
                    Esta parcela faz parte de um grupo ja criado. Para alterar o total de parcelas, exclua e relance no formato correto.
                  </p>
                )}
                {editTransaction?.installmentGroupId && (
                  <label className="inline-flex items-center space-x-2 mt-2 text-[11px] text-indigo-800">
                    <input
                      type="checkbox"
                      checked={applyToFutureInstallments}
                      onChange={(event) => setApplyToFutureInstallments(event.target.checked)}
                      className="w-4 h-4 text-indigo-600 rounded"
                    />
                    <span>Aplicar alteracoes desta parcela para as proximas do grupo</span>
                  </label>
                )}
              </div>
            </div>
          </details>

          <button
            type="submit"
            disabled={!canEdit}
            className="w-full py-4 bg-gray-900 text-white rounded-xl font-bold text-lg shadow-md hover:bg-gray-800 transition-colors flex items-center justify-center space-x-2 disabled:opacity-50"
          >
            <Save size={20} />
            <span>{editTransaction ? 'Salvar Alteracoes' : 'Salvar Lancamento'}</span>
          </button>
        </form>
      )}
    </div>
  );
};
