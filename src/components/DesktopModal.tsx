import React from 'react';
import {
  X,
  Monitor,
  CheckCircle2,
  Cpu,
} from 'lucide-react';

interface DesktopModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DesktopModal({ isOpen, onClose }: Readonly<DesktopModalProps>) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-xs select-none">
      <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl shadow-2xl max-w-2xl w-full max-h-[95dvh] sm:max-h-[90vh] flex flex-col overflow-hidden text-slate-800 dark:text-slate-200">
        {/* Header */}
        <div className="px-3 sm:px-5 py-3 sm:py-3.5 bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-sky-600 text-white rounded-md">
              <Monitor className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                Como executar como Aplicativo Desktop (.exe)
              </h3>
              <p className="hidden sm:block text-[11px] text-slate-500 dark:text-slate-400">
                Você pode rodar diretamente no Windows de duas formas práticas
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-3 sm:p-5 overflow-y-auto space-y-4 text-xs">
          {/* Option 1: Instalação Instantânea PWA / Edge / Chrome */}
          <div className="p-3.5 bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 rounded-lg space-y-2">
            <div className="flex items-center gap-2 text-sky-800 dark:text-sky-300 font-bold">
              <CheckCircle2 className="w-4 h-4 text-sky-600" />
              <span>Opção 1: Rodar como App Desktop Imediatamente (Sem compilar nada)</span>
            </div>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              O Chrome e o Microsoft Edge permitem transformar esta aplicação em um aplicativo Windows nativo em 1 clique:
            </p>
            <ol className="list-decimal list-inside space-y-1 text-slate-700 dark:text-slate-300 pl-1 font-mono text-[11px]">
              <li>No navegador, abra a aplicação e clique no menu <strong>⋮</strong> ou ícone de instalação na barra de endereço.</li>
              <li>Selecione <strong>&quot;Instalar OctoSearch&quot;</strong> ou <strong>&quot;Aplicativos &gt; Instalar este site como aplicativo&quot;</strong>.</li>
              <li>Pronto! Ele é fixado na Área de Trabalho e Barra de Tarefas do Windows, abrindo em janela própria ultra-rápida.</li>
            </ol>
          </div>

          {/* Option 2: Compilar o .exe com o script pronto */}
          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg space-y-2.5">
            <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold">
              <Cpu className="w-4 h-4 text-emerald-600" />
              <span>Opção 2: Gerar o arquivo .exe Portátil (Electron)</span>
            </div>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              Deixamos um script automatizado (<strong>gerar-exe.bat</strong>) e o Electron já configurados na raiz do projeto.
            </p>

            <div className="space-y-2 pl-1">
              <div className="flex items-start gap-2">
                <span className="bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                  1
                </span>
                <p>
                  No menu do Google AI Studio (canto superior direito), clique no menu de opções e selecione <strong>Export to ZIP</strong> (ou clone via GitHub).
                </p>
              </div>

              <div className="flex items-start gap-2">
                <span className="bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                  2
                </span>
                <p>
                  Extraia a pasta no seu computador com Windows.
                </p>
              </div>

              <div className="flex items-start gap-2">
                <span className="bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                  3
                </span>
                <div>
                  <p>
                    Dê um duplo clique no arquivo <strong>gerar-exe.bat</strong>.
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    (Ou abra o terminal na pasta e digite: <code className="bg-slate-200 dark:bg-slate-700 px-1 py-0.5 rounded font-mono text-emerald-600 dark:text-emerald-400">npm run build:exe</code>)
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <span className="bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                  4
                </span>
                <p>
                  O arquivo <strong>OctoSearch.exe</strong> será gerado dentro da pasta <code className="font-mono text-sky-600 dark:text-sky-400">dist-exe\</code>. Você pode copiá-lo para qualquer máquina ou pendrive!
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-100 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-sky-700 hover:bg-sky-800 text-white font-medium rounded-md transition-colors cursor-pointer text-xs"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
