import React, { useState } from 'react';
import { Sparkles, ArrowRight } from 'lucide-react';
import { parsearTextoRapido, ItemCapturaRapida } from '@core/parser-rapido';

interface QuickCaptureProps {
  onParsedItem: (item: ItemCapturaRapida) => void;
}

export const QuickCapture: React.FC<QuickCaptureProps> = ({ onParsedItem }) => {
  const [input, setInput] = useState('');

  const handleProcess = () => {
    if (!input.trim()) return;
    const parsed = parsearTextoRapido(input);
    onParsedItem(parsed);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleProcess();
    }
  };

  return (
    <div className="bg-slate-50 p-3.5 rounded-2xl border border-glow-100 mb-5 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="w-4 h-4 text-glow-600" />
        <span className="text-xs font-bold text-glow-900">
          Captura Rápida Inteligente
        </span>
        <span className="text-[11px] text-slate-500">
          (Pega links o escribe ej: &ldquo;Sephora Dior Sauvage 100ml $128 1.5lb&rdquo;)
        </span>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Escribe o pega información del producto y presiona Enter..."
          className="flex-1 bg-white px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-glow-400 focus:border-glow-400 shadow-sm"
        />
        <button
          type="button"
          onClick={handleProcess}
          disabled={!input.trim()}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-glow-600 hover:bg-glow-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors shadow-sm shrink-0"
        >
          <span>Interpretar</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
