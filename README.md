[English](#en) | [中文](#zh)

<a id="en"></a>

# Word SRS — Minimal English Vocabulary Saver & Reviewer

> **Highlight**  
> - **Focus:** Save **English words** from pages and review them with **SRS**.  
> - **No selection popup:** The extension **does not** show cluttering popups.  
> - **Simple learning curve:** Right-click to save → review when due. That’s it.

<p align="center">
  <img src="assets/screenshot-review.png" alt="Review card screenshot" width="600"/>
</p>

---

## Features

- **Spaced Repetition (SRS) review**
  - Each card shows **Translation**, **English definition**, **Examples**, and **Pronunciation** (TTS).
- **Built-in offline dictionary (20,000 common words)**
  - Instant lookup without Internet. Falls back to online sources only when needed.
- **One-click save**
  - Select text → **Right-click → “Save to Wordbook”**.
- **Word details**
  - From **All Words** list, click a word to open a **detail card page** (same layout as review).
- **Export**
  - Export your collection to **CSV** or **JSON** (for backup or import into other apps).
- **Lightweight**
  - No popups while browsing; UI is only in the extension popup.

---

## Quick Start

1. **Install (unpacked)**
   - `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select the project folder.
2. **Save a word**
   - Select an English word on any page → Right-click → **Save to Wordbook**.
3. **Review**
   - Click the extension icon → **Today’s Review** to start.
4. **Export**
   - Open **All Words** → **Export JSON** / **Export CSV**.

---

## Permissions

- `storage` – store your word list and settings locally  
- `contextMenus` – show “Save to Wordbook” on right-click  
- `notifications` – show “Saved” toast

> **No tracking.** Your words are stored locally in the browser.  
> Offline dictionary is bundled; optional online lookup may query public APIs.

---

## Data & Credits

- **Offline dictionary:** Derived from **ECDICT** (MIT License).  
- **Common-word subset (20k):** selected via `wordfreq` frequency list.  
- Optional fallbacks: public dictionary/translation APIs (can be disabled in code).

Please keep the original licenses in your distributions.

---

<a id="zh"></a>

# Word SRS — 极简英文生词保存与复习扩展（中文）

> **亮点**  
> - **只做一件事：** 在网页中保存**英文单词**并用 **SRS** 复习。  
> - **不显示划词弹窗：** 安装后**不弹窗、不打扰**。  
> - **学习曲线简单：** 右键保存 → 到弹层里复习。

<p align="center">
<img src="assets/screenshot-review.png" alt="复习卡片截图" width="600"/>
</p>

---

## 功能

- **SRS 记忆**：每张卡片包含 **翻译、英文释义、例句、发音**（TTS）
- **内置 2 万常用词离线词典**：无网也能秒查，必要时才走在线兜底
- **一键保存**：选中单词 → 右键 → **保存到生词本**
- **单词详情页**：在 **全部单词** 列表里点击词条，进入与复习页一致的**详情卡**
- **导出**：可导出为 **CSV** 与 **JSON**，方便备份或导入其他记忆软件
- **轻量干净**：浏览网页不打扰，所有交互都在扩展弹层中完成

---

## 快速上手

1. **安装（加载已解压）**  
 `chrome://extensions` → 打开**开发者模式** → **加载已解压的扩展程序** → 选择项目目录
2. **保存单词**  
 网页中选中英文 → 右键 **保存到生词本**
3. **开始复习**  
 点击扩展图标 → **今日复习**
4. **导出**  
 打开 **全部单词** → 点击 **导出 JSON / 导出 CSV**

---

## 权限说明

- `storage`：在本地保存你的单词与设置  
- `contextMenus`：右键菜单“保存到生词本”  
- `notifications`：保存成功提示

> **隐私声明：** 单词数据仅保存在你的浏览器本地。  
> 内置词典可离线使用；在线查询仅在本地缺失时调用（可在代码中关闭）。

---

## 数据与致谢

- **离线词典：** 基于 **ECDICT**（MIT 许可）  
- **常用词子集（20k）：** 通过 `wordfreq` 词频筛选  
- 在线兜底：公共字典/翻译接口（可在代码中关闭）

请保留上游数据许可与署名。

---