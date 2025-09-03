// popup script: review flow + words management + speech synthesis + word detail view + mastery tracking
// 管理复习状态、单词列表、用户交互、发音功能、单词详情页和掌握度追踪

console.log('popup.js 开始加载');

// 发音管理类
class SpeechManager {
  constructor() {
    this.isSupported = 'speechSynthesis' in window;
    this.isSpeaking = false;
    this.currentUtterance = null;
    this.voices = [];
    
    if (this.isSupported) {
      this.loadVoices();
      // 监听语音列表变化（某些浏览器需要异步加载）
      speechSynthesis.onvoiceschanged = () => {
        this.loadVoices();
      }
    }
  }
  
  loadVoices() {
    this.voices = speechSynthesis.getVoices();
    console.log('可用语音数量:', this.voices.length);
  }
  
  // 获取最适合的语音
  getBestVoice(lang) {
    if (!this.voices.length) {
      this.loadVoices();
    }
    
    // 优先级：完全匹配 > 语言匹配 > 默认
    const exactMatch = this.voices.find(voice => 
      voice.lang === lang && voice.localService
    );
    if (exactMatch) return exactMatch;
    
    const langMatch = this.voices.find(voice => 
      voice.lang.startsWith(lang.split('-')[0]) && voice.localService
    );
    if (langMatch) return langMatch;
    
    // 对于英文，尝试找美式或英式英语
    if (lang.startsWith('en')) {
      const enVoice = this.voices.find(voice => 
        (voice.lang.includes('en-US') || voice.lang.includes('en-GB')) && voice.localService
      );
      if (enVoice) return enVoice;
    }
    
    // 默认使用第一个本地语音
    return this.voices.find(voice => voice.localService) || this.voices[0];
  }
  
  // 发音文本
  speak(text, lang = 'en-US') {
    if (!this.isSupported) {
      console.warn('Speech synthesis not supported');
      return Promise.reject(new Error('语音合成不受支持'));
    }
    
    // 如果正在播放，先停止
    if (this.isSpeaking) {
      this.stop();
    }
    
    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);
      
      // 设置语音参数
      const voice = this.getBestVoice(lang);
      if (voice) {
        utterance.voice = voice;
      }
      
      utterance.lang = lang;
      utterance.rate = 0.8; // 稍微慢一点，便于学习
      utterance.pitch = 1;
      utterance.volume = 0.8;
      
      // 事件监听
      utterance.onstart = () => {
        this.isSpeaking = true;
        this.currentUtterance = utterance;
        resolve();
      };
      
      utterance.onend = () => {
        this.isSpeaking = false;
        this.currentUtterance = null;
      };
      
      utterance.onerror = (event) => {
        this.isSpeaking = false;
        this.currentUtterance = null;
        console.error('Speech error:', event.error);
        reject(new Error(`发音失败: ${event.error}`));
      };
      
      // 开始播放
      speechSynthesis.speak(utterance);
    });
  }
  
  // 停止发音
  stop() {
    if (this.isSupported && this.isSpeaking) {
      speechSynthesis.cancel();
      this.isSpeaking = false;
      this.currentUtterance = null;
    }
  }
}

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
    this.currentDetailWord = null; // 当前详情页显示的单词
    this.wordsListScrollPosition = 0; // 保存单词列表滚动位置
    this.currentMasteryFilter = ''; // 当前掌握度筛选
    
    // 初始化发音管理器
    this.speechManager = new SpeechManager();
    
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

  // Mastery helper methods
  getMasteryTagClass(tag) {
    const tagClassMap = {
      '陌生': 'mastery-beginner',
      '学习中': 'mastery-learning', 
      '熟悉': 'mastery-known',
      '已掌握': 'mastery-mastered'
    };
    return tagClassMap[tag] || 'mastery-beginner';
  }
  
  getMasteryTooltip(word) {
    const stats = word.stats || { again: 0, hard: 0, good: 0, easy: 0 };
    const score = word.masteryScore || 0;
    return `Again: ${stats.again} • Hard: ${stats.hard} • Good: ${stats.good} • Easy: ${stats.easy} • Score: ${score}`;
  }
  
  // 清空全部单词功能
  clearAllWords() {
    if (!this.allWords.length) {
      this.showError('没有单词需要清空');
      return;
    }
    
    // 提示用户先导出
    const shouldExport = confirm('清空所有单词前建议先导出备份。\n\n是否要先导出？\n点击"确定"导出，点击"取消"跳过导出直接清空。');
    
    if (shouldExport) {
      // 用户选择先导出，导出JSON格式
      this.exportAsJson();
      
      // 延迟执行清空操作，给用户时间保存文件
      setTimeout(() => {
        this.confirmAndClearWords();
      }, 1000);
    } else {
      // 用户跳过导出，直接确认清空
      this.confirmAndClearWords();
    }
  }
  
  // 确认并执行清空操作
  async confirmAndClearWords() {
    const finalConfirm = confirm(`确定要清空所有 ${this.allWords.length} 个单词吗？\n\n此操作不可撤销！`);
    
    if (!finalConfirm) {
      return;
    }
    
    try {
      // 清空 chrome.storage.local 中的 words 数据
      await chrome.storage.local.remove(['words']);
      
      // 同时清空相关的缓存数据
      await chrome.storage.local.remove(['translationCache']);
      
      // 更新本地数据
      this.allWords = [];
      this.filteredWords = [];
      this.reviewQueue = [];
      this.currentReviewIndex = 0;
      this.reviewedCount = 0;
      
      // 更新UI
      this.updateUI();
      
      // 更新徽标
      this.updateBadge();
      
      this.showSuccess('已清空所有单词');
      
    } catch (error) {
      console.error('Clear all words failed:', error);
      this.showError('清空失败: ' + error.message);
    }
  }
  
  // 导出功能实现
  exportAsJson() {
    try {
      if (!this.allWords.length) {
        this.showError('没有单词可导出');
        return;
      }
      
      const jsonData = JSON.stringify(this.allWords, null, 2);
      const blob = new Blob([jsonData], { type: 'application/json' });
      
      const now = new Date();
      const dateStr = now.getFullYear() + '-' + 
                     String(now.getMonth() + 1).padStart(2, '0') + '-' + 
                     String(now.getDate()).padStart(2, '0');
      const filename = `wordbook_${dateStr}.json`;
      
      this.downloadFile(blob, filename);
      this.showSuccess(`已导出 ${this.allWords.length} 个单词为JSON格式`);
      
    } catch (error) {
      console.error('Export JSON failed:', error);
      this.showError('导出JSON失败: ' + error.message);
    }
  }
  
  // 导出为CSV格式
  exportAsCsv() {
    try {
      if (!this.allWords.length) {
        this.showError('没有单词可导出');
        return;
      }
      
      // CSV头部字段 (including mastery fields)
      const headers = [
        'id', 'term', 'lang', 'note', 'definition', 'phonetic', 
        'examples', 'context', 'sourceUrl', 'addedAt', 'nextReview', 
        'interval', 'ease', 'reps', 'lapses', 'tags',
        'masteryTag', 'stats.again', 'stats.hard', 'stats.good', 'stats.easy', 'masteryScore'
      ];
      
      // 构建CSV内容
      const csvRows = [headers.join(',')];
      
      this.allWords.forEach(word => {
        const stats = word.stats || { again: 0, hard: 0, good: 0, easy: 0 };
        const row = [
          this.escapeCsvField(word.id || ''),
          this.escapeCsvField(word.term || ''),
          this.escapeCsvField(word.lang || ''),
          this.escapeCsvField(word.note || ''),
          this.escapeCsvField(word.definition || ''),
          this.escapeCsvField(word.phonetic || ''),
          this.escapeCsvField(this.arrayToString(word.examples)),
          this.escapeCsvField(word.context || ''),
          this.escapeCsvField(word.sourceUrl || ''),
          word.addedAt || '',
          word.nextReview || '',
          word.interval || 0,
          word.ease || 2.5,
          word.reps || 0,
          word.lapses || 0,
          this.escapeCsvField(this.arrayToString(word.tags)),
          this.escapeCsvField(word.masteryTag || '陌生'),
          stats.again || 0,
          stats.hard || 0,
          stats.good || 0,
          stats.easy || 0,
          word.masteryScore || 0
        ];
        csvRows.push(row.join(','));
      });
      
      const csvContent = csvRows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      
      const now = new Date();
      const dateStr = now.getFullYear() + '-' + 
                     String(now.getMonth() + 1).padStart(2, '0') + '-' + 
                     String(now.getDate()).padStart(2, '0');
      const filename = `wordbook_${dateStr}.csv`;
      
      this.downloadFile(blob, filename);
      this.showSuccess(`已导出 ${this.allWords.length} 个单词为CSV格式`);
      
    } catch (error) {
      console.error('Export CSV failed:', error);
      this.showError('导出CSV失败: ' + error.message);
    }
  }
  
  // CSV字段转义处理
  escapeCsvField(field) {
    if (field === null || field === undefined) {
      return '';
    }
    
    let str = String(field);
    
    // 替换换行符为 \n
    str = str.replace(/\r\n/g, '\\n').replace(/[\r\n]/g, '\\n');
    
    // 转义引号：" 变成 ""
    str = str.replace(/"/g, '""');
    
    // 如果包含逗号、引号或换行符，需要用引号包围
    if (str.includes(',') || str.includes('"') || str.includes('\\n')) {
      str = '"' + str + '"';
    }
    
    return str;
  }

  // 数组转字符串（用|分隔）
  arrayToString(arr) {
    if (!arr || !Array.isArray(arr)) {
      return '';
    }
    return arr.join('|');
  }
  
  // 通用文件下载方法
  downloadFile(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    
    document.body.appendChild(a);
    a.click();
    
    // 清理
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
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
        this.filterWords();
      });
    }
    
    if (searchClear) {
      searchClear.addEventListener('click', () => {
        if (searchInput) {
          searchInput.value = '';
          this.filterWords();
          searchInput.focus();
        }
      });
    }
    
    // 掌握度筛选事件
    const masteryFilter = document.getElementById('mastery-filter');
    if (masteryFilter) {
      masteryFilter.addEventListener('change', (e) => {
        this.currentMasteryFilter = e.target.value;
        this.filterWords();
      });
    }
    
    // 导出功能相关事件
    const exportBtn = document.getElementById('export-btn');
    const exportMenu = document.getElementById('export-menu');
    const exportJson = document.getElementById('export-json');
    const exportCsv = document.getElementById('export-csv');
    const clearAllBtn = document.getElementById('clear-all-btn');
    
    if (exportBtn && exportMenu) {
      exportBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        exportMenu.classList.toggle('hidden');
      });
      
      // 点击外部关闭菜单
      document.addEventListener('click', (e) => {
        if (!exportMenu.contains(e.target) && !exportBtn.contains(e.target)) {
          exportMenu.classList.add('hidden');
        }
      });
    }
    
    if (exportJson) {
      exportJson.addEventListener('click', () => {
        this.exportAsJson();
        exportMenu.classList.add('hidden');
      });
    }
    
    if (exportCsv) {
      exportCsv.addEventListener('click', () => {
        this.exportAsCsv();
        exportMenu.classList.add('hidden');
      });
    }
    
    // 清空全部功能
    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', () => {
        this.clearAllWords();
      });
    }
    
    // 详情页事件
    const detailBackBtn = document.getElementById('detail-back');
    const detailSpeakBtn = document.getElementById('detail-speak');
    
    if (detailBackBtn) {
      detailBackBtn.addEventListener('click', () => {
        this.switchView('words');
        // 恢复滚动位置
        setTimeout(() => {
          const wordsList = document.getElementById('words-list');
          if (wordsList) {
            wordsList.scrollTop = this.wordsListScrollPosition;
          }
        }, 10);
      });
    }
    
    if (detailSpeakBtn) {
      detailSpeakBtn.addEventListener('click', async () => {
        if (this.currentDetailWord) {
          await this.speakWord(this.currentDetailWord, detailSpeakBtn);
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
    
    // 更新卡片内容 - 重构单词显示区域
    this.updateWordHeader(word);
    
    // 更新翻译
    const noteContainer = document.getElementById('word-note-container');
    const noteElement = document.getElementById('word-note');
    if (word.note && word.note.trim()) {
      if (noteElement) noteElement.textContent = word.note;
      this.showElement(noteContainer);
    } else {
      this.hideElement(noteContainer);
    }
    
    // 更新释义
    const definitionContainer = document.getElementById('word-definition-container');
    const definitionElement = document.getElementById('word-definition');
    if (word.definition && word.definition.trim()) {
      if (definitionElement) definitionElement.textContent = word.definition;
      this.showElement(definitionContainer);
    } else {
      this.hideElement(definitionContainer);
    }
    
    // 更新例句
    const examplesContainer = document.getElementById('word-examples-container');
    const examplesElement = document.getElementById('word-examples');
    if (word.examples && word.examples.length > 0) {
      if (examplesElement) {
        examplesElement.innerHTML = '';
        word.examples.forEach(example => {
          const exampleDiv = document.createElement('div');
          exampleDiv.className = 'example-item';
          exampleDiv.textContent = example;
          examplesElement.appendChild(exampleDiv);
        });
      }
      this.showElement(examplesContainer);
    } else {
      this.hideElement(examplesContainer);
    }
    
    // 更新音标
    const phoneticContainer = document.getElementById('word-phonetic-container');
    const phoneticElement = document.getElementById('word-phonetic');
    if (word.phonetic && word.phonetic.trim()) {
      if (phoneticElement) phoneticElement.textContent = word.phonetic;
      this.showElement(phoneticContainer);
    } else {
      this.hideElement(phoneticContainer);
    }
  }
  
  // 更新单词头部显示（包含发音按钮）
  updateWordHeader(word) {
    const wordDisplay = document.querySelector('.word-display');
    if (!wordDisplay) return;
    
    // 清空并重新构建
    wordDisplay.innerHTML = `
      <div class="word-header">
        <span class="word-term">${this.escapeHtml(word.term)}</span>
        <button class="speech-btn" title="点击发音">🔊</button>
      </div>
      <span class="word-lang">${word.lang.toUpperCase()}</span>
    `;
    
    // 绑定发音事件
    const speechBtn = wordDisplay.querySelector('.speech-btn');
    if (speechBtn) {
      speechBtn.addEventListener('click', async () => {
        await this.speakWord(word, speechBtn);
      });
    }
  }
  
  // 更新详情页单词头部显示
  updateDetailWordHeader(word) {
    const wordDisplay = document.getElementById('detail-word-display');
    if (!wordDisplay) return;
    
    // 清空并重新构建
    wordDisplay.innerHTML = `
      <div class="word-header">
        <span class="word-term">${this.escapeHtml(word.term)}</span>
        <button class="speech-btn term-speak" title="发音">🔊</button>
      </div>
      <span class="word-lang">${(word.lang || 'en').toUpperCase()}</span>
    `;
    const btn = wordDisplay.querySelector('.term-speak');
    if (btn) {
      btn.addEventListener('click', () => this.speakWord(word, btn));
    }
  }
  
  // 发音单词的核心方法
  async speakWord(word, buttonElement = null) {
    if (!this.speechManager.isSupported) {
      this.showError('您的浏览器不支持语音合成功能');
      return;
    }
    
    try {
      // 更新按钮状态
      if (buttonElement) {
        buttonElement.classList.add('speaking');
        buttonElement.disabled = true;
      }
      
      // 确定语言
      const lang = word.lang === 'zh' ? 'zh-CN' : 'en-US';
      
      // 发音
      await this.speechManager.speak(word.term, lang);
      
      console.log(`Pronunciation played for: ${word.term}`);
      
    } catch (error) {
      console.error('Speech failed:', error);
      this.showError('发音失败: ' + error.message);
    } finally {
      // 恢复按钮状态
      if (buttonElement) {
        buttonElement.classList.remove('speaking');
        buttonElement.disabled = false;
      }
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
    } else if (view === 'detail') {
      // 详情页不需要特殊处理，因为在 showWordDetail 中已经处理
    }
  }
  
  // 显示单词详情页
  showWordDetail(word) {
    // 保存当前滚动位置
    const wordsList = document.getElementById('words-list');
    if (wordsList) {
      this.wordsListScrollPosition = wordsList.scrollTop;
    }
    
    this.currentDetailWord = word;
    this.switchView('detail');
    this.updateDetailCard(word);
  }
  
  // 更新详情卡片内容
  updateDetailCard(word) {
    if (!word) return;
    
    // 更新头部显示
    this.updateDetailWordHeader(word);
    
    // 更新翻译
    const noteContainer = document.getElementById('detail-word-note-container');
    const noteElement = document.getElementById('detail-word-note');
    if (word.note && word.note.trim()) {
      if (noteElement) noteElement.textContent = word.note;
      this.showElement(noteContainer);
    } else {
      this.hideElement(noteContainer);
    }
    
    // 更新释义
    const definitionContainer = document.getElementById('detail-word-definition-container');
    const definitionElement = document.getElementById('detail-word-definition');
    if (word.definition && word.definition.trim()) {
      if (definitionElement) definitionElement.textContent = word.definition;
      this.showElement(definitionContainer);
    } else {
      this.hideElement(definitionContainer);
    }
    
    // 更新例句
    const examplesContainer = document.getElementById('detail-word-examples-container');
    const examplesElement = document.getElementById('detail-word-examples');
    if (word.examples && word.examples.length > 0) {
      if (examplesElement) {
        examplesElement.innerHTML = '';
        word.examples.forEach(example => {
          const exampleDiv = document.createElement('div');
          exampleDiv.className = 'example-item';
          exampleDiv.textContent = example;
          examplesElement.appendChild(exampleDiv);
        });
      }
      this.showElement(examplesContainer);
    } else {
      this.hideElement(examplesContainer);
    }
    
    // 更新音标
    const phoneticContainer = document.getElementById('detail-word-phonetic-container');
    const phoneticElement = document.getElementById('detail-word-phonetic');
    if (word.phonetic && word.phonetic.trim()) {
      if (phoneticElement) phoneticElement.textContent = word.phonetic;
      this.showElement(phoneticContainer);
    } else {
      this.hideElement(phoneticContainer);
    }
  }
  
  // 过滤单词（支持搜索和掌握度筛选）
  filterWords() {
    const searchInput = document.getElementById('search-input');
    const searchQuery = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const masteryFilter = this.currentMasteryFilter;
    
    this.filteredWords = this.allWords.filter(word => {
      // 搜索过滤
      const matchesSearch = !searchQuery || 
        word.term.toLowerCase().includes(searchQuery) ||
        (word.note && word.note.toLowerCase().includes(searchQuery));
      
      // 掌握度过滤
      const matchesMastery = !masteryFilter || 
        (word.masteryTag && word.masteryTag === masteryFilter);
      
      return matchesSearch && matchesMastery;
    });
    
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
    div.dataset.id = word.id; // 添加 data-id 属性
    
    // 确保单词有掌握度标签（向后兼容）
    const masteryTag = word.masteryTag || '陌生';
    const masteryClass = this.getMasteryTagClass(masteryTag);
    const masteryTooltip = this.getMasteryTooltip(word);
    
    // 构建例句显示
    let examplesHtml = '';
    if (word.examples && word.examples.length > 0) {
      examplesHtml = `
        <div class="word-item-examples">
          <strong>例句:</strong> ${this.escapeHtml(word.examples[0])}
          ${word.examples.length > 1 ? `<span class="more-examples">(+${word.examples.length - 1})</span>` : ''}
        </div>
      `;
    }
    
    // 构建完整HTML
    div.innerHTML = `
      <div class="word-item-header">
        <span class="word-item-term">${this.escapeHtml(word.term)}</span>
        <div style="display: flex; align-items: center; gap: 4px;">
          <button class="speech-btn" title="点击发音">🔊</button>
          <span class="word-item-lang">${word.lang.toUpperCase()}</span>
        </div>
      </div>
      <div class="word-item-translation">
        <span>${this.escapeHtml(word.note || '暂无翻译')}</span>
        <span class="mastery-tag ${masteryClass}" title="${masteryTooltip}">${masteryTag}</span>
      </div>
      ${examplesHtml}
      <div class="word-item-meta">
        <span class="word-item-date">${this.formatDate(word.addedAt)}</span>
        <div class="word-item-actions">
          <button class="word-action-btn edit" data-id="${word.id}">编辑</button>
          <button class="word-action-btn delete" data-id="${word.id}">删除</button>
        </div>
      </div>
    `;
    
    // 绑定发音事件
    const speechBtn = div.querySelector('.speech-btn');
    if (speechBtn) {
      speechBtn.addEventListener('click', async (e) => {
        e.stopPropagation(); // 防止触发单词项的点击事件
        await this.speakWord(word, speechBtn);
      });
    }
    
    // 绑定编辑和删除事件
    const editBtn = div.querySelector('.edit');
    const deleteBtn = div.querySelector('.delete');
    
    if (editBtn) {
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.editWordNote(word);
      });
    }
    
    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteWord(word);
      });
    }
    
    // 绑定单词项点击事件（显示详情页）
    div.addEventListener('click', (e) => {
      // 检查点击的目标是否是按钮或按钮内的元素
      if (e.target.closest('.word-action-btn') || e.target.closest('.speech-btn')) {
        return; // 如果点击的是按钮，不执行详情页逻辑
      }
      this.showWordDetail(word);
    });
    
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
            this.filterWords();
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
        this.filterWords();
        
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