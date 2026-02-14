// Chrome Storage ストレージ抽象化レイヤー
// chrome.storage.local を使用（全オリジンで共有される）

const STORAGE_KEY = 'mercari_viewed_items';
const ALERT_KEY = 'mercari_alert_settings';
const PREMIUM_KEY = 'mercari_premium_unlocked';

// 初期化（互換性のため）
function initDB() {
  return Promise.resolve();
}

// マイグレーション（互換性のため）
async function migrateFromLegacyStorage() {
  console.log('[みちゃった君] マイグレーション済み');
  return Promise.resolve();
}

// ==============================
// 閲覧済み商品の操作
// ==============================

// 閲覧済み商品を全件取得
async function getViewedItems() {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      resolve(result[STORAGE_KEY] || {});
    });
  });
}

// 閲覧済み商品を保存
async function saveViewedItem(itemId) {
  const items = await getViewedItems();
  items[itemId] = Date.now();
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: items }, resolve);
  });
}

// 閲覧済み商品を一括保存（popup.jsのregisterItems用）
async function saveViewedItemsBulk(items) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: items }, resolve);
  });
}

// 閲覧済み商品の件数を取得
async function getViewedItemsCount() {
  const items = await getViewedItems();
  return Object.keys(items).length;
}

// 閲覧済み商品を全削除
async function clearAllViewedItems() {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: {} }, () => {
      console.log('[みちゃった君] 全履歴を削除しました');
      resolve(true);
    });
  });
}

// ==============================
// 設定の操作
// ==============================

// アラート設定を取得
async function getAlertSettings() {
  const DEFAULT_ALERT_SETTINGS = {
    ratings: 100,
    badRate: 5,
    listedDays: 180,
    updatedDays: 90,
    shipping47: false,
    shipping8: false
  };

  return new Promise((resolve) => {
    chrome.storage.local.get([ALERT_KEY], (result) => {
      const settings = result[ALERT_KEY] || {};
      resolve({ ...DEFAULT_ALERT_SETTINGS, ...settings });
    });
  });
}

// アラート設定を保存
async function saveAlertSettings(settings) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [ALERT_KEY]: settings }, resolve);
  });
}

// 会員機能が解除されているか確認
async function isPremiumUnlocked() {
  return new Promise((resolve) => {
    chrome.storage.local.get([PREMIUM_KEY], (result) => {
      resolve(result[PREMIUM_KEY] === true);
    });
  });
}

// 会員機能を解除
async function unlockPremium() {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [PREMIUM_KEY]: true }, resolve);
  });
}

// グローバルに公開（content.js, popup.jsから使用）
if (typeof window !== 'undefined') {
  window.MichattaStorage = {
    initDB,
    migrateFromLegacyStorage,
    getViewedItems,
    saveViewedItem,
    saveViewedItemsBulk,
    getViewedItemsCount,
    clearAllViewedItems,
    getAlertSettings,
    saveAlertSettings,
    isPremiumUnlocked,
    unlockPremium
  };
}
