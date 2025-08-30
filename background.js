console.log('Background script starting...');

// 完整的数据存储功能
class WordManager {
  static async translateText(text, fromLang = 'en', toLang = 'zh') {
    try {
      const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${fromLang}|${toLang}`);
      const data = await response.json();
      
      if (data.responseStatus === 200 && data.responseData) {
        return data.responseData.translatedText;
      }
    } catch (error) {
      console.error('Translation failed:', error);
    }
    return null;
  }
  
  static async saveWord(wordData) {
    const { words = [] } = await chrome.storage.local.get(['words']);
    
    const normalizedTerm = wordData.term.toLowerCase().trim();
    const existingIndex = words.findIndex(w => 
      w.term === normalizedTerm && w.lang === wordData.lang
    );
    
    // 如果是英文单词，自动获取翻译
    let translation = wordData.note || '';
    if (wordData.lang === 'en' && !translation) {
      console.log('正在翻译:', wordData.term);
      translation = await this.translateText(wordData.term, 'en', 'zh');
      console.log('翻译结果:', translation);
    }
    
    if (existingIndex !== -1) {
      words[existingIndex] = {
        ...words[existingIndex],
        context: wordData.context,
        sourceUrl: wordData.sourceUrl,
        addedAt: Date.now(),
        note: translation || words[existingIndex].note
      };
    } else {
      const newWord = {
        id: `${normalizedTerm}_${wordData.lang}_${Date.now()}`,
        term: normalizedTerm,
        lang: wordData.lang,
        context: wordData.context,
        sourceUrl: wordData.sourceUrl,
        addedAt: Date.now(),
        nextReview: Date.now(),
        interval: 0,
        ease: 2.5,
        reps: 0,
        lapses: 0,
        note: translation || '',
        tags: wordData.tags || []
      };
      words.unshift(newWord);
    }
    
    await chrome.storage.local.set({ words });
    this.updateBadge();
    return words;
  }
  
  static async getTodayReviews() {
    const { words = [] } = await chrome.storage.local.get(['words']);
    const now = Date.now();
    return words.filter(word => word.nextReview <= now)
                .sort((a, b) => a.nextReview - b.nextReview);
  }
  
  static reviewWord(word, quality) {
    const newWord = { ...word };
    
    // 调整ease
    newWord.ease = Math.max(1.3, 
      newWord.ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    );
    
    // 计算间隔
    if (quality < 3) { // Again
      newWord.interval = 1;
      newWord.reps = 0;
      newWord.lapses++;
    } else {
      if (newWord.reps === 0) {
        newWord.interval = 1;
      } else if (newWord.reps === 1) {
        newWord.interval = 2;
      } else {
        newWord.interval = Math.round(newWord.interval * newWord.ease);
      }
      newWord.reps++;
    }
    
    // 设置下次复习时间
    newWord.nextReview = Date.now() + newWord.interval * 24 * 60 * 60 * 1000;
    
    return newWord;
  }
  
  static async updateBadge() {
    const todayReviews = await this.getTodayReviews();
    chrome.action.setBadgeText({ text: todayReviews.length > 0 ? todayReviews.length.toString() : '' });
  }
  
  static reviewWord(word, quality) {
    const newWord = { ...word };
    
    // 调整ease
    newWord.ease = Math.max(1.3, 
      newWord.ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    );
    
    // 计算间隔
    if (quality < 3) { // Again
      newWord.interval = 1;
      newWord.reps = 0;
      newWord.lapses++;
    } else {
      if (newWord.reps === 0) {
        newWord.interval = 1;
      } else if (newWord.reps === 1) {
        newWord.interval = 2;
      } else {
        newWord.interval = Math.round(newWord.interval * newWord.ease);
      }
      newWord.reps++;
    }
    
    // 设置下次复习时间
    newWord.nextReview = Date.now() + newWord.interval * 24 * 60 * 60 * 1000;
    
    return newWord;
  }
  
  static async updateWord(updatedWord) {
    const { words = [] } = await chrome.storage.local.get(['words']);
    const index = words.findIndex(w => w.id === updatedWord.id);
    if (index !== -1) {
      words[index] = updatedWord;
      await chrome.storage.local.set({ words });
      this.updateBadge();
    }
  }
}

// 安装时创建右键菜单
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Extension installed');
  chrome.contextMenus.create({
    id: 'save-to-wordbook',
    title: '保存到生词本',
    contexts: ['selection']
  });
  chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
});

// 右键菜单处理
chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId === 'save-to-wordbook' && info.selectionText) {
    const wordData = {
      term: info.selectionText,
      lang: 'en',
      context: info.selectionText,
      sourceUrl: info.pageUrl || ''
    };
    
    await WordManager.saveWord(wordData);
    
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'assets/icons/icon-48.png',
      title: '生词本',
      message: `已保存: ${info.selectionText}`
    });
  }
});

// 消息处理
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Message received:', message.type);
  
  if (message.type === 'GET_TODAY_REVIEWS') {
    WordManager.getTodayReviews().then(reviews => {
      sendResponse({ reviews });
    });
    return true;
  }
  
  if (message.type === 'GET_ALL_WORDS') {
    chrome.storage.local.get(['words']).then(result => {
      const words = result.words || [];
      sendResponse({ words: words.sort((a, b) => b.addedAt - a.addedAt) });
    });
    return true;
  }
  
  if (message.type === 'SAVE_WORD') {
    WordManager.saveWord(message.data).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
  
  if (message.type === 'REVIEW_WORD') {
    try {
      const reviewedWord = WordManager.reviewWord(message.word, message.quality);
      WordManager.updateWord(reviewedWord).then(() => {
        sendResponse({ success: true, word: reviewedWord });
      });
    } catch (error) {
      console.error('Review word error:', error);
      sendResponse({ success: false, error: error.message });
    }
    return true;
  }
  
  if (message.type === 'DELETE_WORD') {
    chrome.storage.local.get(['words']).then(result => {
      const words = result.words || [];
      const filteredWords = words.filter(w => w.id !== message.wordId);
      chrome.storage.local.set({ words: filteredWords }).then(() => {
        WordManager.updateBadge();
        sendResponse({ success: true });
      });
    });
    return true;
  }
  
  if (message.type === 'UPDATE_WORD') {
    WordManager.updateWord(message.word).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
  
  sendResponse({ error: 'Unknown message type' });
});

console.log('Background script loaded');