// popup.js (V16 - 修复规则启用状态丢失问题)

let localItems = new Set();
let isRunning = false; 

const DEFAULT_RULES = [ 
    { name: "邮箱", regex: "([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\\.[a-zA-Z0-9._-]+)", enabled: true },
    { name: "电话", regex: "(\\+?\\d{1,3}[-. ]?)?\\(?\\d{3}\\)?[-. ]?\\d{3}[-. ]?\\d{4}", enabled: true }
];
let currentRules = []; 

// DOM 元素
const statusDisplay = document.getElementById('status');
const regexListUl = document.getElementById('regexList');
const resultListDiv = document.getElementById('resultList');
const countSpan = document.getElementById('count');
const addRuleButton = document.getElementById('addRuleButton');
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const exportButton = document.getElementById('exportButton');
const clearButton = document.getElementById('clearButton');

// --- V16 新增：保存规则到 Service Worker ---
function saveCurrentRules() {
    // 过滤掉空的规则，保持存储干净
    const rulesToSave = currentRules.filter(r => r.regex.trim() !== "");
    // 调用 Service Worker 中的 saveRules 动作进行持久化存储
    chrome.runtime.sendMessage({ action: "saveRules", rules: rulesToSave });
}

// --- 渲染 UI ---
function renderRuleList() {
    regexListUl.innerHTML = '';
    
    currentRules.forEach((rule, index) => {
        const li = document.createElement('li');
        
        if (!rule.enabled) {
            li.classList.add('disabled-rule');
        }

        // 启用/禁用 复选框 (V16: onchange 触发 saveCurrentRules)
        const toggleCheckbox = document.createElement('input');
        toggleCheckbox.type = 'checkbox';
        toggleCheckbox.className = 'rule-toggle';
        toggleCheckbox.checked = rule.enabled;
        toggleCheckbox.onchange = (e) => {
            currentRules[index].enabled = e.target.checked;
            saveCurrentRules(); // <-- V16 核心修复点
            renderRuleList(); 
        };

        // 规则名称输入框 (V16: onchange 触发 saveCurrentRules)
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'input-name';
        nameInput.value = rule.name;
        nameInput.placeholder = '名称';
        nameInput.onchange = (e) => { 
            currentRules[index].name = e.target.value.trim(); 
            saveCurrentRules(); // <-- V16 核心修复点
        };
        
        // Regex 输入框 (V16: onchange 触发 saveCurrentRules)
        const regexInput = document.createElement('input');
        regexInput.type = 'text';
        regexInput.className = 'input-regex';
        regexInput.value = rule.regex;
        regexInput.placeholder = '正则表达式';
        regexInput.onchange = (e) => { 
            currentRules[index].regex = e.target.value; 
            saveCurrentRules(); // <-- V16 核心修复点
        }; 
        
        // 删除按钮 (V16: onclick 触发 saveCurrentRules)
        const removeBtn = document.createElement('button');
        removeBtn.textContent = '—';
        removeBtn.className = 'action-button remove-button';
        removeBtn.onclick = () => {
            if (currentRules.length > 1) {
                currentRules.splice(index, 1);
                saveCurrentRules(); // <-- V16 核心修复点
                renderRuleList();
            } else {
                alert("请至少保留一条规则。");
            }
        };
        
        li.appendChild(toggleCheckbox);
        li.appendChild(nameInput);
        li.appendChild(regexInput);
        li.appendChild(removeBtn);
        regexListUl.appendChild(li);
    });
}

function updateStatusUI() {
    startButton.disabled = isRunning;
    stopButton.disabled = !isRunning;
    exportButton.disabled = localItems.size === 0;
    
    statusDisplay.textContent = `状态: ${isRunning ? '运行中' : '停止'}`;
    statusDisplay.style.color = isRunning ? 'green' : 'red';
    
    countSpan.textContent = localItems.size;
    
    resultListDiv.innerHTML = '';
    localItems.forEach(item => {
        const div = document.createElement('div');
        div.className = 'result-item';
        div.textContent = item;
        resultListDiv.appendChild(div);
    });
}

// --- 操作逻辑 ---
addRuleButton.onclick = () => {
    const nextNum = currentRules.length + 1;
    currentRules.push({
        name: `新规则${nextNum}`, 
        regex: "",
        enabled: true
    });
    saveCurrentRules(); // <-- V16 核心修复点
    renderRuleList();
};

startButton.onclick = () => {
    // 找出所有非空的规则
    const allNonEmptyRules = currentRules.filter(r => r.regex.trim() !== "");
    // 找出启用的且非空的规则
    const activeRules = allNonEmptyRules.filter(r => r.enabled);

    if (activeRules.length === 0) {
        alert("请启用至少一个有效正则表达式！");
        return;
    }
    
    // 存储所有非空规则（包括启用的和禁用的）并启动扫描
    chrome.runtime.sendMessage({ action: "start", rules: allNonEmptyRules }, (response) => {
        if (!chrome.runtime.lastError && response?.status === "running") {
            isRunning = true;
            updateStatusUI();
        }
    });
};

stopButton.onclick = () => {
    chrome.runtime.sendMessage({ action: "stop" }, (response) => {
        if (!chrome.runtime.lastError && response?.status === "stopped") {
            isRunning = false;
            updateStatusUI();
        }
    });
};

clearButton.onclick = () => {
    if (localItems.size > 0 && confirm("确定清空列表吗？")) {
        chrome.runtime.sendMessage({ action: "clear" }, (response) => {
            if (response?.status === "cleared") {
                localItems.clear();
                updateStatusUI();
            }
        });
    }
};

exportButton.onclick = () => {
    if (localItems.size === 0) return;
    const content = Array.from(localItems).join('\n');
    const blob = new Blob([content], {type: 'text/plain'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `collected_data_${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
};

// --- 初始化 ---
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "updatePopup") {
        localItems = new Set(msg.items);
        updateStatusUI();
    }
});

document.addEventListener('DOMContentLoaded', () => {
    chrome.runtime.sendMessage({ action: "getState" }, (res) => {
        if (!chrome.runtime.lastError && res) {
            isRunning = (res.status === "running");
            localItems = new Set(res.items);
            
            if (res.rules.length > 0) {
                 // 确保加载的规则包含 enabled 状态
                 currentRules = res.rules.map(rule => ({
                    ...rule,
                    enabled: rule.enabled === undefined ? true : rule.enabled 
                 }));
            } else {
                 currentRules = DEFAULT_RULES;
            }
            
            renderRuleList();
            updateStatusUI();
        } else {
            currentRules = DEFAULT_RULES;
            renderRuleList();
            updateStatusUI();
        }
    });
});