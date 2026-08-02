import React, { useState, useEffect } from 'react';

// Example FAQ Item Interface
interface FAQItem {
  id: string;
  question: string;
  answer: string;
}

// Sample data (replace with your actual fetched or imported FAQs)
const sampleFAQs: FAQItem[] = [
  { id: '1', question: 'How do I submit an internship task?', answer: 'You can submit your task via the portal dashboard.' },
  { id: '2', question: 'Where can I find project documentation?', answer: 'Check the GitHub repository wiki or README.' },
  { id: '3', question: 'How do I contact support?', answer: 'You can reach out through the community channel.' },
];

const FAQPage: React.FC = () => {
  // State for bookmarks, initialized from localStorage
  const [bookmarkedIds, setBookmarkedIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('faq_bookmarks');
      return saved ? JSON.parse(saved) : [];
    } catch (error) {
      console.error('Failed to load bookmarks from localStorage', error);
      return [];
    }
  });

  // Filter state: 'all' or 'bookmarked'
  const [filter, setFilter] = useState<'all' | 'bookmarks'>('all');

  // Sync bookmarks to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('faq_bookmarks', JSON.stringify(bookmarkedIds));
    } catch (error) {
      console.error('Failed to save bookmarks to localStorage', error);
    }
  }, [bookmarkedIds]);

  // Toggle bookmark function
  const toggleBookmark = (id: string) => {
    setBookmarkedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Filter FAQs based on current tab view
  const displayedFAQs = sampleFAQs.filter((faq) => {
    if (filter === 'bookmarks') {
      return bookmarkedIds.includes(faq.id);
    }
    return true;
  });

  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <h1>Frequently Asked Questions</h1>

      {/* Tabs to switch between All and Bookmarked FAQs */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem' }}>
        <button
          onClick={() => setFilter('all')}
          style={{
            padding: '0.5rem 1rem',
            background: filter === 'all' ? '#007bff' : '#f0f0f0',
            color: filter === 'all' ? '#fff' : '#000',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          All FAQs ({sampleFAQs.length})
        </button>
        <button
          onClick={() => setFilter('bookmarks')}
          style={{
            padding: '0.5rem 1rem',
            background: filter === 'bookmarks' ? '#007bff' : '#f0f0f0',
            color: filter === 'bookmarks' ? '#fff' : '#000',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          ⭐ Bookmarked ({bookmarkedIds.length})
        </button>
      </div>

      {/* FAQ List */}
      {displayedFAQs.length === 0 ? (
        <p>No FAQs found in this section.</p>
      ) : (
        displayedFAQs.map((faq) => {
          const isBookmarked = bookmarkedIds.includes(faq.id);
          return (
            <div
              key={faq.id}
              style={{
                border: '1px solid #ddd',
                padding: '1rem',
                borderRadius: '6px',
                marginBottom: '1rem',
                background: '#fff',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <h3 style={{ margin: '0 0 0.5rem 0' }}>{faq.question}</h3>
                <button
                  onClick={() => toggleBookmark(faq.id)}
                  title={isBookmarked ? 'Remove Bookmark' : 'Add Bookmark'}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    fontSize: '1.25rem',
                    cursor: 'pointer',
                  }}
                >
                  {isBookmarked ? '⭐' : '☆'}
                </button>
              </div>
              <p style={{ margin: 0, color: '#555' }}>{faq.answer}</p>
            </div>
          );
        })
      )}
    </div>
  );
};

export default FAQPage;
