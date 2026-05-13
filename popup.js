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

  // オフモール（ハードオフ）: netmall.hardoff.co.jp/product/[数字]/
  const hardoffMatch = input.match(/netmall\.hardoff\.co\.jp\/product\/([0-9]+)/);
  if (hardoffMatch) return 'hardoff_' + hardoffMatch[1];

  // ヤフショ: store.shopping.yahoo.co.jp/{store_id}/{product_id}.html
  const yshoppingMatch = input.match(/store\.shopping\.yahoo\.co\.jp\/([^/]+)\/([^/?#]+)\.html(?:[?#]|$)/);
  if (yshoppingMatch) return 'yshopping_' + yshoppingMatch[1] + '_' + yshoppingMatch[2];

  // Amazon: /dp/[ASIN] または /gp/product/[ASIN]
  const amazonMatch = input.match(/amazon\.co\.jp\/(?:.*\/)?(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?#]|$)/i);
  if (amazonMatch) return 'amazon_' + amazonMatch[1].toUpperCase();

  // === ID 単体入力の判定（URL 抽出に失敗した場合のフォールバック）===
  // 外部システム（一括登録シート、とりこみ君など）から ID のみが渡される場合に対応
  // 順序が重要: 上から順にマッチを試みる

  // メルカリ通常: m + 11桁数字（公式仕様、後続パターンとの衝突回避のため厳格化）
  // 例: m12345678901
  if (/^m[0-9]{11}$/.test(input)) return input;

  // メルカリショップ: 22文字英数字（大文字含む）
  // 例: 2JPHJ26x8jFtN7KeEhjufU
  if (/^[a-zA-Z0-9]{22}$/.test(input) && /[A-Z]/.test(input)) return 'shop_' + input;

  // ラクマ: 32文字16進数（小文字+数字）
  // 例: dc567a0938651c753ba26edaaef46d2b
  if (/^[a-f0-9]{32}$/.test(input)) return input;

  // Amazon ASIN: B0 + 8文字英数字（URL 側と整合: /i フラグで大文字小文字許容、保存時に大文字化）
  // 例: B0FWBGYGMB / b0fwbgygmb
  if (/^B0[A-Z0-9]{8}$/i.test(input)) return 'amazon_' + input.toUpperCase();

  // PayPayフリマ: z + 9桁数字
  // 例: z608386256
  if (/^z[0-9]{9}$/.test(input)) return 'paypay_' + input;

  // ヤフオク: 小文字 a-y + 10桁数字（z 始まりは上の PayPay で先取り済み）
  // 例: b1229521043
  if (/^[a-y][0-9]{10}$/.test(input)) return 'yahoo_' + input;

  // ハードオフ: 6〜10桁の数字（短すぎる/長すぎる数字の誤登録防止）
  // 例: 6142482
  if (/^[0-9]{6,10}$/.test(input)) return 'hardoff_' + input;

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

// IDのプレフィックスからサイト名を判定
function detectSite(itemId) {
  if (itemId.startsWith('paypay_')) return 'paypay';
  if (itemId.startsWith('shop_')) return 'mercari_shop';
  if (itemId.startsWith('rakuten_')) return 'rakuten';
  if (itemId.startsWith('yahoo_')) return 'yahoo_auction';
  if (itemId.startsWith('hardoff_')) return 'hardoff';
  if (itemId.startsWith('yshopping_')) return 'yahoo_shopping';
  if (itemId.startsWith('amazon_')) return 'amazon';
  if (/^m[a-zA-Z0-9]+$/.test(itemId)) return 'mercari';
  return 'rakuma';
}

// CSV用にフィールドをエスケープ（全フィールドをクォートで囲む）
function csvEscape(value) {
  const str = String(value);
  return '"' + str.replace(/"/g, '""') + '"';
}

// 2桁ゼロ埋め
function pad2(n) {
  return String(n).padStart(2, '0');
}

// ファイル名用のタイムスタンプ（YYYYMMDD_HHMMSS）
function formatFilenameTimestamp(date) {
  return (
    date.getFullYear() +
    pad2(date.getMonth() + 1) +
    pad2(date.getDate()) +
    '_' +
    pad2(date.getHours()) +
    pad2(date.getMinutes()) +
    pad2(date.getSeconds())
  );
}

// 人間可読なローカル日時（YYYY-MM-DD HH:MM:SS）
function formatViewedAt(timestampMs) {
  const d = new Date(timestampMs);
  return (
    d.getFullYear() + '-' +
    pad2(d.getMonth() + 1) + '-' +
    pad2(d.getDate()) + ' ' +
    pad2(d.getHours()) + ':' +
    pad2(d.getMinutes()) + ':' +
    pad2(d.getSeconds())
  );
}

// 閲覧履歴をCSVでエクスポート
async function exportItems() {
  const items = await window.MichattaStorage.getViewedItems();
  const ids = Object.keys(items);

  if (ids.length === 0) {
    showStatus('エクスポートする履歴がありません', true);
    return;
  }

  // 新しい順に並べる
  ids.sort((a, b) => items[b] - items[a]);

  const header = ['id', 'site', 'timestamp_ms', 'viewed_at'].map(csvEscape).join(',');
  const rows = ids.map((id) => {
    const ts = items[id];
    return [id, detectSite(id), ts, formatViewedAt(ts)].map(csvEscape).join(',');
  });

  // Excel互換のためUTF-8 BOMを付与、改行はCRLF
  const csv = '﻿' + header + '\r\n' + rows.join('\r\n') + '\r\n';
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'michatta_backup_' + formatFilenameTimestamp(new Date()) + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  showStatus(`${ids.length}件をエクスポートしました`);
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
document.getElementById('exportBtn').addEventListener('click', exportItems);

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
