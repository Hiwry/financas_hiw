import React from 'react';
import { 
  Home, Utensils, Car, HeartPulse, Gamepad2, FileText, 
  MonitorPlay, GraduationCap, Landmark, ShoppingBag, Gift, 
  MoreHorizontal, Briefcase, Laptop, TrendingUp, RefreshCcw,
  HelpCircle, ArrowUpRight, ArrowDownRight,
  Plane, PawPrint, Coffee, Scissors, Baby, Store
} from 'lucide-react';

interface CategoryIconProps {
  name?: string;
  type?: 'income' | 'expense';
  size?: number;
  className?: string;
}

export const availableIcons: Record<string, React.ElementType> = {
  Home,
  Utensils,
  Car,
  HeartPulse,
  Gamepad2,
  FileText,
  MonitorPlay,
  GraduationCap,
  Landmark,
  ShoppingBag,
  Gift,
  MoreHorizontal,
  Briefcase,
  Laptop,
  TrendingUp,
  RefreshCcw,
  Plane,
  PawPrint,
  Coffee,
  Scissors,
  Baby,
  Store
};

export const CategoryIcon: React.FC<CategoryIconProps> = ({ name, type, size = 20, className = '' }) => {
  const IconComponent = name && availableIcons[name] ? availableIcons[name] : null;

  if (IconComponent) {
    return <IconComponent size={size} className={className} />;
  }

  // Fallback
  if (type === 'income') {
    return <ArrowUpRight size={size} className={className} />;
  }
  if (type === 'expense') {
    return <ArrowDownRight size={size} className={className} />;
  }
  
  return <HelpCircle size={size} className={className} />;
};
