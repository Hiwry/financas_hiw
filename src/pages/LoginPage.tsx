import React, { useState } from 'react';
import { useAuth } from '../components/AuthProvider';
import { Loader2, Mail, Lock, ArrowRight, UserPlus } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { signIn, signUp, resetPassword } = useAuth();
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!email.trim() || (mode !== 'forgot' && !password.trim())) {
      setError(mode === 'forgot' ? 'Preencha o email.' : 'Preencha email e senha.');
      return;
    }

    if (mode !== 'forgot' && password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        const errorMessage = await signIn(email.trim(), password);
        if (errorMessage) setError(translateError(errorMessage));
      } else if (mode === 'register') {
        const errorMessage = await signUp(email.trim(), password);
        if (errorMessage) {
          setError(translateError(errorMessage));
        } else {
          setSuccess('Conta criada com sucesso! Você já pode entrar.');
          setMode('login');
        }
      } else if (mode === 'forgot') {
        const errorMessage = await resetPassword(email.trim());
        if (errorMessage) {
          setError(translateError(errorMessage));
        } else {
          setSuccess('Link de recuperação enviado! Verifique seu email.');
          setMode('login');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const translateError = (message: string): string => {
    if (message.includes('Invalid login credentials')) return 'Email ou senha incorretos.';
    if (message.includes('User already registered')) return 'Este email já possui uma conta. Faça login.';
    if (message.includes('Email not confirmed')) return 'Confirme seu email antes de entrar.';
    if (message.includes('Password should be')) return 'A senha deve ter pelo menos 6 caracteres.';
    if (message.includes('User not found')) return 'Usuário não encontrado.';
    return message;
  };

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-indigo-600 via-purple-600 to-indigo-800 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl mb-4 shadow-lg">
            <span className="text-3xl font-extrabold text-white">💰</span>
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Meu Controle</h1>
          <p className="text-indigo-200 text-sm mt-1">Suas finanças sob controle</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-2xl p-6 space-y-5">
          {/* Tabs */}
          <div className="flex bg-gray-100 p-1 rounded-xl relative">
            <button
              type="button"
              onClick={() => { setMode('login'); setError(''); setSuccess(''); }}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                mode === 'login' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'
              }`}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => { setMode('register'); setError(''); setSuccess(''); }}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                mode === 'register' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'
              }`}
            >
              Criar Conta
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center">
                <Mail size={12} className="mr-1" /> Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm transition-all"
                placeholder="seu@email.com"
                autoComplete="email"
              />
            </div>

            {mode !== 'forgot' && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center">
                    <Lock size={12} className="mr-1" /> Senha
                  </label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => { setMode('forgot'); setError(''); setSuccess(''); }}
                      className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 uppercase tracking-wider transition-colors"
                    >
                      Esqueceu?
                    </button>
                  )}
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm transition-all"
                  placeholder="••••••••"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
              </div>
            )}

            {mode === 'forgot' && (
              <div className="flex justify-between items-center pb-2">
                <p className="text-xs text-gray-500 font-medium whitespace-break-spaces">
                  Enviaremos um link para redefinir sua senha.
                </p>
                <button
                  type="button"
                  onClick={() => { setMode('login'); setError(''); setSuccess(''); }}
                  className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 uppercase tracking-wider transition-colors whitespace-nowrap ml-2"
                >
                  Voltar ao Login
                </button>
              </div>
            )}

            {error && (
              <div className="p-3 rounded-xl bg-rose-50 text-rose-600 text-sm font-medium border border-rose-200 animate-[fadeIn_0.2s_ease-in]">
                {error}
              </div>
            )}

            {success && (
              <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600 text-sm font-medium border border-emerald-200 animate-[fadeIn_0.2s_ease-in]">
                {success}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl hover:from-indigo-700 hover:to-purple-700 transition-all duration-200 flex items-center justify-center space-x-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 size={20} className="animate-spin" />
              ) : (
                <>
                  {mode === 'forgot' ? <Mail size={18} /> : mode === 'login' ? <ArrowRight size={18} /> : <UserPlus size={18} />}
                  <span>{mode === 'forgot' ? 'Enviar Link' : mode === 'login' ? 'Entrar' : 'Criar Conta'}</span>
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-indigo-200/60 text-xs mt-6">
          Seus dados ficam seguros e separados por conta.
        </p>
      </div>
    </div>
  );
};
