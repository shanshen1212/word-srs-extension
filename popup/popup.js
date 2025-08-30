// popup script: review flow + words management
// 管理复习状态、单词列表和用户交互

console.log('popup.js 开始加载');

class PopupApp {
  constructor() {
    console.log('PopupApp 构造函数被调用');
    this.currentView = 'review';
    this.reviewQueue = [];
    this.currentReviewIndex = 0;
    this.reviewedCount = 0;
    this.allWords = [];
    this.filteredWords = [];
    this.isShowingAnswer = false;
    
    this.init();
  }
  
  async init() {
    console.log('PopupApp init 开始');
    try {
      this.bindEvents();
      await this.loadData();
      this.setupMessageListener();
      
      // 启动时更新徽标
      this.updateBadge();
      
      this.hideLoading();
      console.log('PopupApp init 完成');
    } catch (error) {
      console.error('PopupApp init 失败:', error);
    }
  }
  
  bindEvents() {
    console.log('绑定事件开始');
    
    // 导航切换
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.switchView(e.target.dataset.view);
      });
    });
    
    // 复习相关事件 - 添加空指针保护
    const showAnswerBtn = document.getElementById('show-answer');
    if (showAnswerBtn) {
      showAnswerBtn.addEventListener('click', () => {
        this.showAnswer();
      });
    }
    
    document.querySelectorAll('.rating-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const rating = parseInt(e.target.dataset.rating);
        this.reviewWord(rating);
      });
    });
    
    const continueBtn = document.getElementById('continue-learning');
    if (continueBtn) {
      continueBtn.addEventListener('click', () => {
        this.switchView('words');
      });
    }
    
    // 搜索相关事件
    const searchInput = document.getElementById('search-input');
    const searchClear = document.getElementById('search-clear');
    
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.filterWords(e.target.value);
      });
    }
    
    if (searchClear) {
      searchClear.addEventListener('click', () => {
        if (searchInput) {
          searchInput.value = '';
          this.filterWords('');
          searchInput.focus();
        }
      });
    }
    
    console.log('事件绑定完成');
  }
  
  setupMessageListener() {
    // 监听来自 background 的消息
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'WORDS_UPDATED') {
        // 词库更新，防抖重新加载数据
        if (this._loading) return;
        this.loadData();
      }
    });
  }
  
  async loadData() {
    if (this._loading) return;
    this._loading = true;
    
    console.log('开始加载数据');
    
    try {
      // 检查 chrome.runtime 是否可用
      if (!chrome.runtime || !chrome.runtime.sendMessage) {
        throw new Error('chrome.runtime.sendMessage 不可用');
      }
      
      console.log('chrome.runtime 可用，发送 GET_TODAY_REVIEWS 消息');
      
      // 使用 Promise 包装发送消息
      const reviewResponse = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'GET_TODAY_REVIEWS' }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('GET_TODAY_REVIEWS chrome.runtime.lastError:', chrome.runtime.lastError);
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            console.log('收到复习数据响应:', response);
            resolve(response);
          }
        });
      });
      
      console.log('发送 GET_ALL_WORDS 消息');
      const wordsResponse = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'GET_ALL_WORDS' }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('GET_ALL_WORDS chrome.runtime.lastError:', chrome.runtime.lastError);
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            console.log('收到单词数据响应:', response);
            resolve(response);
          }
        });
      });
      
      // 检查响应格式
      if (!reviewResponse) {
        throw new Error('GET_TODAY_REVIEWS 返回 null');
      }
      if (!wordsResponse) {
        throw new Error('GET_ALL_WORDS 返回 null');
      }
      
      this.reviewQueue = reviewResponse.reviews || [];
      this.allWords = wordsResponse.words || [];
      this.filteredWords = [...this.allWords];
      
      console.log('数据处理完成:', { 
        reviewCount: this.reviewQueue.length, 
        totalWords: this.allWords.length 
      });
      
      this.currentReviewIndex = 0;
      this.reviewedCount = 0;
      this.isShowingAnswer = false;
      
      this.updateUI();
    } catch (error) {
      console.error('loadData 详细错误:', error);
      console.error('错误堆栈:', error.stack);
      this.showError('加载数据失败: ' + error.message);
      
      // 降级处理：显示空状态
      this.reviewQueue = [];
      this.allWords = [];
      this.filteredWords = [];
      this.updateUI();
    } finally {
      this._loading = false;
    }
  }
  
  async updateBadge() {
    try {
      await chrome.runtime.sendMessage({ type: 'UPDATE_BADGE' });
    } catch (error) {
      console.warn('Failed to update badge:', error);
    }
  }
  
  updateUI() {
    console.log('更新UI');
    this.updateCounts();
    this.updateReviewView();
    this.updateWordsView();
  }
  
  updateCounts() {
    const reviewCountEl = document.getElementById('review-count');
    const totalCountEl = document.getElementById('total-count');
    
    if (reviewCountEl) reviewCountEl.textContent = this.reviewQueue.length;
    if (totalCountEl) totalCountEl.textContent = this.allWords.length;
  }
  
  updateReviewView() {
    const hasReviews = this.reviewQueue.length > 0;
    const currentReview = this.reviewQueue[this.currentReviewIndex];
    
    // 更新进度
    const progress = this.reviewQueue.length > 0 ? 
                    (this.reviewedCount / this.reviewQueue.length) * 100 : 100;
    const progressFillEl = document.getElementById('progress-fill');
    const progressTextEl = document.getElementById('progress-text');
    
    if (progressFillEl) progressFillEl.style.width = `${progress}%`;
    if (progressTextEl) progressTextEl.textContent = `${this.reviewedCount} / ${this.reviewQueue.length}`;
    
    // 显示/隐藏相应的状态
    const emptyState = document.getElementById('empty-review');
    const reviewCard = document.getElementById('review-card');
    const reviewComplete = document.getElementById('review-complete');
    
    if (this.reviewQueue.length === 0) {
      // 没有复习内容
      this.showElement(emptyState);
      this.hideElement(reviewCard);
      this.hideElement(reviewComplete);
    } else if (this.currentReviewIndex >= this.reviewQueue.length) {
      // 复习完成
      this.hideElement(emptyState);
      this.hideElement(reviewCard);
      this.showElement(reviewComplete);
      const reviewSummaryEl = document.getElementById('review-summary');
      if (reviewSummaryEl) {
        reviewSummaryEl.textContent = `复习了 ${this.reviewedCount} 个单词`;
      }
    } else {
      // 显示当前复习卡片
      this.hideElement(emptyState);
      this.hideElement(reviewComplete);
      this.showElement(reviewCard);
      this.updateReviewCard(currentReview);
    }
  }
  
  updateReviewCard(word) {
    if (!word) return;
    
    // 重置卡片状态
    this.isShowingAnswer = false;
    this.hideElement(document.getElementById('card-back'));
    this.hideElement(document.getElementById('rating-buttons'));
    this.showElement(document.getElementById('show-answer'));
    
    // 更新卡片内容
    const wordTermEl = document.getElementById('word-term');
    const wordLangEl = document.getElementById('word-lang');
    const wordSourceEl = document.getElementById('word-source');
    const wordContextEl = document.getElementById('word-context');
    
    if (wordTermEl) wordTermEl.textContent = word.term;
    if (wordLangEl) wordLangEl.textContent = word.lang.toUpperCase();
    if (wordSourceEl) wordSourceEl.textContent = this.formatSourceUrl(word.sourceUrl);
    if (wordContextEl) wordContextEl.textContent = word.context || '无上下文';
    
    const noteContainer = document.getElementById('word-note-container');
    const noteElement = document.getElementById('word-note');
    if (word.note && word.note.trim()) {
      if (noteElement) noteElement.textContent = word.note;
      this.showElement(noteContainer);
    } else {
      this.hideElement(noteContainer);
    }
  }
  
  showAnswer() {
    this.isShowingAnswer = true;
    this.showElement(document.getElementById('card-back'));
    this.showElement(document.getElementById('rating-buttons'));
    this.hideElement(document.getElementById('show-answer'));
  }
  
  async reviewWord(quality) {
    const currentWord = this.reviewQueue[this.currentReviewIndex];
    if (!currentWord) return;
    
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'REVIEW_WORD',
        word: currentWord,
        quality: quality
      });
      
      if (response.success) {
        this.reviewedCount++;
        this.currentReviewIndex++;
        
        // 显示短暂的成功提示
        this.showSuccess(this.getQualityText(quality));
        
        // 延迟更新界面，让用户看到反馈
        setTimeout(() => {
          this.updateReviewView();
        }, 500);
        
      } else {
        this.showError('复习失败');
      }
    } catch (error) {
      console.error('Review failed:', error);
      this.showError('复习失败: ' + error.message);
    }
  }
  
  getQualityText(quality) {
    const qualityTexts = {
      0: '需要再次复习',
      3: '有点困难',
      4: '记住了',
      5: '很简单'
    };
    return qualityTexts[quality] || '已复习';
  }
  
  switchView(view) {
    this.currentView = view;
    
    // 更新导航状态
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === view);
    });
    
    // 切换视图
    document.querySelectorAll('.view').forEach(viewEl => {
      viewEl.classList.toggle('hidden', !viewEl.id.startsWith(view));
    });
    
    // 视图特定逻辑
    if (view === 'words') {
      this.renderWordsList();
    }
  }
  
  filterWords(query) {
    const lowerQuery = query.toLowerCase().trim();
    
    if (!lowerQuery) {
      this.filteredWords = [...this.allWords];
    } else {
      this.filteredWords = this.allWords.filter(word => 
        word.term.toLowerCase().includes(lowerQuery) ||
        (word.context && word.context.toLowerCase().includes(lowerQuery)) ||
        (word.note && word.note.toLowerCase().includes(lowerQuery))
      );
    }
    
    this.updateWordsView();
  }
  
  updateWordsView() {
    const hasWords = this.filteredWords.length > 0;
    const emptyState = document.getElementById('empty-words');
    const wordsList = document.getElementById('words-list');
    
    if (!hasWords) {
      if (this.allWords.length === 0) {
        // 完全没有单词
        const emptyTitle = emptyState?.querySelector('h3');
        const emptyText = emptyState?.querySelector('p');
        if (emptyTitle) emptyTitle.textContent = '还没有保存任何单词';
        if (emptyText) emptyText.textContent = '在网页上选择文字，点击保存按钮开始构建你的生词本。';
      } else {
        // 搜索无结果
        const emptyTitle = emptyState?.querySelector('h3');
        const emptyText = emptyState?.querySelector('p');
        if (emptyTitle) emptyTitle.textContent = '未找到匹配的单词';
        if (emptyText) emptyText.textContent = '尝试使用其他关键词搜索。';
      }
      this.showElement(emptyState);
      this.hideElement(wordsList);
    } else {
      this.hideElement(emptyState);
      this.showElement(wordsList);
      this.renderWordsList();
    }
    
    // 更新统计
    const statsText = this.allWords.length === this.filteredWords.length ?
                     `共 ${this.allWords.length} 个单词` :
                     `显示 ${this.filteredWords.length} / ${this.allWords.length} 个单词`;
    const wordsStatsEl = document.getElementById('words-stats-text');
    if (wordsStatsEl) wordsStatsEl.textContent = statsText;
  }
  
  renderWordsList() {
    const container = document.getElementById('words-list');
    if (!container) return;
    
    container.innerHTML = '';
    
    this.filteredWords.forEach(word => {
      const wordEl = this.createWordElement(word);
      container.appendChild(wordEl);
    });
  }
  
  createWordElement(word) {
    const div = document.createElement('div');
    div.className = 'word-item';
    div.innerHTML = `
      <div class="word-item-header">
        <span class="word-item-term">${this.escapeHtml(word.term)}</span>
        <span class="word-item-lang">${word.lang.toUpperCase()}</span>
      </div>
      <div class="word-item-context">${this.escapeHtml(word.context || '无上下文')}</div>
      <div class="word-item-meta">
        <span class="word-item-date">${this.formatDate(word.addedAt)}</span>
        <div class="word-item-actions">
          <button class="word-action-btn edit" data-id="${word.id}">编辑</button>
          <button class="word-action-btn delete" data-id="${word.id}">删除</button>
        </div>
      </div>
    `;
    
    // 绑定事件
    div.querySelector('.edit').addEventListener('click', () => {
      this.editWordNote(word);
    });
    
    div.querySelector('.delete').addEventListener('click', () => {
      this.deleteWord(word);
    });
    
    // 点击源URL
    if (word.sourceUrl) {
      div.style.cursor = 'pointer';
      div.addEventListener('click', (e) => {
        if (!(e.target.closest && e.target.closest('.word-action-btn'))) {
          chrome.tabs.create({ url: word.sourceUrl });
        }
      });
    }
    
    return div;
  }
  
  async editWordNote(word) {
    const newNote = prompt('编辑备注:', word.note || '');
    
    if (newNote !== null) { // 用户没有取消
      try {
        const updatedWord = { ...word, note: newNote.trim() };
        const response = await chrome.runtime.sendMessage({
          type: 'UPDATE_WORD',
          word: updatedWord
        });
        
        if (response.success) {
          // 更新本地数据
          const index = this.allWords.findIndex(w => w.id === word.id);
          if (index !== -1) {
            this.allWords[index] = updatedWord;
            const searchInput = document.getElementById('search-input');
            this.filterWords(searchInput ? searchInput.value : '');
          }
          this.showSuccess('备注已更新');
        } else {
          this.showError('更新失败');
        }
      } catch (error) {
        console.error('Update failed:', error);
        this.showError('更新失败: ' + error.message);
      }
    }
  }
  
  async deleteWord(word) {
    if (!confirm(`确定要删除单词 "${word.term}" 吗？`)) {
      return;
    }
    
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'DELETE_WORD',
        wordId: word.id
      });
      
      if (response.success) {
        // 从本地数据中移除
        this.allWords = this.allWords.filter(w => w.id !== word.id);
        const searchInput = document.getElementById('search-input');
        this.filterWords(searchInput ? searchInput.value : '');
        
        // 如果删除的是当前复习队列中的词，也需要更新复习队列
        this.reviewQueue = this.reviewQueue.filter(w => w.id !== word.id);
        
        this.updateCounts();
        this.showSuccess('单词已删除');
      } else {
        this.showError('删除失败');
      }
    } catch (error) {
      console.error('Delete failed:', error);
      this.showError('删除失败: ' + error.message);
    }
  }
  
  // 工具方法
  formatSourceUrl(url) {
    if (!url) return '未知来源';
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      return '未知来源';
    }
  }
  
  formatDate(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return '今天';
    if (diffDays === 1) return '昨天';
    if (diffDays < 7) return `${diffDays}天前`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}周前`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}月前`;
    return `${Math.floor(diffDays / 365)}年前`;
  }
  
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  showElement(element) {
    if (element) element.classList.remove('hidden');
  }
  
  hideElement(element) {
    if (element) element.classList.add('hidden');
  }
  
  showLoading() {
    this.showElement(document.getElementById('loading'));
  }
  
  hideLoading() {
    console.log('隐藏加载界面');
    this.hideElement(document.getElementById('loading'));
  }
  
  showSuccess(message) {
    this.showToast(message, 'success');
  }
  
  showError(message) {
    this.showToast(message, 'error');
  }
  
  showToast(message, type = 'info') {
    // 创建toast元素
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      z-index: 10000;
      opacity: 0;
      transform: translateX(100%);
      transition: all 0.3s ease;
      max-width: 200px;
      word-break: break-word;
    `;
    
    // 设置样式
    if (type === 'success') {
      toast.style.background = '#4CAF50';
      toast.style.color = 'white';
    } else if (type === 'error') {
      toast.style.background = '#f44336';
      toast.style.color = 'white';
    } else {
      toast.style.background = '#2196F3';
      toast.style.color = 'white';
    }
    
    toast.textContent = message;
    document.body.appendChild(toast);
    
    // 显示动画
    setTimeout(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(0)';
    }, 10);
    
    // 自动移除
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    }, 3000);
  }
}

// 启动应用
console.log('准备启动 PopupApp');
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM 加载完成，创建 PopupApp');
  new PopupApp();
});