import React from 'react';
import { Home, List, PlusCircle, Bot, Target, Clock, Settings, CreditCard as CreditCardIcon, LogOut } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Capacitor } from '@capacitor/core';
import { useAppStore } from '../store';
import { useAuth } from './AuthProvider';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, activeTab, setActiveTab }) => {
  const isNativePlatform = Capacitor.isNativePlatform();
  const { activeMember } = useAppStore();
  const { signOut } = useAuth();
  const initials = (activeMember?.name || 'MC')
    .split(' ')
    .map((chunk) => chunk[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const tabs = [
    { id: 'resumo', label: 'Resumo', icon: Home },
    { id: 'lancamentos', label: 'Extrato', icon: List },
    { id: 'adicionar', label: 'Adicionar', icon: PlusCircle, isMain: true },
    { id: 'pendentes', label: 'A Receber', icon: Clock },
    { id: 'planejar', label: 'Perfeito', icon: Target },
  ];

  return (
    <div className="min-h-[100dvh] bg-gray-200 flex justify-center sm:py-4">
      <div className="w-full max-w-md bg-gray-50 h-[100dvh] sm:h-[calc(100vh-2rem)] sm:rounded-[2.5rem] sm:border-[12px] sm:border-gray-900 flex flex-col relative shadow-2xl overflow-hidden font-sans">
        {/* Header */}
        <header
          className={cn(
            'bg-white shadow-sm px-4 py-3 z-10 flex justify-between items-center shrink-0',
            isNativePlatform && 'pt-safe-top'
          )}
        >
          <h1 className="text-xl font-bold text-indigo-600">Meu Controle</h1>
          <div className="flex items-center space-x-3">
            <button 
              onClick={() => setActiveTab('assistente')}
              className={`p-2 rounded-full transition-colors ${activeTab === 'assistente' ? 'bg-indigo-100 text-indigo-600' : 'text-gray-500 hover:bg-gray-100'}`}
              aria-label="Assistente IA"
            >
              <Bot size={24} />
            </button>
            <button 
              onClick={() => setActiveTab('cartoes')}
              className={`p-2 rounded-full transition-colors ${activeTab === 'cartoes' ? 'bg-indigo-100 text-indigo-600' : 'text-gray-500 hover:bg-gray-100'}`}
              aria-label="Cartoes"
            >
              <CreditCardIcon size={24} />
            </button>
            <button 
              onClick={() => setActiveTab('categorias')}
              className={`p-2 rounded-full transition-colors ${activeTab === 'categorias' ? 'bg-indigo-100 text-indigo-600' : 'text-gray-500 hover:bg-gray-100'}`}
              aria-label="Categorias"
            >
              <Settings size={24} />
            </button>
            <button
              onClick={() => void signOut()}
              className="w-8 h-8 rounded-full bg-rose-100 flex items-center justify-center text-rose-500 hover:bg-rose-200 transition-colors"
              aria-label="Sair"
              title="Sair da conta"
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto pb-20 relative hide-scrollbar">
          {children}
        </main>

        {/* Bottom Navigation */}
        <nav className="absolute bottom-0 w-full bg-white border-t border-gray-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-20 pb-safe">
          <div className="flex justify-around items-center h-16">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            
            if (tab.isMain) {
              return (
                <div key={tab.id} className="flex flex-col items-center justify-center w-full h-full">
                  <button
                    onClick={() => setActiveTab(tab.id)}
                    className="relative -top-5 flex flex-shrink-0 items-center justify-center w-14 h-14 bg-indigo-600 rounded-full shadow-lg text-white hover:bg-indigo-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    aria-label={tab.label}
                  >
                    <Icon size={28} />
                  </button>
                </div>
              );
            }

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors",
                  isActive ? "text-indigo-600" : "text-gray-500 hover:text-gray-900"
                )}
              >
                <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                <span className="text-[9px] font-medium truncate w-full text-center px-0.5">{tab.label}</span>
              </button>
            );
          })}
        </div>
        </nav>
      </div>
    </div>
  );
};
