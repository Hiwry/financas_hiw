import { Transaction, Category } from '../types';
import { getEnv } from './env';
import { isSupabaseConfigured, supabase } from './supabaseClient';
import { toLocalIsoDate } from '../utils/date';

const GEMINI_TIMEOUT_MS = 25000;
const GEMINI_FUNCTION_NAME = getEnv('VITE_GEMINI_FUNCTION_NAME', 'GEMINI_FUNCTION_NAME') || 'gemini-proxy';

const normalize = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const todayAtMidnight = (): Date => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

const toIsoDate = (date: Date): string => {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return toLocalIsoDate(value);
};

const monthMap: Record<string, number> = {
  janeiro: 0,
  jan: 0,
  fevereiro: 1,
  fev: 1,
  marco: 2,
  mar: 2,
  abril: 3,
  abr: 3,
  maio: 4,
  jun: 5,
  junho: 5,
  julho: 6,
  jul: 6,
  agosto: 7,
  ago: 7,
  setembro: 8,
  set: 8,
  outubro: 9,
  out: 9,
  novembro: 10,
  nov: 10,
  dezembro: 11,
  dez: 11,
};

const buildValidDate = (year: number, monthIndex: number, day: number): Date | null => {
  const parsed = new Date(year, monthIndex, day);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.getFullYear() !== year || parsed.getMonth() !== monthIndex || parsed.getDate() !== day) return null;
  parsed.setHours(0, 0, 0, 0);
  return parsed;
};

const inferDateFromText = (text: string): string => {
  const normalized = normalize(text);
  const base = todayAtMidnight();

  if (normalized.includes('anteontem')) {
    base.setDate(base.getDate() - 2);
    return toIsoDate(base);
  }

  if (normalized.includes('ontem')) {
    base.setDate(base.getDate() - 1);
    return toIsoDate(base);
  }

  if (normalized.includes('amanha')) {
    base.setDate(base.getDate() + 1);
    return toIsoDate(base);
  }

  if (normalized.includes('hoje')) {
    return toIsoDate(base);
  }

  const dateMatch = text.match(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\b/);
  if (dateMatch) {
    const day = Number(dateMatch[1]);
    const month = Number(dateMatch[2]);
    const yearPart = dateMatch[3];
    const currentYear = new Date().getFullYear();
    const year = yearPart ? (yearPart.length === 2 ? 2000 + Number(yearPart) : Number(yearPart)) : currentYear;

    const parsed = buildValidDate(year, month - 1, day);
    if (parsed) return toIsoDate(parsed);
  }

  const dayMonthNameMatch = normalized.match(/\b(?:dia\s+)?(\d{1,2})\s+de\s+([a-z]{3,9})(?:\s+de\s+(\d{2,4}))?\b/);
  if (dayMonthNameMatch) {
    const day = Number(dayMonthNameMatch[1]);
    const monthName = dayMonthNameMatch[2];
    const yearPart = dayMonthNameMatch[3];
    const monthIndex = monthMap[monthName];

    if (typeof monthIndex === 'number') {
      const currentYear = new Date().getFullYear();
      const year = yearPart ? (yearPart.length === 2 ? 2000 + Number(yearPart) : Number(yearPart)) : currentYear;
      const parsed = buildValidDate(year, monthIndex, day);
      if (parsed) return toIsoDate(parsed);
    }
  }

  const dayOnlyMatch = normalized.match(/\bdia\s+(\d{1,2})\b/);
  if (dayOnlyMatch) {
    const day = Number(dayOnlyMatch[1]);
    const now = todayAtMidnight();
    const parsed = buildValidDate(now.getFullYear(), now.getMonth(), day);
    if (parsed) return toIsoDate(parsed);
  }

  return toIsoDate(base);
};

const inferTypeFromText = (text: string): 'income' | 'expense' => {
  const normalized = normalize(text);
  const incomeHints = ['recebi', 'ganhei', 'entrou', 'vendi', 'salario', 'renda', 'reembolso'];
  const expenseHints = ['gastei', 'paguei', 'comprei', 'fatura', 'conta', 'despesa'];

  if (incomeHints.some((hint) => normalized.includes(hint))) return 'income';
  if (expenseHints.some((hint) => normalized.includes(hint))) return 'expense';
  return 'expense';
};

const inferAmountFromText = (text: string): number | null => {
  const currencyMatch = text.match(/(\d+(?:[.,]\d{1,2})?)\s*(?:reais|real|r\$)/i);
  if (currencyMatch) return Number(currencyMatch[1].replace(',', '.'));

  const numberMatch = text.match(/\b(\d{1,6}(?:[.,]\d{1,2})?)\b/);
  if (numberMatch) return Number(numberMatch[1].replace(',', '.'));
  return null;
};

const inferPaymentMethod = (text: string): Transaction['paymentMethod'] => {
  const normalized = normalize(text);
  if (normalized.includes('credito')) return 'credito';
  if (normalized.includes('debito')) return 'debito';
  if (normalized.includes('boleto')) return 'boleto';
  if (normalized.includes('transferencia') || normalized.includes('ted')) return 'transferencia';
  if (normalized.includes('dinheiro')) return 'dinheiro';
  return 'pix';
};

const inferInstallmentCount = (text: string): number => {
  const byX = text.match(/\b([1-9]|[1-3][0-9]|4[0-8])\s*x\b/i);
  if (byX) return Number(byX[1]);

  const byInstallments = text.match(/\bem\s+([1-9]|[1-3][0-9]|4[0-8])\s*parcelas?\b/i);
  if (byInstallments) return Number(byInstallments[1]);

  const byInstallmentsLoose = text.match(/\b([1-9]|[1-3][0-9]|4[0-8])\s*parcelas?\b/i);
  if (byInstallmentsLoose) return Number(byInstallmentsLoose[1]);

  return 1;
};

const inferRecurrence = (text: string): Transaction['recurrence'] => {
  const normalized = normalize(text);
  if (normalized.includes('todo mes') || normalized.includes('mensal')) return 'monthly';
  if (normalized.includes('toda semana') || normalized.includes('semanal')) return 'weekly';
  if (normalized.includes('quinzenal')) return 'biweekly';
  if (normalized.includes('anual') || normalized.includes('todo ano')) return 'yearly';
  return 'none';
};

const inferStatus = (text: string): Transaction['status'] => {
  const normalized = normalize(text);
  const pendingHints = ['vou pagar', 'a pagar', 'a receber', 'amanha', 'depois'];
  if (pendingHints.some((hint) => normalized.includes(hint))) return 'pending';
  return 'paid';
};

const inferAccount = (text: string, accounts: string[]): string => {
  const normalizedText = normalize(text);
  const found = accounts.find((account) => normalizedText.includes(normalize(account)));
  return found || accounts[0];
};

const inferSubcategory = (text: string): string => {
  const words = text
    .replace(/[^A-Za-zÀ-ÿ0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);

  const connectors = new Set(['no', 'na', 'em', 'do', 'da']);
  const stopWords = new Set([
    'hoje',
    'ontem',
    'anteontem',
    'amanha',
    'debito',
    'credito',
    'pix',
    'dinheiro',
    'boleto',
    'transferencia',
    'cartao',
    'com',
    'de',
    'para',
    'por',
    'a',
    'o',
    'e',
  ]);

  for (let i = 0; i < words.length - 1; i += 1) {
    if (!connectors.has(normalize(words[i]))) continue;

    const picked: string[] = [];
    for (let j = i + 1; j < words.length && picked.length < 3; j += 1) {
      const token = words[j];
      const normalizedToken = normalize(token);
      if (!normalizedToken || stopWords.has(normalizedToken) || connectors.has(normalizedToken)) break;
      if (/^\d/.test(token)) break;
      picked.push(token);
    }

    if (picked.length) return picked.join(' ');
  }

  const fallback = text
    .replace(/[0-9.,]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .slice(0, 3)
    .join(' ')
    .trim();

  return fallback || 'Geral';
};

const inferDescription = (text: string): string => {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'Lancamento por voz';
  return cleaned.length > 60 ? `${cleaned.slice(0, 57)}...` : cleaned;
};

const categoryKeywordMap: Array<{ keywords: string[]; categoryName: string }> = [
  { keywords: ['ifood', 'mercado', 'restaurante', 'almoco', 'jantar', 'lanche', 'comida'], categoryName: 'Alimentação' },
  { keywords: ['uber', 'gasolina', 'onibus', 'metro', 'transporte'], categoryName: 'Transporte' },
  { keywords: ['aluguel', 'condominio', 'moradia', 'casa'], categoryName: 'Moradia' },
  { keywords: ['farmacia', 'medico', 'hospital', 'saude'], categoryName: 'Saúde' },
  { keywords: ['salario', 'pagamento', 'renda'], categoryName: 'Salário' },
  { keywords: ['freela', 'projeto', 'servico'], categoryName: 'Freelance' },
  { keywords: ['investimento', 'dividendo', 'rendimento'], categoryName: 'Investimentos' },
];

const findCategoryId = (
  type: 'income' | 'expense',
  categoryName: string | undefined,
  categories: Category[],
  context: string
): string => {
  const normalizedCategoryName = normalize(categoryName || '');
  const categoriesOfType = categories.filter((category) => category.type === type);

  const exact = categoriesOfType.find((category) => normalize(category.name) === normalizedCategoryName);
  if (exact) return exact.id;

  const partial = categoriesOfType.find((category) => normalizedCategoryName && normalize(category.name).includes(normalizedCategoryName));
  if (partial) return partial.id;

  const normalizedContext = normalize(context);
  for (const mapping of categoryKeywordMap) {
    const matchesKeyword = mapping.keywords.some((keyword) => normalizedContext.includes(normalize(keyword)));
    if (!matchesKeyword) continue;

    const category = categoriesOfType.find((item) => normalize(item.name) === normalize(mapping.categoryName));
    if (category) return category.id;
  }

  const others = categoriesOfType.find((category) => normalize(category.name) === 'outros');
  return others?.id || categoriesOfType[0]?.id || '';
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs = GEMINI_TIMEOUT_MS): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`Gemini timeout after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const invokeGeminiProxy = async <T>(body: Record<string, unknown>): Promise<T | null> => {
  if (!isSupabaseConfigured || !supabase) return null;

  const response = await withTimeout(
    supabase.functions.invoke<T>(GEMINI_FUNCTION_NAME, {
      body,
    })
  );

  if (response.error) {
    console.error('Gemini edge function error:', response.error.message);
    return null;
  }

  return response.data || null;
};

const buildTransactionFromParsed = (
  parsed: Record<string, unknown>,
  sourceText: string,
  categories: Category[],
  accounts: string[]
): Partial<Transaction> => {
  const text = sourceText.trim();
  const inferredType = inferTypeFromText(text);
  const type = parsed.type === 'income' || parsed.type === 'expense' ? parsed.type : inferredType;
  const amount = typeof parsed.amount === 'number' && parsed.amount > 0 ? parsed.amount : inferAmountFromText(text);
  
  // Detecta se o texto do usuário contém QUALQUER referência a data
  const textContainsAnyDateReference = (input: string): boolean => {
    const n = normalize(input);
    // Palavras relativas
    if (/amanh[aã]|ontem|anteontem|hoje/i.test(input)) return true;
    // Padrões numéricos tipo DD/MM ou DD-MM
    if (/\b\d{1,2}[\/\-]\d{1,2}\b/.test(input)) return true;
    // Nome de mês (janeiro, fev, março, etc.)
    if (Object.keys(monthMap).some((m) => n.includes(m))) return true;
    // "dia 5", "dia 15" etc.
    if (/\bdia\s+\d{1,2}\b/i.test(input)) return true;
    return false;
  };

  // Se o texto NÃO tem NENHUMA referência a data → usa data de hoje, ignorando a IA
  // Se tem referência relativa (hoje, ontem, amanhã) → usa inferência local
  // Se tem referência específica (DD/MM, nome mês) → confia na inferência local primeiro
  let date: string;
  if (!textContainsAnyDateReference(text)) {
    // Sem data mencionada → SEMPRE hoje
    date = toLocalIsoDate();
  } else if (/amanh[aã]|ontem|anteontem|hoje/i.test(text)) {
    // Palavra relativa → inferência local (mais confiável que a IA)
    date = inferDateFromText(text);
  } else {
    // Tem alguma referência de data específica → tenta inferência local primeiro, depois AI
    const localDate = inferDateFromText(text);
    const isLocalToday = localDate === toLocalIsoDate();
    // Se a inferência local caiu no fallback (hoje), prefere a data do AI se válida
    if (isLocalToday && typeof parsed.date === 'string' && parsed.date.trim().length >= 10) {
      date = parsed.date.slice(0, 10);
    } else {
      date = localDate;
    }
  }
  
  if (!date || date.length < 10) {
    date = toLocalIsoDate();
  }

  const description = String(parsed.description || parsed.merchant || '').trim() || inferDescription(text);
  const subcategory = String(parsed.subcategory || parsed.merchant || '').trim() || inferSubcategory(text);
  const categoryId = findCategoryId(type, String(parsed.categoryName || ''), categories, `${text} ${description} ${subcategory}`);
  const paymentMethod = inferPaymentMethod(String(parsed.paymentMethod || text));
  const parsedInstallmentCount = Number.isFinite(Number(parsed.installmentCount)) ? Number(parsed.installmentCount) : inferInstallmentCount(text);
  const installmentCount = Math.min(48, Math.max(1, Math.floor(parsedInstallmentCount)));

  const tags = Array.isArray(parsed.tags)
    ? parsed.tags.filter((tag) => typeof tag === 'string' && tag.trim())
    : [];

  return {
    type,
    nature: parsed.nature === 'fixed' ? 'fixed' : 'variable',
    amount: amount && amount > 0 ? amount : 0,
    date,
    categoryId,
    subcategoryId: subcategory,
    paymentMethod,
    account: inferAccount(String(parsed.account || text), accounts),
    recurrence: (parsed.recurrence as Transaction['recurrence']) || inferRecurrence(text),
    status: parsed.status === 'pending' || parsed.status === 'paid' ? parsed.status : inferStatus(text),
    description,
    installmentCount,
    tags: tags.length ? tags : [normalize(subcategory)].filter(Boolean),
  };
};

export const categorizeTransaction = async (
  text: string,
  categories: Category[],
  accounts: string[]
): Promise<Partial<Transaction> | null> => {
  try {
    if (!text.trim()) return null;

    const categoryNames = categories.map((category) => category.name);
    const accountNames = accounts;

    const remoteData = await invokeGeminiProxy<{ parsed?: Record<string, unknown> }>({
      action: 'categorize',
      text,
      categoryNames,
      accountNames,
      todayDate: toLocalIsoDate(),
    });

    const parsed = remoteData?.parsed || {};
    return buildTransactionFromParsed(parsed, text, categories, accounts);
  } catch (error) {
    console.error('Error categorizing transaction:', error);
    return buildTransactionFromParsed({}, text, categories, accounts);
  }
};

export const extractTransactionFromReceipt = async (
  imageBase64: string,
  mimeType: string,
  categories: Category[],
  accounts: string[]
): Promise<Partial<Transaction> | null> => {
  try {
    if (!imageBase64.trim()) return null;

    const remoteData = await invokeGeminiProxy<{ parsed?: Record<string, unknown> }>({
      action: 'ocr_receipt',
      imageBase64,
      mimeType,
      categoryNames: categories.map((category) => category.name),
      accountNames: accounts,
    });

    const parsed = remoteData?.parsed || {};
    const sourceText = [
      String(parsed.description || ''),
      String(parsed.merchant || ''),
      String(parsed.paymentMethod || ''),
      String(parsed.amount || ''),
      String(parsed.date || ''),
    ]
      .join(' ')
      .trim();

    return buildTransactionFromParsed(parsed, sourceText, categories, accounts);
  } catch (error) {
    console.error('Error reading receipt:', error);
    return null;
  }
};

export const getSpendingInsights = async (
  transactions: Transaction[],
  categories: Category[],
  question: string
): Promise<string> => {
  try {
    const simplifiedTx = transactions.map((transaction) => ({
      type: transaction.type,
      amount: transaction.amount,
      date: transaction.date,
      category: categories.find((category) => category.id === transaction.categoryId)?.name || 'Unknown',
      description: transaction.description,
    }));

    const response = await invokeGeminiProxy<{ responseText?: string }>({
      action: 'insights',
      transactions: simplifiedTx,
      question,
    });

    if (!response?.responseText) {
      return 'Assistente indisponivel no momento. Verifique se a Edge Function gemini-proxy esta publicada.';
    }

    return response.responseText;
  } catch (error) {
    console.error('Error getting insights:', error);
    if (error instanceof Error && error.message.includes('timeout')) {
      return 'A consulta de IA demorou demais. Tente novamente com uma pergunta mais curta.';
    }
    return 'Ocorreu um erro ao consultar o assistente. Tente novamente mais tarde.';
  }
};
