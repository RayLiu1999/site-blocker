// blocked.js

(async function () {
  const params = new URLSearchParams(window.location.search);
  const rawUrl = params.get('url') || '';

  // 顯示被封鎖的域名
  let displayDomain = rawUrl;
  if (rawUrl === 'WHITELIST_BLOCK') {
    displayDomain = '（白名單模式：此網站不在允許清單）';
  } else {
    try { displayDomain = decodeURIComponent(rawUrl); } catch { displayDomain = rawUrl; }
  }
  document.getElementById('blocked-domain').textContent = displayDomain;

  // 記錄封鎖事件
  try {
    let domain = displayDomain;
    if (rawUrl !== 'WHITELIST_BLOCK') {
      try { domain = new URL('https://' + displayDomain).hostname; } catch { }
    }
    chrome.runtime.sendMessage({ type: 'RECORD_BLOCKED', domain });
  } catch { }

  // 讀取設定
  const data = await chrome.storage.local.get(['motivationalQuotes', 'breakSettings', 'passwordHash', 'passwordHint']);
  const { breakSettings = {}, passwordHash, passwordHint, motivationalQuotes } = data;

  // 激勵語句
  const quotes = [
    '專注是成功的關鍵。',
    '分心的代價比你想像的更高。',
    '你的目標比那個網站更重要。',
    '一次只做一件事，做到最好。',
    '今天的努力，是明天的成果。',
    '保持專注，保持前進。',
    'Stay focused. Stay sharp.',
    'Your future self will thank you.',
    'One task at a time.',
    'Discipline is freedom.',
  ];
  if (motivationalQuotes !== false) {
    document.getElementById('blocked-quote').textContent =
      quotes[Math.floor(Math.random() * quotes.length)];
  } else {
    document.getElementById('blocked-quote').style.display = 'none';
  }

  // 返回按鈕
  document.getElementById('btn-back').addEventListener('click', () => {
    if (history.length > 1) history.back();
    else window.close();
  });

  // 暫時解除封鎖
  const blockType = breakSettings.type || 'cooldown';
  const snoozeBtn = document.getElementById('btn-snooze');

  snoozeBtn.addEventListener('click', () => {
    if (blockType === 'cooldown') {
      startCooldown(breakSettings.cooldownSeconds ?? 30, breakSettings.timedMinutes ?? 5);
    } else if (blockType === 'password') {
      showPasswordArea();
    } else if (blockType === 'timed') {
      doSnooze(breakSettings.timedMinutes ?? 5);
    }
  });

  // ── 冷靜計時器 ──────────────────────────────
  function startCooldown(seconds, snoozeMinutes) {
    const cooldownArea = document.getElementById('cooldown-area');
    const counter = document.getElementById('cooldown-counter');
    const confirmBtn = document.getElementById('btn-confirm-snooze');

    snoozeBtn.style.display = 'none';
    cooldownArea.style.display = 'block';

    let remaining = seconds;
    counter.textContent = remaining;

    const timer = setInterval(() => {
      remaining--;
      counter.textContent = remaining;
      if (remaining <= 0) {
        clearInterval(timer);
        confirmBtn.disabled = false;
        confirmBtn.textContent = '確認暫時解除';
      }
    }, 1000);

    confirmBtn.addEventListener('click', () => {
      doSnooze(snoozeMinutes);
    });
  }

  // ── 密碼輸入 ────────────────────────────────
  function showPasswordArea() {
    snoozeBtn.style.display = 'none';
    document.getElementById('password-area').style.display = 'block';
    if (passwordHint) {
      const hintEl = document.getElementById('password-hint');
      hintEl.textContent = '提示：' + passwordHint;
      hintEl.style.display = 'block';
    }

    document.getElementById('btn-confirm-password').addEventListener('click', async () => {
      const input = document.getElementById('password-input').value;
      const hash = await sha256(input);
      if (hash === passwordHash) {
        doSnooze(breakSettings.timedMinutes ?? 5);
      } else {
        document.getElementById('password-error').style.display = 'block';
        document.getElementById('password-input').value = '';
      }
    });

    document.getElementById('password-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('btn-confirm-password').click();
    });
  }

  // ── 執行解除 ────────────────────────────────
  function doSnooze(minutes) {
    chrome.runtime.sendMessage({ type: 'START_SNOOZE', minutes }, () => {
      // 導回原始網站
      if (rawUrl && rawUrl !== 'WHITELIST_BLOCK') {
        try {
          const decodedUrl = decodeURIComponent(rawUrl);
          const targetUrl = decodedUrl.startsWith('http') ? decodedUrl : 'https://' + decodedUrl;
          window.location.href = targetUrl;
        } catch {
          history.back();
        }
      } else {
        history.back();
      }
    });
  }

  // ── SHA-256 ──────────────────────────────────
  async function sha256(text) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
})();
