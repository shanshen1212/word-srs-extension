console.log('Background script starting...');

// WordManager class with all functionality + Mastery Tracking
class WordManager {
  // Mastery calculation constants
  static MASTERY_THRESHOLDS = {
    t1: 0,    // threshold for 陌生 -> 学习中
    t2: 3,    // threshold for 学习中 -> 熟悉  
    t3: 7     // threshold for 熟悉 -> 已掌握
  };

  // Load dictionary from local file
  static async loadBuiltinDictionary() {
    try {
      const { builtinDictionary } = await chrome.storage.local.get(['builtinDictionary']);
      if (builtinDictionary) {
        return builtinDictionary;
      }
      
      const response = await fetch(chrome.runtime.getURL('lib/dictionary.json'));
      const dictionary = await response.json();
      
      await chrome.storage.local.set({ builtinDictionary: dictionary });
      console.log('词典已加载，包含', Object.keys(dictionary).length, '个单词');
      
      return dictionary;
    } catch (error) {
      console.error('加载本地词典失败:', error);
      return {};
    }
  }

  // Ensure word has stats and mastery fields with defaults
  static ensureStats(word) {
    const wordWithStats = { ...word };
    
    // Initialize stats if missing
    if (!wordWithStats.stats) {
      wordWithStats.stats = {
        again: 0,
        hard: 0,
        good: 0,
        easy: 0
      };
    } else {
      // Ensure all stat fields exist
      wordWithStats.stats = {
        again: wordWithStats.stats.again || 0,
        hard: wordWithStats.stats.hard || 0,
        good: wordWithStats.stats.good || 0,
        easy: wordWithStats.stats.easy || 0
      };
    }
    
    // Calculate and set mastery fields if missing
    if (typeof wordWithStats.masteryScore === 'undefined') {
      wordWithStats.masteryScore = this.computeMasteryScore(wordWithStats.stats);
    }
    
    if (!wordWithStats.masteryTag) {
      wordWithStats.masteryTag = this.mapScoreToTag(
        wordWithStats.masteryScore, 
        wordWithStats.reps || 0, 
        wordWithStats.interval || 0
      );
    }
    
    return wordWithStats;
  }
  
  // Compute mastery score based on review stats
  static computeMasteryScore(stats) {
    if (!stats) return 0;
    return (2 * (stats.easy || 0)) + (1 * (stats.good || 0)) - (1 * (stats.hard || 0)) - (2 * (stats.again || 0));
  }
  
  // Map score to mastery tag based on thresholds
  static mapScoreToTag(score, reps, interval) {
    if (score <= this.MASTERY_THRESHOLDS.t1 || reps < 1) {
      return "陌生";
    }
    
    if (score <= this.MASTERY_THRESHOLDS.t2) {
      return "学习中";
    }
    
    if (score <= this.MASTERY_THRESHOLDS.t3) {
      return "熟悉";
    }
    
    // 已掌握: score >= 8 AND reps >= 3 AND interval >= 7
    if (score >= 8 && reps >= 3 && interval >= 7) {
      return "已掌握";
    }
    
    return "熟悉"; // fallback for high scores but not meeting mastery criteria
  }

  static async translateText(text, fromLang = 'en', toLang = 'zh') {
    const word = text.toLowerCase().trim();
    
    // 1. Check cache first
    const cachedResult = await this.getFromCache(word);
    if (cachedResult) {
      console.log('从缓存获取翻译:', word);
      return cachedResult;
    }
    
    // 2. Check builtin dictionary
    const builtinDict = await this.loadBuiltinDictionary();
    if (builtinDict[word]) {
      console.log('从本地词典获取:', word);
      await this.saveToCache(word, builtinDict[word]);
      return builtinDict[word];
    }
    
    // 3. Online query
    try {
      console.log('在线查询翻译:', word);
      const onlineResult = await this.fetchOnlineTranslation(word, fromLang, toLang);
      if (onlineResult) {
        await this.saveToCache(word, onlineResult);
        return onlineResult;
      }
    } catch (error) {
      console.error('在线翻译失败:', error);
    }
    
    return null;
  }
  
  static async getFromCache(word) {
    try {
      const { translationCache = {} } = await chrome.storage.local.get(['translationCache']);
      return translationCache[word] || null;
    } catch (error) {
      console.error('读取缓存失败:', error);
      return null;
    }
  }
  
  static async saveToCache(word, result) {
    try {
      const { translationCache = {} } = await chrome.storage.local.get(['translationCache']);
      translationCache[word] = {
        ...result,
        cachedAt: Date.now()
      };
      
      const entries = Object.entries(translationCache);
      if (entries.length > 1000) {
        const sortedEntries = entries.sort((a, b) => (b[1].cachedAt || 0) - (a[1].cachedAt || 0));
        const limitedCache = Object.fromEntries(sortedEntries.slice(0, 1000));
        await chrome.storage.local.set({ translationCache: limitedCache });
      } else {
        await chrome.storage.local.set({ translationCache });
      }
    } catch (error) {
      console.error('保存缓存失败:', error);
    }
  }
  
  static async fetchOnlineTranslation(word, fromLang, toLang) {
    try {
      const [translationResult, dictionaryResult] = await Promise.allSettled([
        this.fetchBasicTranslation(word, fromLang, toLang),
        this.fetchDictionaryInfo(word)
      ]);
      
      const translation = translationResult.status === 'fulfilled' ? translationResult.value : word;
      const dictInfo = dictionaryResult.status === 'fulfilled' ? dictionaryResult.value : {};
      
      return {
        translation: translation,
        definition: dictInfo.definition || '',
        examples: dictInfo.examples || [],
        phonetic: dictInfo.phonetic || ''
      };
    } catch (error) {
      console.error('在线翻译请求失败:', error);
      return null;
    }
  }
  
  static async fetchBasicTranslation(word, fromLang, toLang) {
    const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=${fromLang}|${toLang}`);
    const data = await response.json();
    
    if (data.responseStatus === 200 && data.responseData) {
      return data.responseData.translatedText;
    }
    return word;
  }
  
  static async fetchDictionaryInfo(word) {
    try {
      const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
      if (!response.ok) return {};
      
      const data = await response.json();
      if (data && data[0]) {
        const entry = data[0];
        const meaning = entry.meanings && entry.meanings[0];
        const definition = meaning && meaning.definitions && meaning.definitions[0];
        
        return {
          definition: definition ? definition.definition : '',
          examples: definition && definition.example ? [definition.example] : [],
          phonetic: entry.phonetic || (entry.phonetics && entry.phonetics[0] && entry.phonetics[0].text) || ''
        };
      }
    } catch (error) {
      console.error('获取词典信息失败:', error);
    }
    return {};
  }

  static async saveWord(wordData) {
    const { words = [] } = await chrome.storage.local.get(['words']);
    
    const normalizedTerm = wordData.term.toLowerCase().trim();
    const existingIndex = words.findIndex(w => 
      w.term === normalizedTerm && w.lang === wordData.lang
    );
    
    let translationInfo = null;
    if (wordData.lang === 'en') {
      console.log('正在查询翻译:', wordData.term);
      translationInfo = await this.translateText(wordData.term, 'en', 'zh');
    }
    
    if (existingIndex !== -1) {
      words[existingIndex] = {
        ...words[existingIndex],
        context: wordData.context,
        sourceUrl: wordData.sourceUrl,
        addedAt: Date.now(),
        note: translationInfo ? translationInfo.translation : words[existingIndex].note,
        definition: translationInfo ? translationInfo.definition : words[existingIndex].definition,
        examples: translationInfo ? translationInfo.examples : words[existingIndex].examples,
        phonetic: translationInfo ? translationInfo.phonetic : words[existingIndex].phonetic
      };
      // Ensure mastery fields for existing word
      words[existingIndex] = this.ensureStats(words[existingIndex]);
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
        note: translationInfo ? translationInfo.translation : (wordData.note || ''),
        definition: translationInfo ? translationInfo.definition : '',
        examples: translationInfo ? translationInfo.examples : [],
        phonetic: translationInfo ? translationInfo.phonetic : '',
        tags: wordData.tags || []
      };
      // Initialize mastery tracking for new word
      const wordWithStats = this.ensureStats(newWord);
      words.unshift(wordWithStats);
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
  
  static async updateBadge() {
    const todayReviews = await this.getTodayReviews();
    chrome.action.setBadgeText({ text: todayReviews.length > 0 ? todayReviews.length.toString() : '' });
  }
  
  static reviewWord(word, quality) {
    const newWord = { ...word };
    
    // Update SRS algorithm
    newWord.ease = Math.max(1.3, 
      newWord.ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    );
    
    if (quality < 3) {
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
    
    newWord.nextReview = Date.now() + newWord.interval * 24 * 60 * 60 * 1000;
    
    // UPDATE MASTERY TRACKING
    // Ensure stats exist
    if (!newWord.stats) {
      newWord.stats = { again: 0, hard: 0, good: 0, easy: 0 };
    }
    
    // Update stats based on quality
    if (quality < 3) {
      newWord.stats.again++;
    } else if (quality === 3) {
      newWord.stats.hard++;
    } else if (quality === 4) {
      newWord.stats.good++;
    } else if (quality === 5) {
      newWord.stats.easy++;
    }
    
    // Recalculate mastery score and tag
    newWord.masteryScore = this.computeMasteryScore(newWord.stats);
    newWord.masteryTag = this.mapScoreToTag(newWord.masteryScore, newWord.reps, newWord.interval);
    
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

  // One-time migration for existing words (called on extension startup)
  static async migrateExistingWords() {
    try {
      const { words = [], migrationCompleted } = await chrome.storage.local.get(['words', 'migrationCompleted']);
      
      if (migrationCompleted || words.length === 0) {
        return; // Already migrated or no words to migrate
      }
      
      let migrationNeeded = false;
      const migratedWords = words.map(word => {
        if (!word.stats || typeof word.masteryScore === 'undefined' || !word.masteryTag) {
          migrationNeeded = true;
          return this.ensureStats(word);
        }
        return word;
      });
      
      if (migrationNeeded) {
        await chrome.storage.local.set({ 
          words: migratedWords,
          migrationCompleted: true 
        });
        console.log(`Migrated ${words.length} words with mastery tracking`);
      }
    } catch (error) {
      console.error('Migration failed:', error);
    }
  }
}

// Extension setup
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Extension installed');
  chrome.contextMenus.create({
    id: 'save-to-wordbook',
    title: '保存到生词本',
    contexts: ['selection']
  });
  chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
  
  // Run migration for existing words
  await WordManager.migrateExistingWords();
});

// Context menu handler
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
      iconUrl: chrome.runtime.getURL('assets/icon-48.png'),
      title: '生词本',
      message: `已保存: ${info.selectionText}`
    }, () => {
      if (chrome.runtime.lastError) console.warn(chrome.runtime.lastError.message);
    });
  }
});

// Message handler
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
      // Ensure all words have mastery tracking (lazy migration)
      const wordsWithStats = words.map(word => WordManager.ensureStats(word));
      sendResponse({ words: wordsWithStats.sort((a, b) => b.addedAt - a.addedAt) });
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