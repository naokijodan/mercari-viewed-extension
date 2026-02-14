const PREMIUM_PASS = 'MGOOSE2025';

// デフォルトのアラート設定
const DEFAULT_ALERT_SETTINGS = {
  ratings: 100,
  badRate: 5,
  listedDays: 180,
  updatedDays: 90,
  shipping47: false,
  shipping8: false
};

// ストレージ初期化待ち
let storageReady = false;

// 商品IDをURLまたはIDから抽出
function extractItemId(input) {
  input = input.trim();

  // PayPayフリマ: paypayfleamarket.yahoo.co.jp/item/z491889774
  // ※メルカリより先に判定
  const paypayMatch = input.match(/paypayfleamarket\.yahoo\.co\.jp\/item\/([a-zA-Z0-9]+)/);
  if (paypayMatch) return 'paypay_' + paypayMatch[1];

  // メルカリ通常: /item/m12345678901（IDのみ）
  const mercariMatch = input.match(/jp\.mercari\.com\/item\/([a-zA-Z0-9]+)/);
  if (mercariMatch) return mercariMatch[1];

  // メルカリショップ: /shops/product/xxxxx（shop_プレフィックス）
  const mercariShopMatch = input.match(/jp\.mercari\.com\/shops\/product\/([a-zA-Z0-9]+)/);
  if (mercariShopMatch) return 'shop_' + mercariShopMatch[1];

  // ラクマ: item.fril.jp/xxxxx（IDのみ）
  const rakumaMatch = input.match(/item\.fril\.jp\/([a-zA-Z0-9]+)/);
  if (rakumaMatch) return rakumaMatch[1];

  // 楽天市場: item.rakuten.co.jp/shop/product/（URLパス全体）
  const rakutenMatch = input.match(/item\.rakuten\.co\.jp\/([^?#]+)/);
  if (rakutenMatch) return 'rakuten_' + rakutenMatch[1].replace(/\/$/, '');

  // ヤフオク: page.auctions.yahoo.co.jp/jp/auction/xxxxx
  // ※IDがzで始まる場合はPayPayフリマの商品
  const yahooAuctionMatch = input.match(/page\.auctions\.yahoo\.co\.jp\/jp\/auction\/([a-zA-Z0-9]+)/);
  if (yahooAuctionMatch) {
    const id = yahooAuctionMatch[1];
    return id.startsWith('z') ? 'paypay_' + id : 'yahoo_' + id;
  }

  // ヤフオク: auctions.yahoo.co.jp系
  const yahooSearchMatch = input.match(/auctions\.yahoo\.co\.jp.*\/([a-zA-Z0-9]{10,})/);
  if (yahooSearchMatch) {
    const id = yahooSearchMatch[1];
    return id.startsWith('z') ? 'paypay_' + id : 'yahoo_' + id;
  }

  // IDのみの場合（mで始まるメルカリ商品ID）
  if (/^m[a-zA-Z0-9]+$/.test(input)) {
    return input;
  }

  return null;
}

// 件数を更新
async function updateCount() {
  if (!storageReady) return;
  const count = await window.MichattaStorage.getViewedItemsCount();
  document.getElementById('count').textContent = count;
}

// ステータス表示
function showStatus(message, isError = false) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = 'status ' + (isError ? 'error' : 'success');
  setTimeout(() => {
    status.className = 'status';
  }, 3000);
}

// 登録処理
async function registerItems() {
  const input = document.getElementById('itemIds').value;
  const lines = input.split('\n').filter(line => line.trim());

  if (lines.length === 0) {
    showStatus('IDまたはURLを入力してください', true);
    return;
  }

  const viewedItems = await window.MichattaStorage.getViewedItems();
  let addedCount = 0;
  let skippedCount = 0;
  let invalidCount = 0;

  for (const line of lines) {
    const itemId = extractItemId(line);
    if (itemId) {
      if (!viewedItems[itemId]) {
        viewedItems[itemId] = Date.now();
        addedCount++;
      } else {
        skippedCount++;
      }
    } else {
      invalidCount++;
    }
  }

  // 一括保存（上限なし）
  await window.MichattaStorage.saveViewedItemsBulk(viewedItems);

  // 結果表示
  let message = `${addedCount}件を登録しました`;
  if (skippedCount > 0) message += `（${skippedCount}件は登録済み）`;
  if (invalidCount > 0) message += `（${invalidCount}件は無効なID）`;

  showStatus(message, invalidCount > 0 && addedCount === 0);
  document.getElementById('itemIds').value = '';
  updateCount();
}

// 全削除処理
async function clearAllItems() {
  const count = await window.MichattaStorage.getViewedItemsCount();

  if (count === 0) {
    showStatus('削除する履歴がありません', true);
    return;
  }

  // 二重確認
  const confirmed = confirm(`本当に全ての閲覧履歴（${count}件）を削除しますか？\n\nこの操作は取り消せません。`);

  if (!confirmed) {
    showStatus('削除をキャンセルしました');
    return;
  }

  // 削除実行
  const success = await window.MichattaStorage.clearAllViewedItems();

  if (success) {
    showStatus(`${count}件の履歴を削除しました`);
    updateCount();
  } else {
    showStatus('削除に失敗しました', true);
  }
}

// アラート設定を保存
async function saveAlertSettings() {
  const settings = {
    ratings: parseInt(document.getElementById('alertRatings').value) || 0,
    badRate: parseInt(document.getElementById('alertBadRate').value) || 0,
    listedDays: parseInt(document.getElementById('alertListedDays').value) || 0,
    updatedDays: parseInt(document.getElementById('alertUpdatedDays').value) || 0,
    shipping47: document.getElementById('alertShipping47').checked,
    shipping8: document.getElementById('alertShipping8').checked
  };

  await window.MichattaStorage.saveAlertSettings(settings);
  // アラート設定用のステータス表示
  const alertStatus = document.getElementById('alertStatus');
  alertStatus.textContent = '設定を保存しました';
  alertStatus.className = 'status success';
  setTimeout(() => {
    alertStatus.className = 'status';
  }, 3000);
}

// アラート設定をUIに反映
async function loadAlertSettings() {
  const settings = await window.MichattaStorage.getAlertSettings();
  document.getElementById('alertRatings').value = settings.ratings;
  document.getElementById('alertBadRate').value = settings.badRate;
  document.getElementById('alertListedDays').value = settings.listedDays;
  document.getElementById('alertUpdatedDays').value = settings.updatedDays;
  document.getElementById('alertShipping47').checked = settings.shipping47;
  document.getElementById('alertShipping8').checked = settings.shipping8;
}

// 会員パスで解除
async function unlockPremium() {
  const pass = document.getElementById('premiumPass').value.trim();
  if (pass === PREMIUM_PASS) {
    await window.MichattaStorage.unlockPremium();
    showStatus('会員機能を解除しました！');
    updatePremiumUI(true);
  } else {
    showStatus('パスワードが違います', true);
  }
}

// 会員機能のUI更新
function updatePremiumUI(isUnlocked) {
  const lockedEl = document.getElementById('premiumLocked');
  const unlockedEl = document.getElementById('premiumUnlocked');
  const alertSettings = document.getElementById('alertSettings');

  if (isUnlocked) {
    lockedEl.style.display = 'none';
    unlockedEl.style.display = 'block';
    alertSettings.classList.remove('locked');
  } else {
    lockedEl.style.display = 'block';
    unlockedEl.style.display = 'none';
    alertSettings.classList.add('locked');
  }
}

// イベント設定
document.getElementById('registerBtn').addEventListener('click', registerItems);
document.getElementById('saveAlertBtn').addEventListener('click', saveAlertSettings);
document.getElementById('unlockBtn').addEventListener('click', unlockPremium);
document.getElementById('clearAllBtn').addEventListener('click', clearAllItems);

// 初期化
async function init() {
  // ストレージを初期化
  try {
    await window.MichattaStorage.initDB();
    await window.MichattaStorage.migrateFromLegacyStorage();
    storageReady = true;
    console.log('[みちゃった君] ポップアップ: ストレージ初期化完了');
  } catch (error) {
    console.error('[みちゃった君] ポップアップ: ストレージ初期化エラー:', error);
    storageReady = true; // フォールバック
  }

  updateCount();
  loadAlertSettings();
  const isUnlocked = await window.MichattaStorage.isPremiumUnlocked();
  updatePremiumUI(isUnlocked);
}
init();
