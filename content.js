// content.js (V16 - 保持 V15 逻辑不变)

let contentFoundItems = new Set(); 

async function collectData(rules) {
    
    // 在编译之前，先过滤掉未启用或格式错误的规则
    const activeRules = rules.filter(r => r && r.enabled === true && r.regex && r.regex.trim() !== "");

    const compiledRules = activeRules.map(r => {
        try {
            return {
                name: r.name,
                regex: new RegExp(r.regex, 'gi')
            };
        } catch (e) {
            console.warn(`Invalid Regex in rule ${r.name}: ${r.regex}`);
            return null;
        }
    }).filter(r => r !== null);

    if (compiledRules.length === 0) return;

    let scanText = '';
    const sameOriginScriptUrls = [];
    let newItems = [];
    
    // --- 阶段 1: 收集 DOM 可见文本和内联脚本 ---
    if (document.body && document.body.innerText) {
        scanText += document.body.innerText;
    }
    document.querySelectorAll('script:not([src])').forEach(script => {
        if (script.textContent) {
            scanText += '\n' + script.textContent; 
        }
    });

    // --- 阶段 2: 查找同源外部 JS 文件 URL ---
    const pageOrigin = window.location.origin;

    document.querySelectorAll('script[src]').forEach(script => {
        const srcUrl = script.src;
        if (srcUrl && srcUrl.startsWith(pageOrigin)) { 
            sameOriginScriptUrls.push(srcUrl);
        }
    });
    
    // --- 阶段 3: 定义通用 Regex 扫描函数 ---
    const executeRegexScan = (text) => {
        compiledRules.forEach(rule => {
            let matches = [...text.matchAll(rule.regex)];
            matches.forEach(match => {
                const item = match[0].trim();
                if (item.length > 0 && !contentFoundItems.has(item)) {
                    contentFoundItems.add(item);
                    newItems.push(item);
                }
            });
        });
    };
    
    executeRegexScan(scanText);

    // --- 阶段 4: 异步 Fetch 并扫描同源外部 JS 文件 ---
    const fetchPromises = [];
    
    sameOriginScriptUrls.forEach(url => {
        const fetchTask = fetch(url)
            .then(response => {
                if (response.ok) return response.text();
                throw new Error(`Fetch failed with status ${response.status}`);
            })
            .then(code => {
                executeRegexScan(code);
            })
            .catch(e => {}); 
        fetchPromises.push(fetchTask);
    });
    
    await Promise.allSettled(fetchPromises);


    // --- 阶段 5: 发送最终结果 ---
    if (newItems.length > 0) {
        chrome.runtime.sendMessage({
            action: "itemsFound",
            items: newItems
        });
    }
}

// --- 接收指令 ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    (async () => {
        if (request.action === "singleScan") {
            await collectData(request.rules);
        }
    })();
});