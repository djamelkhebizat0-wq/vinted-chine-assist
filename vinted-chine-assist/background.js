/**
 * Service worker — routage léger (settings / options).
 */
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["vca_settings", "vca_templates"], (res) => {
    const patch = {};
    if (!res.vca_settings) {
      patch.vca_settings = {
        negotiationFloorPercent: 15,
        suggestCounterPercent: 8,
        bubbleEnabled: true
      };
    }
    if (Object.keys(patch).length) chrome.storage.local.set(patch);
  });
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "VCA_PING") {
    sendResponse({ ok: true, version: "1.0.0" });
    return true;
  }
  if (msg?.type === "VCA_OPEN_OPTIONS") {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return true;
  }
  if (msg?.type === "VCA_GET_SETTINGS") {
    chrome.storage.local.get(["vca_settings", "vca_templates"], (res) => {
      sendResponse({
        settings: res.vca_settings || null,
        templates: res.vca_templates || null
      });
    });
    return true;
  }
  return false;
});
