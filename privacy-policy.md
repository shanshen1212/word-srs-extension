# Word SRS Privacy Policy / 隐私政策
_Last updated: 2025-09-03

[English](#en) | [中文](#zh)
<a id="en"></a>

**Summary**  
Word SRS does not collect, transmit, or sell any personal data. All saved words, SRS progress, and settings are stored locally in your browser via `chrome.storage`.

**What we store**  
- Saved words, review intervals, ease factors, tags, and settings.  
- Storage location: local browser storage (`chrome.storage`).  
- Removal: data is removed when you uninstall the extension or clear the extension data.

**Network requests**  
- The extension first uses a built-in offline dictionary.  
- If a word is not found locally, it queries public APIs only for the **query term** (no personal identifiers):  
  - `https://api.mymemory.translated.net/`  
  - `https://api.dictionaryapi.dev/`  
  Responses are used only to display definitions/examples. We do not track users or build profiles.

**Permissions**  
- `storage`: store words and settings locally.  
- `contextMenus`: add a “Save to Wordbook” item when text is selected.  
- `notifications` (optional): show a local success notification after saving.  
- `host_permissions`: limited to the domains above, used only when the offline dictionary misses.

**Advertising / analytics**  
- No ads. No third-party analytics SDKs.

**Contact**  
- Email: **shanshen.dmn@gmail.com**

---

<a id="zh"></a>

**摘要**  
Word SRS 不收集、传输或出售任何个人数据。所有生词、复习进度与设置仅保存在浏览器本地（`chrome.storage`）。

**本地存储内容**  
- 生词、复习间隔、易度、标签与设置；  
- 存储位置：浏览器本地 `chrome.storage`；  
- 卸载扩展或清除扩展数据时，这些数据将被移除。

**网络请求**  
- 扩展优先使用内置离线词典；  
- 当本地未命中时，才会向公开接口发送**查询词**（不包含任何个人标识）：  
  - `https://api.mymemory.translated.net/`  
  - `https://api.dictionaryapi.dev/`  
  返回结果仅用于展示释义/例句，不进行跟踪或用户画像。

**权限说明**  
- `storage`：在本地保存单词与设置；  
- `contextMenus`：在选中文本时提供“保存到生词本”的右键菜单；  
- `notifications`（可选）：保存成功时显示本地通知；  
- `host_permissions`：仅限上述域名，且仅在离线未命中时调用。

**广告与统计**  
- 不投放广告，不接入第三方统计 SDK。

**联系方式**  
- 邮箱：**shanshen.dmn@gmail.com**
