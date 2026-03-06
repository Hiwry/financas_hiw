import React, { useState } from 'react';
import { AuthProvider, useAuth } from './components/AuthProvider';
import { AppProvider } from './store';
import { Layout } from './components/Layout';
import { Resumo } from './pages/Resumo';
import { Lancamentos } from './pages/Lancamentos';
import { Pendentes } from './pages/Pendentes';
import { Adicionar } from './pages/Adicionar';
import { Planejar } from './pages/Planejar';
import { Assistente } from './pages/Assistente';
import { Categorias } from './pages/Categorias';
import { Cartoes } from './pages/Cartoes';
import { LoginPage } from './pages/LoginPage';
import { Transaction } from './types';
import { Loader2 } from 'lucide-react';

const AppContent = () => {
  const [activeTab, setActiveTab] = useState('resumo');
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [editingOriginTab, setEditingOriginTab] = useState<'lancamentos' | 'pendentes'>('lancamentos');

  const handleEditTransaction = (tx: Transaction, origin: 'lancamentos' | 'pendentes' = 'lancamentos') => {
    setEditingOriginTab(origin);
    setEditingTransaction(tx);
    setActiveTab('adicionar');
  };

  const handleCancelEdit = () => {
    setEditingTransaction(null);
    setActiveTab(editingOriginTab);
  };

  const handleSaveTransaction = () => {
    const nextTab = editingTransaction ? editingOriginTab : 'resumo';
    setEditingTransaction(null);
    setActiveTab(nextTab);
  };

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
      {activeTab === 'resumo' && <Resumo />}
      {activeTab === 'lancamentos' && <Lancamentos onEdit={(tx) => handleEditTransaction(tx, 'lancamentos')} />}
      {activeTab === 'pendentes' && <Pendentes onEdit={(tx) => handleEditTransaction(tx, 'pendentes')} />}
      {activeTab === 'adicionar' && (
        <Adicionar 
          onSave={handleSaveTransaction} 
          editTransaction={editingTransaction} 
          onCancelEdit={handleCancelEdit} 
        />
      )}
      {activeTab === 'planejar' && <Planejar />}
      {activeTab === 'assistente' && <Assistente />}
      {activeTab === 'categorias' && <Categorias />}
      {activeTab === 'cartoes' && <Cartoes />}
    </Layout>
  );
};

const AuthGate = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-gradient-to-br from-indigo-600 via-purple-600 to-indigo-800 flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 size={40} className="animate-spin text-white mx-auto" />
          <p className="text-indigo-200 text-sm font-medium">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}
