// 简化的 content script - 只有基础功能，不会报错
// === 一键开关：改成 false 就彻底禁用划词气泡 ===
const ENABLE_INLINE_POPUP = false;

class SimpleWordBubble {
  constructor() {
    this.bubble = null;
    this.currentSelection = null;
    this.init();
  }
  
  init() {
  if (!ENABLE_INLINE_POPUP) return;         // 保险
  document.addEventListener('mouseup', this.handleSelection.bind(this));
  }

  
  handleSelection() {
    const selection = window.getSelection();
    const text = selection.toString().trim();
    
    // 移除旧气泡
    this.removeBubble();
    
    if (text && text.length > 0 && text.length < 50) {
      this.showBubble(text, selection);
    }
  }
  
  showBubble(text, selection) {
    // 创建简单的气泡，不用 Shadow DOM
    const bubble = document.createElement('div');
    bubble.style.cssText = `
      position: fixed;
      background: white;
      border: 1px solid #ccc;
      border-radius: 6px;
      padding: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      z-index: 999999;
      font-family: Arial, sans-serif;
      font-size: 13px;
    `;
    
    bubble.innerHTML = `
      <div style="margin-bottom: 5px;">${this.escapeHtml(text)}</div>
      <div style="display: flex; gap: 5px;">
        <button id="save-word-btn" style="
          background: #4CAF50;
          color: white;
          border: none;
          padding: 4px 8px;
          border-radius: 3px;
          cursor: pointer;
          flex: 1;
        ">保存</button>
        <button id="speak-word-btn" style="
          background: #2196F3;
          color: white;
          border: none;
          padding: 4px 8px;
          border-radius: 3px;
          cursor: pointer;
          font-size: 14px;
        " title="发音">🔊</button>
      </div>
    `;
    
    // 定位
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    bubble.style.top = (rect.bottom + window.scrollY + 5) + 'px';
    bubble.style.left = (rect.left + window.scrollX) + 'px';
    
    document.body.appendChild(bubble);
    this.bubble = bubble;
    
    // 绑定保存事件
    bubble.querySelector('#save-word-btn').onclick = () => {
      this.saveWord(text);
    };
    
    // 绑定发音事件
    bubble.querySelector('#speak-word-btn').onclick = () => {
      this.speakText(text);
    };
    
    // 点击外部关闭
    setTimeout(() => {
      document.addEventListener('click', this.handleDocumentClick.bind(this));
    }, 100);
  }
  
  speakText(text) {
    if (!('speechSynthesis' in window)) {
      this.showNotification('您的浏览器不支持语音功能');
      return;
    }
    
    try {
      // 停止当前播放
      speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(text);
      
      // 检测语言
      const hasChineseChars = /[\u4e00-\u9fff]/.test(text);
      utterance.lang = hasChineseChars ? 'zh-CN' : 'en-US';
      utterance.rate = 0.8;
      utterance.pitch = 1;
      utterance.volume = 0.8;
      
      // 获取合适的语音
      const voices = speechSynthesis.getVoices();
      if (voices.length > 0) {
        const preferredVoice = voices.find(voice => 
          voice.lang.startsWith(utterance.lang.split('-')[0]) && voice.localService
        );
        if (preferredVoice) {
          utterance.voice = preferredVoice;
        }
      }
      
      // 视觉反馈
      const speakBtn = this.bubble?.querySelector('#speak-word-btn');
      if (speakBtn) {
        speakBtn.style.background = '#ff9800';
        speakBtn.disabled = true;
      }
      
      utterance.onend = () => {
        if (speakBtn) {
          speakBtn.style.background = '#2196F3';
          speakBtn.disabled = false;
        }
      };
      
      utterance.onerror = (event) => {
        console.error('Speech error:', event.error);
        if (speakBtn) {
          speakBtn.style.background = '#2196F3';
          speakBtn.disabled = false;
        }
        this.showNotification('发音失败');
      };
      
      speechSynthesis.speak(utterance);
      
    } catch (error) {
      console.error('Speech synthesis error:', error);
      this.showNotification('发音失败');
    }
  }
  
  async saveWord(text) {
    const detectedLang = this.detectLanguage(text);
    
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'SAVE_WORD',
        data: {
          term: text,
          lang: detectedLang,
          context: this.getContext(text),
          sourceUrl: window.location.href
        }
      });
      
      if (response.success) {
        this.showNotification('已保存: ' + text);
      }
    } catch (error) {
      console.error('保存失败:', error);
    }
    
    this.removeBubble();
  }
  
  detectLanguage(text) {
    // 简化：只检测是否为中文，其他都按英文处理
    const hasChinese = /[\u4e00-\u9fff]/.test(text);
    return hasChinese ? 'zh' : 'en';
  }
  
  getContext(selectedText) {
    // 简单的上下文提取
    const selection = window.getSelection();
    if (selection.rangeCount === 0) return selectedText;
    
    try {
      const range = selection.getRangeAt(0);
      const container = range.commonAncestorContainer;
      const element = container.nodeType === Node.TEXT_NODE ? 
                     container.parentElement : container;
      
      const fullText = element.textContent || '';
      const index = fullText.indexOf(selectedText);
      
      if (index !== -1) {
        const start = Math.max(0, index - 50);
        const end = Math.min(fullText.length, index + selectedText.length + 50);
        return fullText.substring(start, end).trim();
      }
    } catch (error) {
      console.warn('Context extraction failed:', error);
    }
    
    return selectedText;
  }
  
  showNotification(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #4CAF50;
      color: white;
      padding: 10px;
      border-radius: 5px;
      z-index: 999999;
      font-family: Arial, sans-serif;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 2000);
  }
  
  handleDocumentClick(event) {
    if (this.bubble && !this.bubble.contains(event.target)) {
      this.removeBubble();
    }
  }
  
  removeBubble() {
    if (this.bubble) {
      this.bubble.remove();
      this.bubble = null;
      document.removeEventListener('click', this.handleDocumentClick.bind(this));
    }
  }
  
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

if (!ENABLE_INLINE_POPUP) {
  SimpleWordBubble.prototype.init = function(){};
  SimpleWordBubble.prototype.handleSelection = function(){};
  SimpleWordBubble.prototype.showBubble = function(){};
  SimpleWordBubble.prototype.speakText = function(){};
  SimpleWordBubble.prototype.saveWord = function(){};
  SimpleWordBubble.prototype.handleDocumentClick = function(){};
  SimpleWordBubble.prototype.removeBubble = function(){};
}

// 启动
// 启动（关掉时不初始化）
if (ENABLE_INLINE_POPUP) new SimpleWordBubble();
