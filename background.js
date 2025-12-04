// background.js (V16 - 新增 saveRules 动作)

let localCache = {
    isAutoScanEnabled: false,
    collectedItems: new Set()
};

const STORAGE_KEY_STATE = 'isAutoScanEnabled';
const STORAGE_KEY_ITEMS = 'collectedItems';
const STORAGE_KEY_RULES = 'autoScanRules'; 

// --- 数据存储/读取工具函数 ---
async function loadState() {
    const data = await chrome.storage.local.get([STORAGE_KEY_STATE, STORAGE_KEY_ITEMS, STORAGE_KEY_RULES]);
    localCache.isAutoScanEnabled = data[STORAGE_KEY_STATE] || false;
    localCache.collectedItems = new Set(data[STORAGE_KEY_ITEMS] || []);
}
function saveState(isEnabled) {
    localCache.isAutoScanEnabled = isEnabled;
    chrome.storage.local.set({ [STORAGE_KEY_STATE]: isEnabled });
}
function saveItems() {
    chrome.storage.local.set({ 
        [STORAGE_KEY_ITEMS]: Array.from(localCache.collectedItems) 
    });
}

// --- 自动扫描执行函数 ---
async function executeAutoScan(tabId) {
    await loadState(); 
    if (!localCache.isAutoScanEnabled) return; 

    const rulesData = await chrome.storage.local.get([STORAGE_KEY_RULES]);
    const rules = rulesData[STORAGE_KEY_RULES] || []; 
    
    if (rules.length === 0) return; 

    chrome.scripting.executeScript({
        target: {tabId: tabId},
        files: ['content.js']
    }).then(() => {
        chrome.tabs.sendMessage(tabId, {
            action: "singleScan", 
            rules: rules 
        }).catch(e => {});
    }).catch(error => {
        if (!error.message.includes("Cannot access contents of url")) {
             console.warn(`Scan injection failed on Tab ${tabId}:`, error);
        }
    });
}

// --- 监听页面加载事件 ---
chrome.webNavigation.onDOMContentLoaded.addListener(details => {
    if (details.frameId === 0 && details.url.startsWith('http')) {
        executeAutoScan(details.tabId);
    }
}, {url: [{schemes: ['http', 'https']}]}); 


// --- 消息监听器 (V16 新增 saveRules 处理器) ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    
    const handleAsync = async () => {
        await loadState(); 

        if (request.action === "start") {
            saveState(true); 
            // 存储所有规则，包括 enabled 状态
            await chrome.storage.local.set({ [STORAGE_KEY_RULES]: request.rules }); 
            sendResponse({ status: "running" }); 
            
        } else if (request.action === "stop") {
            saveState(false);
            sendResponse({ status: "stopped" });
            
        } else if (request.action === "saveRules") { // <-- 新增逻辑
            // 只保存规则，不改变运行状态
            await chrome.storage.local.set({ [STORAGE_KEY_RULES]: request.rules }); 
            sendResponse({ status: "saved" });
            
        } else if (request.action === "clear") {
            localCache.collectedItems.clear(); 
            saveItems(); 
            sendResponse({ status: "cleared" });
            
        } else if (request.action === "getState") {
            const rulesData = await chrome.storage.local.get([STORAGE_KEY_RULES]);
            sendResponse({
                status: localCache.isAutoScanEnabled ? "running" : "stopped",
                items: Array.from(localCache.collectedItems),
                rules: rulesData[STORAGE_KEY_RULES] || [] 
            });
            
        } else if (request.action === "itemsFound") { 
            let newCount = 0;
            request.items.forEach(item => {
                if (!localCache.collectedItems.has(item)) {
                    localCache.collectedItems.add(item);
                    newCount++;
                }
            });
            
            if (newCount > 0) {
                saveItems(); 
                chrome.runtime.sendMessage({
                    action: "updatePopup",
                    items: Array.from(localCache.collectedItems)
                }).catch(e => {}); 
            }
        }
    };
    
    handleAsync();
    return true;
});