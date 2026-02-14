// IndexedDB ストレージ抽象化レイヤー
// 既存のchrome.storage.localとの互換性を保ちながらIndexedDBに移行

const DB_NAME = 'MichattaKunDB';
const DB_VERSION = 1;
const STORE_VIEWED = 'viewedItems';
const STORE_SETTINGS = 'settings';

// 旧ストレージキー（マイグレーション用）
const LEGACY_STORAGE_KEY = 'mercari_viewed_items';
const LEGACY_ALERT_KEY = 'mercari_alert_settings';
const LEGACY_PREMIUM_KEY = 'mercari_premium_unlocked';

let db = null;

// IndexedDBを初期化
function initDB() {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('[みちゃった君] IndexedDB初期化エラー:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      db = request.result;
      console.log('[みちゃった君] IndexedDB初期化完了');
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = event.target.result;

      // 閲覧済み商品ストア（キー: itemId, 値: timestamp）
      if (!database.objectStoreNames.contains(STORE_VIEWED)) {
        const viewedStore = database.createObjectStore(STORE_VIEWED, { keyPath: 'id' });
        viewedStore.createIndex('timestamp', 'timestamp', { unique: false });
        console.log('[みちゃった君] viewedItemsストア作成');
      }

      // 設定ストア
      if (!database.objectStoreNames.contains(STORE_SETTINGS)) {
        database.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
        console.log('[みちゃった君] settingsストア作成');
      }
    };
  });
}

// 旧ストレージからマイグレーション
async function migrateFromLegacyStorage() {
  try {
    const database = await initDB();

    // マイグレーション済みかチェック
    const migrated = await getSetting('migrated');
    if (migrated) {
      console.log('[みちゃった君] マイグレーション済み');
      return;
    }

    console.log('[みちゃった君] マイグレーション開始...');

    // 旧ストレージから閲覧済み商品を取得
    const legacyData = await new Promise((resolve) => {
      chrome.storage.local.get([LEGACY_STORAGE_KEY, LEGACY_ALERT_KEY, LEGACY_PREMIUM_KEY], (result) => {
        resolve(result);
      });
    });

    // 閲覧済み商品をIndexedDBに移行
    const viewedItems = legacyData[LEGACY_STORAGE_KEY] || {};
    const itemCount = Object.keys(viewedItems).length;

    if (itemCount > 0) {
      const tx = database.transaction(STORE_VIEWED, 'readwrite');
      const store = tx.objectStore(STORE_VIEWED);

      for (const [id, timestamp] of Object.entries(viewedItems)) {
        store.put({ id, timestamp });
      }

      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });

      console.log(`[みちゃった君] ${itemCount}件の閲覧履歴を移行完了`);
    }

    // アラート設定を移行
    if (legacyData[LEGACY_ALERT_KEY]) {
      await saveSetting('alertSettings', legacyData[LEGACY_ALERT_KEY]);
      console.log('[みちゃった君] アラート設定を移行完了');
    }

    // 会員情報を移行
    if (legacyData[LEGACY_PREMIUM_KEY]) {
      await saveSetting('premiumUnlocked', legacyData[LEGACY_PREMIUM_KEY]);
      console.log('[みちゃった君] 会員情報を移行完了');
    }

    // マイグレーション完了フラグ
    await saveSetting('migrated', true);
    console.log('[みちゃった君] マイグレーション完了');

  } catch (error) {
    console.error('[みちゃった君] マイグレーションエラー:', error);
  }
}

// ==============================
// 閲覧済み商品の操作
// ==============================

// 閲覧済み商品を全件取得
async function getViewedItems() {
  try {
    const database = await initDB();
    const tx = database.transaction(STORE_VIEWED, 'readonly');
    const store = tx.objectStore(STORE_VIEWED);

    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        // { id: timestamp } 形式に変換（既存コードとの互換性）
        const items = {};
        request.result.forEach(item => {
          items[item.id] = item.timestamp;
        });
        resolve(items);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('[みちゃった君] getViewedItemsエラー:', error);
    // フォールバック: 旧ストレージから取得
    return new Promise((resolve) => {
      chrome.storage.local.get([LEGACY_STORAGE_KEY], (result) => {
        resolve(result[LEGACY_STORAGE_KEY] || {});
      });
    });
  }
}

// 閲覧済み商品を保存
async function saveViewedItem(itemId) {
  try {
    const database = await initDB();
    const tx = database.transaction(STORE_VIEWED, 'readwrite');
    const store = tx.objectStore(STORE_VIEWED);

    store.put({ id: itemId, timestamp: Date.now() });

    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });

    // 二重書き: chrome.storage.localにもバックアップ（フォールバック用）
    const allItems = await getViewedItems();
    chrome.storage.local.set({ [LEGACY_STORAGE_KEY]: allItems });

  } catch (error) {
    console.error('[みちゃった君] saveViewedItemエラー:', error);
    // フォールバック: 旧ストレージに保存
    const items = await getViewedItems();
    items[itemId] = Date.now();
    chrome.storage.local.set({ [LEGACY_STORAGE_KEY]: items });
  }
}

// 閲覧済み商品を一括保存（popup.jsのregisterItems用）
async function saveViewedItemsBulk(items) {
  try {
    const database = await initDB();
    const tx = database.transaction(STORE_VIEWED, 'readwrite');
    const store = tx.objectStore(STORE_VIEWED);

    for (const [id, timestamp] of Object.entries(items)) {
      store.put({ id, timestamp });
    }

    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });

    // 二重書き
    const allItems = await getViewedItems();
    chrome.storage.local.set({ [LEGACY_STORAGE_KEY]: allItems });

  } catch (error) {
    console.error('[みちゃった君] saveViewedItemsBulkエラー:', error);
    chrome.storage.local.set({ [LEGACY_STORAGE_KEY]: items });
  }
}

// 閲覧済み商品の件数を取得
async function getViewedItemsCount() {
  try {
    const database = await initDB();
    const tx = database.transaction(STORE_VIEWED, 'readonly');
    const store = tx.objectStore(STORE_VIEWED);

    return new Promise((resolve, reject) => {
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('[みちゃった君] getViewedItemsCountエラー:', error);
    const items = await getViewedItems();
    return Object.keys(items).length;
  }
}

// 閲覧済み商品を全削除
async function clearAllViewedItems() {
  try {
    const database = await initDB();
    const tx = database.transaction(STORE_VIEWED, 'readwrite');
    const store = tx.objectStore(STORE_VIEWED);

    store.clear();

    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });

    // 旧ストレージもクリア
    chrome.storage.local.set({ [LEGACY_STORAGE_KEY]: {} });

    console.log('[みちゃった君] 全履歴を削除しました');
    return true;
  } catch (error) {
    console.error('[みちゃった君] clearAllViewedItemsエラー:', error);
    return false;
  }
}

// ==============================
// 設定の操作
// ==============================

// 設定を取得
async function getSetting(key) {
  try {
    const database = await initDB();
    const tx = database.transaction(STORE_SETTINGS, 'readonly');
    const store = tx.objectStore(STORE_SETTINGS);

    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => {
        resolve(request.result ? request.result.value : null);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('[みちゃった君] getSettingエラー:', error);
    return null;
  }
}

// 設定を保存
async function saveSetting(key, value) {
  try {
    const database = await initDB();
    const tx = database.transaction(STORE_SETTINGS, 'readwrite');
    const store = tx.objectStore(STORE_SETTINGS);

    store.put({ key, value });

    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error('[みちゃった君] saveSettingエラー:', error);
  }
}

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

  const settings = await getSetting('alertSettings');
  return { ...DEFAULT_ALERT_SETTINGS, ...settings };
}

// アラート設定を保存
async function saveAlertSettings(settings) {
  await saveSetting('alertSettings', settings);
  // 二重書き
  chrome.storage.local.set({ [LEGACY_ALERT_KEY]: settings });
}

// 会員機能が解除されているか確認
async function isPremiumUnlocked() {
  const unlocked = await getSetting('premiumUnlocked');
  return unlocked === true;
}

// 会員機能を解除
async function unlockPremium() {
  await saveSetting('premiumUnlocked', true);
  // 二重書き
  chrome.storage.local.set({ [LEGACY_PREMIUM_KEY]: true });
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
