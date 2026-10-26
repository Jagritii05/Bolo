const api = window.localPill || window.electronAPI;

// Tabs
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

tabBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    tabBtns.forEach((b) => b.classList.remove('active'));
    tabContents.forEach((c) => (c.style.display = 'none'));

    btn.classList.add('active');
    const tabId = `tab-${btn.dataset.tab}`;
    const target = document.getElementById(tabId);
    if (target) target.style.display = 'block';
  });
});

// Engine selection logic
const engineRadios = document.querySelectorAll('input[name="engine"]');
const groqGroup = document.getElementById('groqGroup');
const groqApiKeyInput = document.getElementById('groqApiKey');

engineRadios.forEach((radio) => {
  radio.addEventListener('change', () => {
    groqGroup.style.display = radio.value === 'groq-whisper' ? 'block' : 'none';
  });
});

// Snippets state
let snippetsMap = {};

function renderSnippets() {
  const container = document.getElementById('snippetList');
  container.innerHTML = '';

  for (const [trigger, expansion] of Object.entries(snippetsMap)) {
    const item = document.createElement('div');
    item.className = 'snippet-item';

    const triggerEl = document.createElement('span');
    triggerEl.className = 'snippet-trigger';
    triggerEl.textContent = trigger;

    const expansionEl = document.createElement('span');
    expansionEl.className = 'snippet-expansion';
    expansionEl.textContent = expansion;

    const delBtn = document.createElement('button');
    delBtn.className = 'snippet-delete-btn';
    delBtn.innerHTML = '&times;';
    delBtn.title = 'Remove snippet';
    delBtn.addEventListener('click', () => {
      delete snippetsMap[trigger];
      renderSnippets();
    });

    item.appendChild(triggerEl);
    item.appendChild(expansionEl);
    item.appendChild(delBtn);
    container.appendChild(item);
  }
}

document.getElementById('addSnippetBtn').addEventListener('click', () => {
  const triggerInput = document.getElementById('newTrigger');
  const expansionInput = document.getElementById('newExpansion');
  const trigger = triggerInput.value.trim();
  const expansion = expansionInput.value.trim();

  if (trigger && expansion) {
    snippetsMap[trigger] = expansion;
    triggerInput.value = '';
    expansionInput.value = '';
    renderSnippets();
  }
});

// Load settings
// Load settings & telemetry
async function loadSettings() {
  if (!api || !api.getSettings) return;

  const s = await api.getSettings();
  if (!s) return;

  // Engine
  const selectedEngineRadio = document.querySelector(`input[name="engine"][value="${s.engine}"]`);
  if (selectedEngineRadio) {
    selectedEngineRadio.checked = true;
    groqGroup.style.display = s.engine === 'groq-whisper' ? 'block' : 'none';
  }

  groqApiKeyInput.value = s.groqApiKey || '';

  // Pipeline
  const p = s.textPipeline || {};
  document.getElementById('spokenPunctuation').checked = p.spokenPunctuation !== false;
  document.getElementById('fillerRemoval').checked = p.fillerRemoval !== false;
  document.getElementById('casing').checked = p.casing !== false;
  document.getElementById('maskSensitiveData').checked = p.maskSensitiveData !== false;
  document.getElementById('maskCard').checked = p.maskCard !== false;
  document.getElementById('maskAadhaar').checked = p.maskAadhaar !== false;
  document.getElementById('maskPan').checked = p.maskPan !== false;
  document.getElementById('maskApiKey').checked = p.maskApiKey !== false;
  document.getElementById('maskEmail').checked = Boolean(p.maskEmail);
  document.getElementById('maskPhone').checked = Boolean(p.maskPhone);

  // Snippets
  snippetsMap = { ...(s.snippets || {}) };
  renderSnippets();

  // General
  document.getElementById('hotkeyInput').value = s.hotkey || 'CommandOrControl+Shift+Space';
  const transportRadio = document.querySelector(`input[name="transport"][value="${s.transport || 'graft'}"]`);
  if (transportRadio) transportRadio.checked = true;
  document.getElementById('logTranscripts').checked = Boolean(s.logTranscripts);

  // Update telemetry
  const activeEngineEl = document.getElementById('telemetryActive');
  const deviceEl = document.getElementById('telemetryDevice');
  const loadTimeEl = document.getElementById('telemetryLoadTime');

  if (activeEngineEl) activeEngineEl.textContent = s.engine || 'whisper-base';

  try {
    if (api.listEngines) {
      const engines = await api.listEngines();
      const activeObj = engines.find((e) => e.is_active || e.id === s.engine);
      if (activeObj) {
        if (deviceEl) deviceEl.textContent = `${activeObj.device.toUpperCase()} (${activeObj.compute_type})`;
      }
    }
  } catch (_) {}
}

// Save settings & live engine swap
document.getElementById('saveBtn').addEventListener('click', async () => {
  const selectedEngine = document.querySelector('input[name="engine"]:checked')?.value || 'whisper-base';
  const selectedTransport = document.querySelector('input[name="transport"]:checked')?.value || 'graft';

  const newSettings = {
    engine: selectedEngine,
    groqApiKey: groqApiKeyInput.value.trim(),
    hotkey: document.getElementById('hotkeyInput').value.trim(),
    transport: selectedTransport,
    logTranscripts: document.getElementById('logTranscripts').checked,
    textPipeline: {
      spokenPunctuation: document.getElementById('spokenPunctuation').checked,
      fillerRemoval: document.getElementById('fillerRemoval').checked,
      casing: document.getElementById('casing').checked,
      maskSensitiveData: document.getElementById('maskSensitiveData').checked,
      maskCard: document.getElementById('maskCard').checked,
      maskAadhaar: document.getElementById('maskAadhaar').checked,
      maskPan: document.getElementById('maskPan').checked,
      maskApiKey: document.getElementById('maskApiKey').checked,
      maskEmail: document.getElementById('maskEmail').checked,
      maskPhone: document.getElementById('maskPhone').checked,
    },
    snippets: snippetsMap,
  };

  const statusEl = document.getElementById('saveStatus');
  const loadTimeEl = document.getElementById('telemetryLoadTime');
  const activeEngineEl = document.getElementById('telemetryActive');
  const deviceEl = document.getElementById('telemetryDevice');

  try {
    statusEl.textContent = 'Saving & configuring engine…';
    statusEl.style.color = '#818cf8';
    if (loadTimeEl) loadTimeEl.textContent = 'Loading…';

    const t0 = Date.now();
    await api.saveSettings(newSettings);
    const elapsed = Date.now() - t0;

    if (activeEngineEl) activeEngineEl.textContent = selectedEngine;
    if (loadTimeEl) loadTimeEl.textContent = `${elapsed} ms`;
    statusEl.textContent = 'Settings saved successfully!';
    statusEl.style.color = '#10b981';

    // Refresh telemetry
    try {
      if (api.listEngines) {
        const engines = await api.listEngines();
        const activeObj = engines.find((e) => e.is_active || e.id === selectedEngine);
        if (activeObj && deviceEl) {
          deviceEl.textContent = `${activeObj.device.toUpperCase()} (${activeObj.compute_type})`;
        }
      }
    } catch (_) {}

    setTimeout(() => {
      statusEl.textContent = '';
    }, 2500);
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}`;
    statusEl.style.color = '#ef4444';
  }
});

loadSettings();
