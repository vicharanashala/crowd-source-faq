import React, { useState, useEffect, useRef } from 'react';

interface CodeSandboxProps {
  initialCode?: string;
  language?: string;
}

const DEFAULT_JS_HTML = `<!-- Edit this code and click Run -->
<div id="app"></div>

<script>
  const app = document.getElementById('app');
  app.innerHTML = '<h1 style="color: #3B82F6; font-family: sans-serif;">Hello from Yaksha Sandbox!</h1><p style="color: #4B5563;">You can write HTML, CSS and JS here and see changes in real-time.</p>';
  console.log('Sandbox loaded successfully.');
</script>
`;

export default function CodeSandbox({ initialCode = DEFAULT_JS_HTML, language = 'html' }: CodeSandboxProps) {
  const [code, setCode] = useState(initialCode);
  const [logs, setLogs] = useState<string[]>([]);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const runCode = () => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    // Reset logs
    setLogs([]);

    // We inject a console.log wrapper to capture logs
    const consoleCaptureScript = `
      <script>
        (function() {
          const originalLog = console.log;
          const originalError = console.error;
          
          console.log = function(...args) {
            window.parent.postMessage({ type: 'CONSOLE_LOG', message: args.join(' ') }, '*');
            originalLog.apply(console, args);
          };
          
          console.error = function(...args) {
            window.parent.postMessage({ type: 'CONSOLE_ERROR', message: args.join(' ') }, '*');
            originalError.apply(console, args);
          };

          window.onerror = function(message, source, lineno, colno, error) {
            window.parent.postMessage({ type: 'CONSOLE_ERROR', message: message }, '*');
            return false;
          };
        })();
      </script>
    `;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; padding: 12px; margin: 0; color: #1F2937; background-color: #F9FAFB; }
          </style>
        </head>
        <body>
          ${consoleCaptureScript}
          ${code}
        </body>
      </html>
    `;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    iframe.src = URL.createObjectURL(blob);
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'CONSOLE_LOG') {
        setLogs(prev => [...prev, `[log] ${event.data.message}`]);
      } else if (event.data && event.data.type === 'CONSOLE_ERROR') {
        setLogs(prev => [...prev, `[error] ${event.data.message}`]);
      }
    };

    window.addEventListener('message', handleMessage);
    // Initial run
    runCode();

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [code]);

  return (
    <div className="border border-border/80 rounded-3xl bg-neutral-900 overflow-hidden shadow-subtle flex flex-col h-[480px] w-full text-neutral-200">
      {/* Sandbox Header */}
      <div className="flex items-center justify-between px-5 py-3.5 bg-neutral-800/80 border-b border-neutral-700/60">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <span className="w-3 h-3 rounded-full bg-danger"></span>
            <span className="w-3 h-3 rounded-full bg-warning"></span>
            <span className="w-3 h-3 rounded-full bg-success"></span>
          </div>
          <span className="text-xs font-semibold tracking-wider text-neutral-400 uppercase ml-2">Yaksha Live Playground</span>
        </div>
        <button 
          onClick={runCode}
          className="px-4 py-1.5 bg-accent hover:bg-accent-hover text-white font-medium text-xs rounded-xl shadow-sm transition-colors flex items-center gap-1.5"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          Run Code
        </button>
      </div>

      {/* Editor & Preview Split Panel */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0">
        {/* Editor Area */}
        <div className="flex-1 border-b md:border-b-0 md:border-r border-neutral-700/60 flex flex-col min-h-0">
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full flex-1 p-4 bg-neutral-950 font-mono text-sm text-emerald-400 placeholder-neutral-700 focus:outline-none resize-none leading-relaxed overflow-auto"
            spellCheck={false}
          />
        </div>

        {/* Preview & Console Log Area */}
        <div className="flex-1 flex flex-col min-h-0 bg-neutral-50">
          <div className="flex-1 relative">
            <iframe
              ref={iframeRef}
              title="Sandbox Output"
              className="w-full h-full border-0 bg-white"
              sandbox="allow-scripts"
            />
          </div>
          {/* Virtual Console */}
          {logs.length > 0 && (
            <div className="h-32 border-t border-neutral-700 bg-neutral-950 text-neutral-400 font-mono text-xs overflow-y-auto p-3">
              <div className="text-[10px] text-neutral-600 uppercase font-bold tracking-wider mb-1.5 border-b border-neutral-800 pb-1">Console Logs</div>
              {logs.map((log, i) => (
                <div key={i} className={`py-0.5 leading-5 ${log.startsWith('[error]') ? 'text-red-400' : 'text-emerald-500'}`}>
                  {log}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
