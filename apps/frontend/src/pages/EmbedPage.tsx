import React, { useEffect, useRef } from 'react';

const EmbedPage: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = '/csfaq/widget.js';  // ✅ FIXED
    script.setAttribute('data-limit', '10');
    script.setAttribute('data-title', 'Frequently Asked Questions');
    script.setAttribute('data-theme', 'light');
    script.setAttribute('data-container', 'faq-widget-container');
    script.async = true;
    
    if (containerRef.current) {
      containerRef.current.appendChild(script);
    }

    return () => {
      if (containerRef.current) {
        const scriptEl = containerRef.current.querySelector('script');
        if (scriptEl) {
          containerRef.current.removeChild(scriptEl);
        }
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">
            🧩 FAQ Embed Widget
          </h1>
          
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-800 mb-3">
              Embed Code
            </h2>
            <p className="text-gray-600 mb-3">
              Copy and paste this code into any website:
            </p>
            <div className="bg-gray-100 rounded-lg p-4 overflow-x-auto">
              <code className="text-sm font-mono text-gray-800 whitespace-pre-wrap">
                {`<script src="${window.location.origin}/csfaq/widget.js" data-limit="5" data-title="FAQ" data-theme="light"></script>`}
              </code>
            </div>
            <div className="mt-3">
              <p className="text-sm text-gray-500">
                <strong>Options:</strong> data-batch-id, data-limit, data-theme, data-title, data-container, data-show-tags, data-show-date
              </p>
            </div>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-gray-800 mb-3">
              Preview
            </h2>
            <div 
              id="faq-widget-container" 
              ref={containerRef}
              className="border rounded-lg p-4 bg-gray-50 min-h-[100px]"
            >
              <p className="text-gray-500 text-center">Loading widget...</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmbedPage;