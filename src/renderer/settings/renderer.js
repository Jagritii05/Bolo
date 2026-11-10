const api = window.bolo || window.localPill;

// Tab Switching
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

tabBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    tabBtns.forEach((b) => b.classList.remove('active'));
    tabContents.forEach((c) => (c.style.display = 'none'));

    btn.classList.add('active');
    const target = document.getElementById(`tab-${btn.dataset.tab}`);
    if (target) target.style.display = 'block';
  });
});

// Elements
const gnaniApiKey = document.getElementById('gnaniApiKey');
const llmRadios = document.querySelectorAll('input[name="llmProvider"]');
const modeRadios = document.querySelectorAll('input[name="appMode"]');
const groqGroup = document.getElementById('groqGroup');
const groqApiKey = document.getElementById('groqApiKey');
const geminiApiKey = document.getElementById('geminiApiKey');
const hotkey = document.getElementById('hotkey');
const defaultLanguage = document.getElementById('defaultLanguage');
const followUpTimeoutSec = document.getElementById('followUpTimeoutSec');
const debugMode = document.getElementById('debugMode');
const saveBtn = document.getElementById('saveBtn');
const saveFeedback = document.getElementById('saveFeedback');

// Toggle LLM Provider groups
function updateProviderUI(provider) {
  if (provider === 'groq') {
    groqGroup.style.display = 'block';
  } else {
    groqGroup.style.display = 'none';
  }
}

llmRadios.forEach((r) => {
  r.addEventListener('change', (e) => {
    updateProviderUI(e.target.value);
  });
});

// Load settings
async function loadSettings() {
  try {
    const s = await api.getSettings();
    if (!s) return;

    if (s.gnaniApiKey) gnaniApiKey.value = s.gnaniApiKey;
    if (s.groqApiKey) groqApiKey.value = s.groqApiKey;
    if (s.geminiApiKey) geminiApiKey.value = s.geminiApiKey;
    if (s.hotkey) hotkey.value = s.hotkey;
    if (s.language) defaultLanguage.value = s.language;
    if (s.followUpTimeoutSec) followUpTimeoutSec.value = s.followUpTimeoutSec;
    if (s.debug) debugMode.checked = s.debug;

    const mode = s.mode || 'explain';
    const targetModeRadio = document.querySelector(`input[name="appMode"][value="${mode}"]`);
    if (targetModeRadio) targetModeRadio.checked = true;

    const provider = s.llmProvider || 'groq';
    const targetRadio = document.querySelector(`input[name="llmProvider"][value="${provider}"]`);
    if (targetRadio) {
      targetRadio.checked = true;
      updateProviderUI(provider);
    }
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
}

loadSettings();

// Save settings
saveBtn.addEventListener('click', async () => {
  const selectedRadio = document.querySelector('input[name="llmProvider"]:checked');
  const provider = selectedRadio ? selectedRadio.value : 'groq';

  const selectedModeRadio = document.querySelector('input[name="appMode"]:checked');
  const mode = selectedModeRadio ? selectedModeRadio.value : 'explain';

  const newSettings = {
    mode,
    language: defaultLanguage.value,
    gnaniApiKey: gnaniApiKey.value.trim(),
    llmProvider: provider,
    groqApiKey: groqApiKey.value.trim(),
    geminiApiKey: geminiApiKey.value.trim(),
    hotkey: hotkey.value.trim() || 'CommandOrControl+Shift+Space',
    followUpTimeoutSec: parseInt(followUpTimeoutSec.value, 10) || 30,
    debug: debugMode.checked,
  };

  try {
    await api.saveSettings(newSettings);
    saveFeedback.style.display = 'inline-block';
    setTimeout(() => {
      saveFeedback.style.display = 'none';
    }, 2000);
  } catch (err) {
    alert('Failed to save settings: ' + err.message);
  }
});
