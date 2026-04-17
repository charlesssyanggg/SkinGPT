/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function Card({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div 
      onClick={onClick}
      className={cn("medical-card p-[20px]", className, onClick && "cursor-pointer active:scale-95 transition-transform font-sans")}
    >
      {children}
    </div>
  );
}

export function Button({ children, className, onClick, variant = 'primary', isLoading, disabled, type = 'button' }: { 
  children: React.ReactNode; 
  className?: string; 
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  isLoading?: boolean;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
}) {
  const variants = {
    primary: 'bg-brand text-white hover:opacity-90',
    secondary: 'bg-brand-light text-brand hover:opacity-80',
    ghost: 'bg-transparent text-text-secondary hover:bg-slate-100',
    danger: 'bg-risk-high text-white hover:opacity-90',
  };

  return (
    <button
      onClick={onClick}
      type={type}
      disabled={disabled || isLoading}
      className={cn(
        "flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl font-bold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm uppercase tracking-wider",
        variants[variant],
        className
      )}
    >
      {isLoading ? (
        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      ) : children}
    </button>
  );
}
