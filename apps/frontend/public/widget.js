/**
 * Crowd Source FAQ - Embed Widget
 * 
 * Usage: 
 * <script src="https://yourdomain.com/widget.js" 
 *         data-batch-id="BATCH_ID" 
 *         data-limit="10"
 *         data-theme="light"
 *         data-title="FAQ"
 *         data-container="faq-container">
 * </script>
 * 
 * Options:
 *   data-batch-id    - Filter FAQs by batch ID
 *   data-limit       - Number of FAQs to show (default: 10, max: 50)
 *   data-theme       - 'light' or 'dark' (default: 'light')
 *   data-title       - Custom title (default: 'Frequently Asked Questions')
 *   data-container   - Container element ID (default: 'faq-widget-container')
 *   data-show-tags   - 'true' or 'false' (default: 'true')
 *   data-show-date   - 'true' or 'false' (default: 'false')
 *   data-api-url     - Custom API URL (default: auto-detected from server)
 */

(function() {
  'use strict';
  
  // Configuration from script attributes
  const script = document.currentScript;
  const batchId = script.getAttribute('data-batch-id') || '';
  const limit = parseInt(script.getAttribute('data-limit')) || 10;
  const theme = script.getAttribute('data-theme') || 'light';
  const title = script.getAttribute('data-title') || 'Frequently Asked Questions';
  const containerId = script.getAttribute('data-container') || 'faq-widget-container';
  const showTags = script.getAttribute('data-show-tags') !== 'false';
  const showDate = script.getAttribute('data-show-date') === 'true';
  
  // Auto-detect API URL based on where widget is loaded
  let API_URL = script.getAttribute('data-api-url') || '';
  if (!API_URL) {
    const currentScript = document.currentScript;
    if (currentScript && currentScript.src) {
      const scriptUrl = new URL(currentScript.src);
      API_URL = scriptUrl.origin + '/csfaq/api/embed';
    } else {
      API_URL = window.location.origin + '/csfaq/api/embed';
    }
  }
  
  // Wait for DOM to be ready
  function init() {
    const container = document.getElementById(containerId);
    if (!container) {
      console.warn('FAQ Widget: Container element "' + containerId + '" not found');
      return;
    }
    
    container.innerHTML = '<div style="text-align:center;padding:20px;color:#666;">Loading FAQs...</div>';
    fetchFaqs(container);
  }
  
  function fetchFaqs(container) {
    let url = API_URL + '/faqs?limit=' + Math.min(limit, 50);
    if (batchId) {
      url += '&batchId=' + encodeURIComponent(batchId);
    }
    
    fetch(url)
      .then(response => {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then(data => {
        if (data.success && data.data && data.data.length > 0) {
          renderFaqs(container, data.data);
        } else {
          container.innerHTML = '<div style="text-align:center;padding:20px;color:#999;">No FAQs available</div>';
        }
      })
      .catch(error => {
        console.error('FAQ Widget: Error fetching FAQs', error);
        container.innerHTML = '<div style="text-align:center;padding:20px;color:#e53e3e;">Unable to load FAQs. Please try again later.</div>';
      });
  }
  
  function renderFaqs(container, faqs) {
    const isDark = theme === 'dark';
    const bgColor = isDark ? '#1a202c' : '#ffffff';
    const textColor = isDark ? '#e2e8f0' : '#1a202c';
    const borderColor = isDark ? '#2d3748' : '#e2e8f0';
    const hoverBg = isDark ? '#2d3748' : '#f7fafc';
    
    let html = `
      <style>
        .faq-widget {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: ${bgColor};
          color: ${textColor};
          border-radius: 8px;
          border: 1px solid ${borderColor};
          padding: 20px;
          max-width: 100%;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .faq-widget-title {
          font-size: 20px;
          font-weight: 600;
          margin: 0 0 16px 0;
          padding-bottom: 12px;
          border-bottom: 2px solid ${borderColor};
        }
        .faq-widget-item {
          border-bottom: 1px solid ${borderColor};
          padding: 10px 0;
        }
        .faq-widget-item:last-child { border-bottom: none; }
        .faq-widget-question {
          font-weight: 500;
          cursor: pointer;
          padding: 8px 12px;
          margin: 0 -12px;
          border-radius: 4px;
          transition: background 0.2s;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .faq-widget-question:hover { background: ${hoverBg}; }
        .faq-widget-question .faq-widget-toggle {
          font-size: 18px;
          transition: transform 0.3s;
          color: #718096;
        }
        .faq-widget-question .faq-widget-toggle.open { transform: rotate(180deg); }
        .faq-widget-answer {
          padding: 8px 12px 4px 12px;
          color: ${isDark ? '#a0aec0' : '#4a5568'};
          line-height: 1.6;
          display: none;
        }
        .faq-widget-answer.open { display: block; }
        .faq-widget-meta {
          font-size: 12px;
          color: ${isDark ? '#718096' : '#a0aec0'};
          margin-top: 6px;
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }
        .faq-widget-tag {
          background: ${isDark ? '#2d3748' : '#edf2f7'};
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 11px;
          color: ${isDark ? '#a0aec0' : '#4a5568'};
        }
        .faq-widget-footer {
          margin-top: 16px;
          text-align: center;
          font-size: 12px;
          color: ${isDark ? '#718096' : '#a0aec0'};
          border-top: 1px solid ${borderColor};
          padding-top: 12px;
        }
        .faq-widget-footer a {
          color: #4299e1;
          text-decoration: none;
        }
        .faq-widget-footer a:hover { text-decoration: underline; }
      </style>
      <div class="faq-widget">
        <div class="faq-widget-title">${escapeHtml(title)}</div>
    `;
    
    faqs.forEach((faq, index) => {
      const answerId = 'faq-answer-' + index;
      html += `
        <div class="faq-widget-item">
          <div class="faq-widget-question" onclick="window.toggleFaq('${answerId}')">
            <span>${escapeHtml(faq.question)}</span>
            <span class="faq-widget-toggle" id="toggle-${answerId}">▼</span>
          </div>
          <div class="faq-widget-answer" id="${answerId}">
            ${escapeHtml(faq.answer)}
          </div>
      `;
      
      if (showTags && faq.tags && faq.tags.length > 0) {
        html += `<div class="faq-widget-meta">`;
        faq.tags.forEach(tag => {
          html += `<span class="faq-widget-tag">#${escapeHtml(tag)}</span>`;
        });
        html += `</div>`;
      }
      
      if (showDate && faq.createdAt) {
        const date = new Date(faq.createdAt);
        html += `<div class="faq-widget-meta">Updated: ${date.toLocaleDateString()}</div>`;
      }
      
      html += `</div>`;
    });
    
    html += `
        <div class="faq-widget-footer">
          Powered by <a href="${window.location.origin}/csfaq/" target="_blank">Yaksha FAQ Portal</a>
        </div>
      </div>
    `;
    
    container.innerHTML = html;
  }
  
  window.toggleFaq = function(answerId) {
    const answer = document.getElementById(answerId);
    const toggle = document.getElementById('toggle-' + answerId);
    if (answer) {
      answer.classList.toggle('open');
      if (toggle) toggle.classList.toggle('open');
    }
  };
  
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
})();