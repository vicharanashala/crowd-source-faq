import { faqData } from './faq-data';

interface SPHistoryEntry {
  query: string;
  amount: number;
  type: 'award' | 'penalty';
  date: string;
}

interface User {
  name: string;
  email: string;
  password?: string;
  date: string;
  status: string;
  lastSignIn: string;
  sp?: number;
  spHistory?: SPHistoryEntry[];
}

interface Admin {
  email: string;
  password?: string;
}

interface Query {
  term: string;
  userName: string;
  userEmail: string;
  date: string;
  time: string;
  proposedAnswer?: string;
  proposedBy?: string;
}

interface ResolvedQuery {
  term: string;
  answer: string;
  userName: string;
  userEmail: string;
  resolvedBy: string;
}

// LocalStorage State (Clean slate)
let users: User[] = JSON.parse(localStorage.getItem('faq_users_v2') || '[]');

let admins: Admin[] = JSON.parse(localStorage.getItem('faq_admins_v2') || '[]');

let unresolvedQueries: Query[] = JSON.parse(localStorage.getItem('faq_queries_v2') || '[]');

let resolvedQueries: ResolvedQuery[] = JSON.parse(localStorage.getItem('faq_resolved_v2') || '[]');

function saveState() {
  localStorage.setItem('faq_users_v2', JSON.stringify(users));
  localStorage.setItem('faq_admins_v2', JSON.stringify(admins));
  localStorage.setItem('faq_queries_v2', JSON.stringify(unresolvedQueries));
  localStorage.setItem('faq_resolved_v2', JSON.stringify(resolvedQueries));
}

const ADMIN_SECURITY_KEY = 'vins2026';
let currentUserEmail = null;
let currentUserName = null;
let currentAdminEmail = null;

// Data Migration for Legacy SP
let stateChanged = false;
users.forEach(user => {
  if (user.sp !== undefined && user.sp !== 0) {
    if (!user.spHistory) user.spHistory = [];
    if (user.spHistory.length === 0) {
      user.spHistory.push({
        query: "Legacy SP Balance Carried Over",
        amount: user.sp,
        type: user.sp > 0 ? 'award' : 'penalty',
        date: new Date().toLocaleDateString()
      });
      stateChanged = true;
    }
  }
});
if (stateChanged) saveState();

document.addEventListener('DOMContentLoaded', () => {
  
  // Elements
  const themeToggleBtn = document.getElementById('theme-toggle');
  const sidebar = document.getElementById('sidebar');
  const hamburgerMenu = document.getElementById('hamburger-menu');
  const navLinks = document.querySelectorAll('.sidebar-nav a');
  const contentSections = document.querySelectorAll('.content-section');
  const pageTitle = document.getElementById('page-title');

  // Login Modal Elements
  const loginModalBtn = document.getElementById('login-modal-btn');
  const loginModal = document.getElementById('login-modal');
  const closeModalBtn = document.getElementById('close-modal');
  const authSection = document.getElementById('auth-section');
  const userProfile = document.getElementById('user-profile');
  const userEmailDisplay = document.getElementById('user-email-display');
  const logoutBtn = document.getElementById('logout-btn');

  // Book Elements
  const flipPage = document.getElementById('flip-page');
  const goToSignupBtn = document.getElementById('go-to-signup');
  const goToSigninBtn = document.getElementById('go-to-signin');
  const signinForm = document.getElementById('signin-form');
  const signupForm = document.getElementById('signup-form');
  const loginError = document.getElementById('login-error');
  const signupError = document.getElementById('signup-error');
  const signupSuccess = document.getElementById('signup-success');

  // Admin Elements
  const adminStep1 = document.getElementById('admin-step-1');
  const adminStep2 = document.getElementById('admin-step-2');
  const adminStep3 = document.getElementById('admin-step-3');
  const adminSecurityKey = document.getElementById('admin-security-key');
  const adminVerifyKeyBtn = document.getElementById('admin-verify-key-btn');
  const adminKeyError = document.getElementById('admin-key-error');
  const adminUsername = document.getElementById('admin-username');
  const adminPassword = document.getElementById('admin-password');
  const adminLoginBtn = document.getElementById('admin-login-btn');
  const adminLoginError = document.getElementById('admin-login-error');
  const adminLockBtn = document.getElementById('admin-lock-btn');
  const adminUsersTableBody = document.getElementById('admin-users-table-body');
  
  // Reject Modal Elements
  const rejectModal = document.getElementById('reject-modal');
  const rejectQueryText = document.getElementById('reject-query-text');
  const rejectPenaltySelect = document.getElementById('reject-penalty-select');
  const rejectSubmitBtn = document.getElementById('reject-submit-btn');
  const rejectCancelBtn = document.getElementById('reject-cancel-btn');
  let currentRejectIndex = null;

  // Home Elements
  const homeViewFaqsBtn = document.getElementById('home-view-faqs-btn');
  const faqSearchInput = document.getElementById('faq-search-input');
  const faqSearchBtn = document.getElementById('faq-search-btn');
  const homeCategoriesGrid = document.getElementById('home-categories-grid');
  const popularFaqLinks = document.querySelectorAll('.popular-faq-link');

  // 1. Theme Toggle
  const currentTheme = localStorage.getItem('theme') || 'dark';
  if (currentTheme === 'light') {
    document.body.classList.remove('dark-mode');
    themeToggleBtn.textContent = '🌙';
  } else {
    document.body.classList.add('dark-mode');
    themeToggleBtn.textContent = '☀️';
  }

  themeToggleBtn.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    themeToggleBtn.textContent = isDark ? '☀️' : '🌙';
  });

  // 2. Sidebar Navigation
  function switchSection(targetId, titleText) {
    contentSections.forEach(sec => sec.classList.remove('active'));
    document.getElementById(targetId).classList.add('active');
    pageTitle.textContent = titleText;
    
    // Close sidebar on mobile
    if (window.innerWidth <= 850) {
      sidebar.classList.remove('open');
    }
  }

  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      navLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      const targetId = link.getAttribute('data-target');
      if (targetId === 'faq' && !currentUserEmail) {
        alert("Please sign in to access FAQs.");
        loginModal.classList.add('active');
        return;
      }
      if (targetId === 'admin' && currentUserEmail) {
        alert("You are currently signed in as a student. Please log out first to access the Admin portal.");
        return;
      }
      switchSection(targetId, link.textContent.trim().replace(/^[\W_]+/, ''));
    });
  });

  hamburgerMenu.addEventListener('click', () => {
    if (window.innerWidth <= 850) {
      sidebar.classList.toggle('open');
    } else {
      sidebar.classList.toggle('collapsed');
    }
  });

  // 3. Render FAQ and Home Categories
  const faqContainer = document.getElementById('faq-container');
  
  function renderFaqs(searchTerm = "") {
    faqContainer.innerHTML = '';
    homeCategoriesGrid.innerHTML = '';
    
    const lowerSearch = searchTerm.toLowerCase();

    faqData.forEach((cat, catIndex) => {
      // Create Home Category Card
      const categoryCard = document.createElement('a');
      categoryCard.href = "#";
      categoryCard.className = 'category-card';
      categoryCard.innerHTML = `<span>${cat.category}</span>`;
      categoryCard.addEventListener('click', (e) => {
        e.preventDefault();
        if (!currentUserEmail) {
          alert("Please sign in to access FAQs.");
          loginModal.classList.add('active');
          return;
        }
        // Click the FAQ Nav Tab
        document.querySelector('[data-target="faq"]').click();
        
        // Scroll to the specific category in the FAQ section and highlight it
        setTimeout(() => {
          const targetCatElement = document.getElementById(`faq-cat-${catIndex}`);
          if (targetCatElement) {
            targetCatElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            
            // Highlight effect for the category block
            const originalBg = targetCatElement.style.backgroundColor;
            targetCatElement.style.transition = 'all 0.5s ease';
            targetCatElement.style.backgroundColor = 'rgba(99, 102, 241, 0.1)';
            targetCatElement.style.borderRadius = '12px';
            targetCatElement.style.padding = '1rem';
            
            setTimeout(() => {
              targetCatElement.style.backgroundColor = originalBg;
            }, 1500);
          }
        }, 100);
      });
      homeCategoriesGrid.appendChild(categoryCard);

      // Filter questions if searching
      const filteredQuestions = cat.questions.filter(qObj => 
        qObj.q.toLowerCase().includes(lowerSearch) || qObj.a.toLowerCase().includes(lowerSearch)
      );

      // If searching and no questions match this category, skip rendering the category
      if (searchTerm && filteredQuestions.length === 0) return;

      // Render FAQ Category
      const catDiv = document.createElement('div');
      catDiv.className = 'faq-category';
      catDiv.id = `faq-cat-${catIndex}`;
      
      const catTitle = document.createElement('h3');
      catTitle.className = 'faq-category-title';
      catTitle.textContent = cat.category;
      catDiv.appendChild(catTitle);

      // ADD DESCRIPTION IF EXISTS
      if (cat.description) {
        const catDesc = document.createElement('p');
        catDesc.className = 'faq-category-desc';
        catDesc.textContent = cat.description;
        catDiv.appendChild(catDesc);
      }

      const qsToRender = searchTerm ? filteredQuestions : cat.questions;

      qsToRender.forEach((qObj, qIndex) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'faq-item';
        // Auto-expand if searching to highlight results
        if (searchTerm) itemDiv.classList.add('active');
        
        // Highlight logic
        let questionText = qObj.q;
        let answerText = qObj.a;
        if (searchTerm) {
          const regex = new RegExp(`(${searchTerm})`, 'gi');
          questionText = questionText.replace(regex, '<span class="highlight">$1</span>');
          answerText = answerText.replace(regex, '<span class="highlight">$1</span>');
        }

        const btn = document.createElement('button');
        btn.className = 'faq-question';
        btn.innerHTML = `<span>${questionText}</span> <span class="faq-icon">▼</span>`;
        
        const ansDiv = document.createElement('div');
        ansDiv.className = 'faq-answer';
        ansDiv.innerHTML = `<div class="faq-answer-inner">${answerText}</div>`;
        
        btn.addEventListener('click', () => {
          if (!searchTerm) { // allow independent toggling if not searching
            document.querySelectorAll('.faq-item.active').forEach(item => {
              if (item !== itemDiv) item.classList.remove('active');
            });
          }
          itemDiv.classList.toggle('active');
        });

        itemDiv.appendChild(btn);
        itemDiv.appendChild(ansDiv);
        catDiv.appendChild(itemDiv);
      });

      faqContainer.appendChild(catDiv);
    });

    if (faqContainer.innerHTML === '') {
      faqContainer.innerHTML = `
        <div style="text-align: center; padding: 2rem;">
          <p style="margin-bottom: 1rem;">No FAQs match your search.</p>
          <button id="redirect-ask-btn" class="btn primary-btn">Click here to Ask a Query</button>
        </div>
      `;
      
      const redirectBtn = document.getElementById('redirect-ask-btn');
      if (redirectBtn) {
        redirectBtn.addEventListener('click', () => {
          document.querySelector('[data-target="my-queries"]')?.click();
          // Select Ask a Query tab
          const askTabBtn = document.querySelector('.query-tab-btn[data-qtab="ask"]') as HTMLElement;
          if (askTabBtn) askTabBtn.click();
          
          const askInput = document.getElementById('ask-query-input') as HTMLInputElement;
          const askBtn = document.getElementById('ask-query-search-btn') as HTMLElement;
          if (askInput && askBtn) {
            askInput.value = searchTerm;
            askBtn.click();
          }
        });
      }
    }
  }

  // Initial Render
  renderFaqs();

  // Search Logic
  function doSearch() {
    if (!currentUserEmail) {
      alert("Please sign in to search or view FAQs.");
      loginModal.classList.add('active');
      return;
    }
    const term = faqSearchInput.value.trim();
    document.querySelector('[data-target="faq"]').click();
    renderFaqs(term);
  }

  faqSearchBtn.addEventListener('click', doSearch);
  faqSearchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') doSearch();
  });

  homeViewFaqsBtn.addEventListener('click', () => {
    if (!currentUserEmail) {
      alert("Please sign in to access FAQs.");
      loginModal.classList.add('active');
      return;
    }
    document.querySelector('[data-target="faq"]').click();
  });

  // Popular FAQ clicks
  popularFaqLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      if (!currentUserEmail) {
        alert("Please sign in to search or view FAQs.");
        loginModal.classList.add('active');
        return;
      }
      faqSearchInput.value = e.target.textContent.trim().replace('?', '');
      doSearch();
    });
  });


  // 4. Modal Logic
  loginModalBtn.addEventListener('click', () => {
    loginModal.classList.add('active');
  });

  closeModalBtn.addEventListener('click', () => {
    loginModal.classList.remove('active');
  });

  // 5. Book Flip Logic
  goToSignupBtn.addEventListener('click', (e) => {
    e.preventDefault();
    flipPage.classList.add('flipped');
    signinForm.reset();
    loginError.style.display = 'none';
  });

  goToSigninBtn.addEventListener('click', (e) => {
    e.preventDefault();
    flipPage.classList.remove('flipped');
    signupForm.reset();
    signupError.style.display = 'none';
    signupSuccess.style.display = 'none';
  });

  const navMyQueries = document.getElementById('nav-my-queries');
  const myUnresolvedContainer = document.getElementById('my-unresolved-container');
  const myResolvedContainer = document.getElementById('my-resolved-container');
  
  // Tab logic
  const queryTabBtns = document.querySelectorAll('.query-tab-btn');
  const queryTabContents = document.querySelectorAll('.query-tab-content');
  
  queryTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      queryTabBtns.forEach(b => b.classList.remove('active'));
      queryTabContents.forEach(c => c.classList.remove('active'));
      
      btn.classList.add('active');
      const targetId = 'qtab-' + btn.getAttribute('data-qtab');
      const targetContent = document.getElementById(targetId);
      if (targetContent) targetContent.classList.add('active');
    });
  });

  // Ask a Query Logic
  const askQueryInput = document.getElementById('ask-query-input') as HTMLInputElement;
  const askQuerySearchBtn = document.getElementById('ask-query-search-btn');
  const askQueryResults = document.getElementById('ask-query-results');
  const raiseQueryContainer = document.getElementById('raise-query-container');
  const raiseQueryBtn = document.getElementById('raise-query-btn');
  let currentAskTerm = '';

  if (askQuerySearchBtn) {
    askQuerySearchBtn.addEventListener('click', () => {
      currentAskTerm = askQueryInput.value.trim();
      if (!currentAskTerm) return;
      
      const lowerSearch = currentAskTerm.toLowerCase();
      let foundMatches = false;
      askQueryResults!.innerHTML = '';
      
      faqData.forEach(cat => {
        const filteredQs = cat.questions.filter(qObj => 
          qObj.q.toLowerCase().includes(lowerSearch) || qObj.a.toLowerCase().includes(lowerSearch)
        );
        
        if (filteredQs.length > 0) {
          foundMatches = true;
          filteredQs.forEach(qObj => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'faq-item';
            
            let questionText = qObj.q;
            let answerText = qObj.a;
            const regex = new RegExp(`(${currentAskTerm})`, 'gi');
            questionText = questionText.replace(regex, '<span class="highlight">$1</span>');
            answerText = answerText.replace(regex, '<span class="highlight">$1</span>');
            
            const btn = document.createElement('button');
            btn.className = 'faq-question';
            btn.innerHTML = `<span>${questionText}</span> <span class="faq-icon">▼</span>`;
            
            const ansDiv = document.createElement('div');
            ansDiv.className = 'faq-answer';
            ansDiv.innerHTML = `<div class="faq-answer-inner">${answerText}</div>`;
            
            btn.addEventListener('click', () => {
              itemDiv.classList.toggle('active');
            });
            
            itemDiv.appendChild(btn);
            itemDiv.appendChild(ansDiv);
            askQueryResults!.appendChild(itemDiv);
          });
        }
      });
      
      if (foundMatches) {
        raiseQueryContainer!.style.display = 'none';
      } else {
        askQueryResults!.innerHTML = '<p class="text-center" style="margin-bottom: 1rem;">No matching FAQs found for your question.</p>';
        raiseQueryContainer!.style.display = 'block';
      }
    });
    
    askQueryInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') askQuerySearchBtn.click();
    });
  }

  if (raiseQueryBtn) {
    raiseQueryBtn.addEventListener('click', () => {
      if (currentAskTerm && currentUserEmail) {
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const timeStr = now.toTimeString().split(' ')[0];
        unresolvedQueries.push({ 
          term: currentAskTerm, 
          userName: currentUserName || 'Unknown', 
          userEmail: currentUserEmail, 
          date: dateStr, 
          time: timeStr 
        });
        saveState();
        
        askQueryInput.value = '';
        askQueryResults!.innerHTML = '';
        raiseQueryContainer!.style.display = 'none';
        
        // Switch to unresolved tab
        const unresolvedTabBtn = document.querySelector('.query-tab-btn[data-qtab="unresolved"]') as HTMLElement;
        if (unresolvedTabBtn) unresolvedTabBtn.click();
        
        renderMyQueries();
        alert('Your query has been raised to the admins and community!');
      }
    });
  }

  function renderMyQueries() {
    if (!myUnresolvedContainer || !myResolvedContainer) return;
    myUnresolvedContainer.innerHTML = '';
    myResolvedContainer.innerHTML = '';
    
    const myResolved = resolvedQueries.filter(q => q.userEmail === currentUserEmail);
    const myUnresolved = unresolvedQueries.filter(q => q.userEmail === currentUserEmail);
    
    // Render Unresolved
    if (myUnresolved.length === 0) {
      myUnresolvedContainer.innerHTML = '<p>You have no pending queries.</p>';
    } else {
      myUnresolved.forEach((q) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'faq-item';
        
        const btn = document.createElement('button');
        btn.className = 'faq-question';
        btn.innerHTML = `<span>${q.term}</span> <span class="faq-icon" style="opacity: 0.5;">🕒</span>`;
        
        const ansDiv = document.createElement('div');
        ansDiv.className = 'faq-answer';
        ansDiv.innerHTML = `<div class="faq-answer-inner">
          <p><em>Your query has been sent to the Admin team. Please check back later for an answer!</em></p>
        </div>`;
        
        btn.addEventListener('click', () => {
          itemDiv.classList.toggle('active');
        });
        itemDiv.appendChild(btn);
        itemDiv.appendChild(ansDiv);
        myUnresolvedContainer.appendChild(itemDiv);
      });
    }

    // Render Resolved
    if (myResolved.length === 0) {
      myResolvedContainer.innerHTML = '<p>You have no resolved queries yet.</p>';
    } else {
      myResolved.forEach((q) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'faq-item';
        
        const btn = document.createElement('button');
        btn.className = 'faq-question';
        btn.innerHTML = `<span>${q.term}</span> <span class="faq-icon">▼</span>`;
        
        const ansDiv = document.createElement('div');
        ansDiv.className = 'faq-answer';
        ansDiv.innerHTML = `<div class="faq-answer-inner">
          <p><strong>Answer:</strong> ${q.answer}</p>
          <p style="font-size: 0.8rem; margin-top: 0.5rem; opacity: 0.8;">Resolved by ${q.resolvedBy}</p>
        </div>`;
        
        btn.addEventListener('click', () => {
          itemDiv.classList.toggle('active');
        });
        itemDiv.appendChild(btn);
        itemDiv.appendChild(ansDiv);
        myResolvedContainer.appendChild(itemDiv);
      });
    }
  }

  const navCommunityQueries = document.getElementById('nav-community-queries');
  const communityQueriesContainer = document.getElementById('community-queries-container');

  function renderCommunityQueries() {
    communityQueriesContainer.innerHTML = '';
    
    const communityQueries = unresolvedQueries.filter(q => q.userEmail !== currentUserEmail && !q.proposedAnswer);
    
    if (communityQueries.length === 0) {
      communityQueriesContainer.innerHTML = '<p>There are no open questions from the community right now. Check back later!</p>';
      return;
    }

    communityQueries.forEach((q) => {
      const itemDiv = document.createElement('div');
      itemDiv.className = 'faq-item';
      
      const btn = document.createElement('button');
      btn.className = 'faq-question';
      btn.innerHTML = `<span>${q.term}</span> <span class="faq-icon">▼</span>`;
      
      const ansDiv = document.createElement('div');
      ansDiv.className = 'faq-answer';
      
      const innerDiv = document.createElement('div');
      innerDiv.className = 'faq-answer-inner';
      
      const infoP = document.createElement('p');
      infoP.style.fontSize = '0.9rem';
      infoP.style.marginBottom = '0.5rem';
      infoP.textContent = `Asked by: ${q.userName || 'A Student'}`;
      
      const textarea = document.createElement('textarea');
      textarea.rows = 3;
      textarea.style.cssText = 'width: 100%; margin-bottom: 0.5rem; padding: 0.5rem; border-radius: 6px; border: 1px solid rgba(255,255,255,0.2); background: var(--bg-tertiary); color: var(--text-primary);';
      textarea.placeholder = 'Write your proposed solution here...';
      
      const submitBtn = document.createElement('button');
      submitBtn.className = 'btn primary-btn btn-small';
      submitBtn.textContent = 'Submit Solution';
      
      submitBtn.addEventListener('click', () => {
        const solution = textarea.value.trim();
        if (solution) {
          q.proposedAnswer = solution;
          q.proposedBy = currentUserEmail;
          saveState();
          alert('Your solution has been submitted to the Admin for review! Thank you for helping the community.');
          renderCommunityQueries();
        }
      });
      
      innerDiv.appendChild(infoP);
      innerDiv.appendChild(textarea);
      innerDiv.appendChild(submitBtn);
      ansDiv.appendChild(innerDiv);
      
      btn.addEventListener('click', () => {
        itemDiv.classList.toggle('active');
      });

      itemDiv.appendChild(btn);
      itemDiv.appendChild(ansDiv);
      communityQueriesContainer.appendChild(itemDiv);
    });
  }

  // 6. User Auth Logic
  const navSpHistory = document.getElementById('nav-sp-history');
  const spHistoryTableBody = document.getElementById('sp-history-table-body');
  const userSpCount = document.getElementById('user-sp-count');
  const navLeaderboard = document.getElementById('nav-leaderboard');
  const leaderboardTableBody = document.getElementById('leaderboard-table-body');
  const spGraphContainer = document.getElementById('sp-graph-container');
  const leaderboardRankBanner = document.getElementById('leaderboard-rank-banner');

  function renderSpHistory() {
    spHistoryTableBody.innerHTML = '';
    const user = users.find(u => u.email === currentUserEmail);
    if (!user || !user.spHistory || user.spHistory.length === 0) {
      spHistoryTableBody.innerHTML = '<tr><td colspan="4" class="text-center">No SP history available.</td></tr>';
      return;
    }

    // Render history in reverse chronological order
    const historyRev = [...user.spHistory].reverse();
    historyRev.forEach(entry => {
      const tr = document.createElement('tr');
      const isAward = entry.type === 'award';
      tr.innerHTML = `
        <td>${entry.date}</td>
        <td><span style="color: ${isAward ? 'var(--color-3)' : 'var(--error-color)'}; font-weight: bold;">${isAward ? 'Awarded' : 'Penalized'}</span></td>
        <td style="font-weight: bold;">${entry.amount > 0 ? '+' : ''}${entry.amount}</td>
        <td style="max-width: 250px; word-wrap: break-word; font-style: italic;">"${renderLongText(entry.query)}"</td>
      `;
      spHistoryTableBody.appendChild(tr);
    });
  }

  function renderLeaderboard() {
    if (!leaderboardTableBody || !spGraphContainer || !leaderboardRankBanner) return;
    
    // Sort active users by SP
    const activeUsers = users.filter(u => u.status === 'Active').sort((a, b) => (b.sp || 0) - (a.sp || 0));
    
    leaderboardTableBody.innerHTML = '';
    let currentUserRank = -1;
    
    activeUsers.forEach((u, index) => {
      const rank = index + 1;
      if (u.email === currentUserEmail) currentUserRank = rank;
      
      const tr = document.createElement('tr');
      if (u.email === currentUserEmail) tr.className = 'highlight-row';
      tr.innerHTML = `
        <td style="font-weight: bold; font-size: 1.1rem;">${rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '#' + rank}</td>
        <td>${u.name || 'Unknown'} ${u.email === currentUserEmail ? '(You)' : ''}</td>
        <td style="font-weight: bold;">${u.sp || 0} SP</td>
      `;
      leaderboardTableBody.appendChild(tr);
    });
    
    if (currentUserRank !== -1) {
      leaderboardRankBanner.textContent = `You are Rank #${currentUserRank} out of ${activeUsers.length} students!`;
    } else {
      leaderboardRankBanner.textContent = `See where you stand among your peers!`;
    }
    
    renderSPGraph();
  }

  function renderSPGraph() {
    if (!spGraphContainer) return;
    spGraphContainer.innerHTML = '';
    
    const user = users.find(u => u.email === currentUserEmail);
    if (!user || !user.spHistory || user.spHistory.length === 0) {
      spGraphContainer.innerHTML = '<p style="color: var(--text-secondary); width: 100%; text-align: center; margin-bottom: 2rem;">No SP activity found.</p>';
      return;
    }
    
    // Aggregate by Date
    const dailySP: Record<string, number> = {};
    user.spHistory.forEach(entry => {
      if (!dailySP[entry.date]) dailySP[entry.date] = 0;
      dailySP[entry.date] += entry.amount;
    });
    
    const dates = Object.keys(dailySP);
    const recentDates = dates.slice(-7); 
    
    let maxAbsValue = 10; 
    recentDates.forEach(d => {
      if (Math.abs(dailySP[d]) > maxAbsValue) maxAbsValue = Math.abs(dailySP[d]);
    });
    
    recentDates.forEach(d => {
      const val = dailySP[d];
      let typeClass = 'neutral';
      if (val > 0) typeClass = 'positive';
      else if (val < 0) typeClass = 'negative';
      
      const heightPercent = Math.max(10, Math.floor((Math.abs(val) / maxAbsValue) * 100));
      
      const wrapper = document.createElement('div');
      wrapper.className = 'graph-bar-wrapper';
      
      const bar = document.createElement('div');
      bar.className = `graph-bar ${typeClass}`;
      bar.style.height = '0%';
      
      const valLabel = document.createElement('div');
      valLabel.className = 'graph-value';
      valLabel.textContent = val > 0 ? '+' + val : val.toString();
      
      bar.appendChild(valLabel);
      
      const dateLabel = document.createElement('div');
      dateLabel.className = 'graph-label';
      dateLabel.textContent = d.split('/')[0] + '/' + d.split('/')[1]; // Shorten date
      
      wrapper.appendChild(bar);
      wrapper.appendChild(dateLabel);
      
      spGraphContainer.appendChild(wrapper);
      
      // Animate
      setTimeout(() => {
        bar.style.height = `${heightPercent}%`;
      }, 50);
    });
  }

  function loginUser(email) {
    currentUserEmail = email;
    loginModal.classList.remove('active');
    authSection.style.display = 'none';
    userProfile.style.display = 'flex';
    userEmailDisplay.textContent = email;
    
    // Clear search bar to prevent User1's search from leaking to User2
    faqSearchInput.value = '';
    renderFaqs();
    
    navMyQueries.style.display = 'flex';
    navCommunityQueries.style.display = 'flex';
    navSpHistory.style.display = 'flex';
    if (navLeaderboard) navLeaderboard.style.display = 'flex';
    document.getElementById('popular-faq-list-container').style.display = 'block';
    document.getElementById('popular-faq-login-msg').style.display = 'none';
    
    // Update last sign in and SP
    const user = users.find(u => u.email === email);
    if (user) {
      currentUserName = user.name || "Unknown";
      user.lastSignIn = new Date().toLocaleString();
      if (user.sp === undefined) user.sp = 0;
      userSpCount.textContent = user.sp;
      saveState();
    }

    renderMyQueries();
    renderCommunityQueries();
    renderSpHistory();
    renderLeaderboard();

    // Switch back to Home page
    document.querySelector('[data-target="home"]').click();
  }

  logoutBtn.addEventListener('click', () => {
    currentUserEmail = null;
    currentUserName = null;
    
    authSection.style.display = 'flex';
    userProfile.style.display = 'none';
    
    navMyQueries.style.display = 'none';
    navCommunityQueries.style.display = 'none';
    navSpHistory.style.display = 'none';
    if (navLeaderboard) navLeaderboard.style.display = 'none';
    document.getElementById('popular-faq-list-container').style.display = 'none';
    document.getElementById('popular-faq-login-msg').style.display = 'block';
    
    if (myUnresolvedContainer) myUnresolvedContainer.innerHTML = '';
    if (myResolvedContainer) myResolvedContainer.innerHTML = '';
    communityQueriesContainer.innerHTML = '';
    
    // Clear search bar
    faqSearchInput.value = '';
    renderFaqs();
    
    // Also lock admin if logged out
    lockAdmin();
    
    // Switch back to Home page
    document.querySelector('[data-target="home"]').click();
    
    // Clear sign in form
    signinForm.reset();
  });

  signupForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;

    if (users.some(u => u.email === email)) {
      signupError.style.display = 'block';
    } else {
      const currentDateTime = new Date().toLocaleString();
      users.push({ name, email, password, date: currentDateTime, status: 'Active', lastSignIn: 'Never', sp: 0, spHistory: [] });
      saveState();
      signupError.style.display = 'none';
      signupSuccess.style.display = 'block';
      signupForm.reset();
      
      setTimeout(() => {
        flipPage.classList.remove('flipped');
        signupSuccess.style.display = 'none';
        document.getElementById('signin-email').value = email;
      }, 1500);
    }
  });

  signinForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('signin-email').value;
    const password = document.getElementById('signin-password').value;

    const user = users.find(u => u.email === email && u.password === password);
    if (user) {
      loginError.style.display = 'none';
      loginUser(email);
    } else {
      loginError.style.display = 'block';
    }
  });

  // 7. Admin Auth Logic
  const adminQueriesTableBody = document.getElementById('admin-queries-table-body');
  const adminResolvedTableBody = document.getElementById('admin-resolved-table-body');
  
  // Resolve Modal Elements
  const resolveModal = document.getElementById('resolve-modal');
  const resolveQueryText = document.getElementById('resolve-query-text');
  const resolveAnswerInput = document.getElementById('resolve-answer-input');
  const resolveSubmitBtn = document.getElementById('resolve-submit-btn');
  const resolveCancelBtn = document.getElementById('resolve-cancel-btn');
  let currentResolveIndex = null;
  
  function renderLongText(text) {
    if (!text) return '-';
    if (text.length > 50) {
      return `<details style="cursor: pointer;">
                <summary style="outline: none; font-weight: 500;">${text.substring(0, 50)}...</summary>
                <div style="margin-top: 0.5rem; padding: 0.8rem; background: rgba(255,255,255,0.05); border-radius: 6px; font-weight: normal; line-height: 1.4;">
                  ${text}
                </div>
              </details>`;
    }
    return text;
  }

  function renderAdminUsersTable() {
    adminUsersTableBody.innerHTML = '';
    users.forEach(u => {
      const tr = document.createElement('tr');
      const badgeClass = u.status === 'Active' ? 'status-active' : '';
      tr.innerHTML = `
        <td>${u.name || 'Unknown'}</td>
        <td>${u.email}</td>
        <td>${u.sp !== undefined ? u.sp : 0} SP</td>
        <td><span class="status-badge ${badgeClass}">${u.status}</span></td>
        <td>${u.date}</td>
        <td>${u.lastSignIn || 'Never'}</td>
      `;
      adminUsersTableBody.appendChild(tr);
    });
    
    adminQueriesTableBody.innerHTML = '';
    unresolvedQueries.forEach((q, index) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="max-width: 300px; word-wrap: break-word;">${renderLongText(q.term)}</td>
        <td>${q.userName || 'Unknown'}</td>
        <td>${q.userEmail}</td>
        <td>${q.date}</td>
        <td>${q.time || '-'}</td>
      `;
      const actionTd = document.createElement('td');
      actionTd.style.display = 'flex';
      actionTd.style.gap = '0.5rem';
      
      const resolveBtn = document.createElement('button');
      resolveBtn.className = 'btn primary-btn';
      resolveBtn.style.padding = '0.4rem 0.8rem';
      resolveBtn.textContent = 'Resolve';
      resolveBtn.onclick = () => {
        currentResolveIndex = index;
        let queryDetails = `Question: "${q.term}" (Asked by ${q.userName || q.userEmail})`;
        if (q.proposedAnswer) {
          queryDetails += `<br><br><span style="color: var(--accent-secondary);">💡 A solution has been proposed by ${q.proposedBy}! Please review it below.</span>`;
        }
        resolveQueryText.innerHTML = queryDetails;
        resolveAnswerInput.value = q.proposedAnswer || '';
        resolveModal.classList.add('active');
      };
      
      const rejectBtn = document.createElement('button');
      rejectBtn.className = 'btn';
      rejectBtn.style.padding = '0.4rem 0.8rem';
      rejectBtn.style.backgroundColor = '#ef4444';
      rejectBtn.style.color = '#fff';
      rejectBtn.textContent = 'Reject';
      rejectBtn.onclick = () => {
        currentRejectIndex = index;
        rejectQueryText.textContent = `Question: "${q.term}" (Asked by ${q.userName || q.userEmail})`;
        rejectPenaltySelect.value = "0";
        rejectModal.classList.add('active');
      };

      actionTd.appendChild(resolveBtn);
      actionTd.appendChild(rejectBtn);
      tr.appendChild(actionTd);
      
      adminQueriesTableBody.appendChild(tr);
    });

    adminResolvedTableBody.innerHTML = '';
    resolvedQueries.forEach(q => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="max-width: 250px; word-wrap: break-word;">${renderLongText(q.term)}</td>
        <td style="max-width: 250px; word-wrap: break-word;">${renderLongText(q.answer)}</td>
        <td>${q.userName || 'Unknown'}</td>
        <td>${q.resolvedBy}</td>
      `;
      adminResolvedTableBody.appendChild(tr);
    });
  }

  resolveCancelBtn.addEventListener('click', () => {
    resolveModal.classList.remove('active');
  });

  resolveSubmitBtn.addEventListener('click', () => {
    const answer = resolveAnswerInput.value.trim();
    if (!answer) return;
    
    if (currentResolveIndex !== null) {
      const queryToResolve = unresolvedQueries[currentResolveIndex];
      
      // Award SP if proposed by another student
      if (queryToResolve.proposedBy) {
        const proposer = users.find(u => u.email === queryToResolve.proposedBy);
        if (proposer) {
          if (proposer.sp === undefined) proposer.sp = 0;
          if (!proposer.spHistory) proposer.spHistory = [];
          
          proposer.sp += 30;
          proposer.spHistory.push({
            query: queryToResolve.term,
            amount: 30,
            type: 'award',
            date: new Date().toLocaleDateString()
          });
        }
      }

      resolvedQueries.push({
        term: queryToResolve.term,
        answer: answer,
        userName: queryToResolve.userName,
        userEmail: queryToResolve.userEmail,
        resolvedBy: currentAdminEmail
      });
      unresolvedQueries.splice(currentResolveIndex, 1);
      saveState();
      renderAdminUsersTable();
      resolveModal.classList.remove('active');
    }
  });

  rejectCancelBtn.addEventListener('click', () => {
    rejectModal.classList.remove('active');
  });

  rejectSubmitBtn.addEventListener('click', () => {
    if (currentRejectIndex !== null) {
      const queryToReject = unresolvedQueries[currentRejectIndex];
      const penaltyStr = rejectPenaltySelect.value;
      const penalty = parseInt(penaltyStr, 10);
      
      // Apply penalty to the user who asked
      if (penalty > 0) {
        const offendingUser = users.find(u => u.email === queryToReject.userEmail);
        if (offendingUser) {
          if (offendingUser.sp === undefined) offendingUser.sp = 0;
          if (!offendingUser.spHistory) offendingUser.spHistory = [];
          
          offendingUser.sp -= penalty;
          offendingUser.spHistory.push({
            query: queryToReject.term,
            amount: -penalty,
            type: 'penalty',
            date: new Date().toLocaleDateString()
          });
        }
      }
      
      unresolvedQueries.splice(currentRejectIndex, 1);
      saveState();
      renderAdminUsersTable();
      rejectModal.classList.remove('active');
    }
  });

  const adminEmail = document.getElementById('admin-email');
  const adminSignupBtn = document.getElementById('admin-signup-btn');
  const adminSignupSuccess = document.getElementById('admin-signup-success');
  const toggleAdminFormBtn = document.getElementById('toggle-admin-form');
  const adminFormTitle = document.getElementById('admin-form-title');
  const adminFormSubtitle = document.getElementById('admin-form-subtitle');
  let isAdminSignupMode = false;

  function lockAdmin() {
    currentAdminEmail = null;
    adminStep3.style.display = 'none';
    adminStep2.style.display = 'none';
    adminStep1.style.display = 'block';
    adminSecurityKey.value = '';
    adminEmail.value = '';
    adminPassword.value = '';
    adminKeyError.style.display = 'none';
    adminLoginError.style.display = 'none';
    adminSignupSuccess.style.display = 'none';
  }

  // Step 1 -> Step 2
  adminVerifyKeyBtn.addEventListener('click', () => {
    if (adminSecurityKey.value === ADMIN_SECURITY_KEY) {
      adminKeyError.style.display = 'none';
      adminStep1.style.display = 'none';
      adminStep2.style.display = 'block';
    } else {
      adminKeyError.style.display = 'block';
    }
  });

  // Toggle Admin Login / Signup
  toggleAdminFormBtn.addEventListener('click', (e) => {
    e.preventDefault();
    isAdminSignupMode = !isAdminSignupMode;
    adminLoginError.style.display = 'none';
    adminSignupSuccess.style.display = 'none';
    adminEmail.value = '';
    adminPassword.value = '';

    if (isAdminSignupMode) {
      adminFormTitle.textContent = 'Create Admin Account';
      adminFormSubtitle.textContent = 'Register a new admin with your email and password.';
      adminLoginBtn.style.display = 'none';
      adminSignupBtn.style.display = 'inline-block';
      toggleAdminFormBtn.textContent = 'Already have an admin account? Sign in';
    } else {
      adminFormTitle.textContent = 'Admin Login';
      adminFormSubtitle.textContent = 'Please sign in with your individual administrator credentials.';
      adminLoginBtn.style.display = 'inline-block';
      adminSignupBtn.style.display = 'none';
      toggleAdminFormBtn.textContent = 'Create a new admin account';
    }
  });

  // Admin Signup Logic
  adminSignupBtn.addEventListener('click', () => {
    const email = adminEmail.value.trim();
    const pass = adminPassword.value.trim();
    
    if (!email || !pass) {
      adminLoginError.textContent = 'Please enter an email and password.';
      adminLoginError.style.display = 'block';
      return;
    }

    if (admins.some(a => a.email === email)) {
      adminLoginError.textContent = 'Admin with this email already exists.';
      adminLoginError.style.display = 'block';
    } else {
      admins.push({ email, password: pass });
      saveState();
      adminLoginError.style.display = 'none';
      adminSignupSuccess.style.display = 'block';
      adminEmail.value = '';
      adminPassword.value = '';
    }
  });

  // Step 2 -> Step 3 (Admin Login Logic)
  adminLoginBtn.addEventListener('click', () => {
    const uEmail = adminEmail.value.trim();
    const uPass = adminPassword.value.trim();
    
    const admin = admins.find(a => a.email === uEmail && a.password === uPass);
    if (admin) {
      currentAdminEmail = uEmail;
      adminLoginError.style.display = 'none';
      adminStep2.style.display = 'none';
      adminStep3.style.display = 'block';
      renderAdminUsersTable();
    } else {
      adminLoginError.textContent = 'Invalid Admin Email or Password.';
      adminLoginError.style.display = 'block';
    }
  });

  adminLockBtn.addEventListener('click', lockAdmin);

});
