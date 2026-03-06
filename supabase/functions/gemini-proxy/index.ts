import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { GoogleGenAI, Type } from 'npm:@google/genai@1.29.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const model = Deno.env.get('GEMINI_MODEL') || 'gemini-2.5-flash';
const geminiApiKey = Deno.env.get('GEMINI_API_KEY') || '';
const ai = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;

const jsonResponse = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });

serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (!ai) {
    return jsonResponse(500, { error: 'GEMINI_API_KEY is not configured in Edge Function secrets.' });
  }

  try {
    const body = await request.json();
    const action = String(body?.action || '');

    if (action === 'categorize') {
      const text = String(body?.text || '').trim();
      const categoryNames = Array.isArray(body?.categoryNames) ? body.categoryNames.join(', ') : '';
      const accountNames = Array.isArray(body?.accountNames) ? body.accountNames.join(', ') : '';

      if (!text) {
        return jsonResponse(400, { error: 'Missing "text" for categorize action.' });
      }

      const today = String(body?.todayDate || new Date().toISOString().slice(0, 10));

      const prompt = `
      Voce e um assistente financeiro. Extraia os dados da frase e retorne um JSON estruturado.
      Frase: "${text}"
      Data de hoje: ${today}

      Regras EXTREMAMENTE IMPORTANTES:
      1. date: YYYY-MM-DD. Mapeie termos ("hoje", "amanha", "ontem") usando "Data de hoje" como base. SE NENHUMA DATA FOR MENCIONADA NA FRASE, DEVOLVA EXATAMENTE A "Data de hoje" (${today}). Nunca deixe vazio.
      2. categoryName: Escolha OBRIGATORIAMENTE uma das opcoes exatas desta lista: [${categoryNames}]. Use o bom senso: "mercado" ou "ifood" -> "Alimentação". "gasolina" ou "uber" -> "Transporte". "luz" ou "aluguel" -> "Moradia". Se nenhuma encaixar, escolha a que mais se aproxima ou "Outros".
      
      Outras Regras:
      - type: 'income' (ganhos, salarios) ou 'expense' (gastos, compras).
      - nature: 'fixed' ou 'variable'.
      - amount: numero decimal (ex: 15.50).
      - installmentCount: inteiro >= 1. Se frase tiver "3x", retorne 3.
      - subcategory: curta (ex: Uber, Restaurante, Luz). Nunca vazia.
      - tags: array de strings.
      - paymentMethod: dinheiro, debito, credito, pix, boleto ou transferencia.
      - account: tente identificar entre [${accountNames}].
      - recurrence: none, monthly, weekly, biweekly ou yearly.
      - status: paid ou pending.
      - description: titulo LIMPO e CURTO do lancamento (ex: "Aluguel", "Conta de Internet", "Uber para o trabalho"). NAO repita a frase inteira do usuario. Maximo 30 caracteres. Nunca vazia.
      `;

      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              type: { type: Type.STRING },
              nature: { type: Type.STRING },
              amount: { type: Type.NUMBER },
              date: { type: Type.STRING },
              installmentCount: { type: Type.NUMBER },
              categoryName: { type: Type.STRING },
              subcategory: { type: Type.STRING },
              tags: { type: Type.ARRAY, items: { type: Type.STRING } },
              paymentMethod: { type: Type.STRING },
              account: { type: Type.STRING },
              recurrence: { type: Type.STRING },
              status: { type: Type.STRING },
              description: { type: Type.STRING },
            },
            required: ['type', 'nature', 'amount', 'date', 'categoryName', 'paymentMethod', 'account', 'recurrence', 'status', 'description'],
          },
        },
      });

      const raw = response.text?.trim() || '{}';
      const parsed = JSON.parse(raw);
      return jsonResponse(200, { parsed });
    }

    if (action === 'ocr_receipt') {
      const imageBase64 = String(body?.imageBase64 || '').trim();
      const mimeType = String(body?.mimeType || 'image/jpeg').trim();
      const categoryNames = Array.isArray(body?.categoryNames) ? body.categoryNames.join(', ') : '';
      const accountNames = Array.isArray(body?.accountNames) ? body.accountNames.join(', ') : '';

      if (!imageBase64) {
        return jsonResponse(400, { error: 'Missing "imageBase64" for ocr_receipt action.' });
      }

      const prompt = `
      Voce e um assistente financeiro especialista em OCR de comprovantes e notas fiscais.
      Leia a imagem enviada e retorne apenas um JSON estruturado.

      Regras:
      - type: 'income' ou 'expense'. Em compras, use 'expense'.
      - nature: 'fixed' ou 'variable'.
      - amount: numero decimal final pago.
      - date: YYYY-MM-DD, quando encontrada.
      - installmentCount: inteiro >= 1, se houver indicacao de parcelas.
      - categoryName: escolha entre [${categoryNames}] quando possivel.
      - subcategory: curta (ex: Mercado, Uber, Farmacia).
      - tags: array de strings curtas.
      - paymentMethod: dinheiro, debito, credito, pix, boleto ou transferencia.
      - account: tente identificar entre [${accountNames}].
      - recurrence: none, monthly, weekly, biweekly ou yearly.
      - status: paid ou pending.
      - description: obrigatoria e especifica com nome do estabelecimento/item.
      - merchant: nome do estabelecimento, quando encontrado.
      `;

      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType,
                  data: imageBase64,
                },
              },
            ],
          },
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              type: { type: Type.STRING },
              nature: { type: Type.STRING },
              amount: { type: Type.NUMBER },
              date: { type: Type.STRING },
              installmentCount: { type: Type.NUMBER },
              categoryName: { type: Type.STRING },
              subcategory: { type: Type.STRING },
              tags: { type: Type.ARRAY, items: { type: Type.STRING } },
              paymentMethod: { type: Type.STRING },
              account: { type: Type.STRING },
              recurrence: { type: Type.STRING },
              status: { type: Type.STRING },
              description: { type: Type.STRING },
              merchant: { type: Type.STRING },
            },
            required: ['type', 'nature', 'amount', 'description'],
          },
        },
      });

      const raw = response.text?.trim() || '{}';
      const parsed = JSON.parse(raw);
      return jsonResponse(200, { parsed });
    }

    if (action === 'insights') {
      const question = String(body?.question || '').trim();
      const transactions = Array.isArray(body?.transactions) ? body.transactions : [];

      if (!question) {
        return jsonResponse(400, { error: 'Missing "question" for insights action.' });
      }

      const prompt = `
      Voce e um assistente financeiro pessoal. Responda com base nos dados de transacoes fornecidos.
      Seja direto, amigavel e conciso. Formate em Markdown.

      Dados de transacoes (JSON):
      ${JSON.stringify(transactions)}

      Pergunta do usuario: "${question}"
      `;

      const response = await ai.models.generateContent({
        model,
        contents: prompt,
      });

      return jsonResponse(200, { responseText: response.text || '' });
    }

    return jsonResponse(400, { error: 'Invalid action. Use "categorize", "ocr_receipt" or "insights".' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return jsonResponse(500, { error: message });
  }
});
