import React, { useState } from 'react';
import { Sparkles, ArrowRight } from 'lucide-react';
import { parsearTextoRapido, ItemCapturaRapida } from '@core/parser-rapido';
import { Button, Input } from './ui';

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
    <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 mb-5 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="w-4 h-4 text-brand-600" />
        <span className="text-caption font-bold text-slate-900">
          Captura Rápida Inteligente
        </span>
        <span className="text-caption text-slate-500">
          (Pega links o escribe ej: &ldquo;Sephora Dior Sauvage 100ml $128 1.5lb&rdquo;)
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Escribe o pega información del producto y presiona Enter..."
          className="flex-1 bg-white"
        />
        <Button
          type="button"
          variant="primary"
          onClick={handleProcess}
          disabled={!input.trim()}
          className="shrink-0"
        >
          <span>Interpretar</span>
          <ArrowRight className="w-3.5 h-3.5 ml-1" />
        </Button>
      </div>
    </div>
  );
};
