/**
 * 种基宝 - 基金资产看板
 * 功能：本地持久化、实时数据获取、收益计算
 */

// ====================
// 常量定义
// ====================
const STORAGE_KEY = 'fund_portfolio_v3';
const THEME_KEY = 'fund_tracker_theme';
const POLL_INTERVAL = 60000; // 60秒
const NEWS_POLL_INTERVAL = 180000; // 3分钟
const FETCH_TIMEOUT = 10000; // 10秒
const MAX_CACHE_SIZE = 50; // 最大缓存条目数
const INTRADAY_POINTS = 49; // 分时图数据点数

// ====================
// 数据存储管理
// ====================
let portfolio = {
    funds: [], // { code, shares, costPrice }
    dataCache: {}, // 实时数据缓存 { code: { name, nav, estimate, gztime } }
    lastUpdate: null
};

// 当前编辑的基金
let editingFundCode = null;

// 当前交易类型
let currentTradeType = 'buy'; // 'buy' | 'sell' | 'edit'

// 导入数据暂存
let importParsedData = [];

// 当前选中的基金（用于图表联动）
let selectedFundCode = null;

// 当前图表周期
let currentChartPeriod = 'day'; // 'day' | 'month' | 'year' | 'all'

// ====================
// 7x24小时财经快讯数据
// ====================
let newsData = [];
let lastNewsUpdate = null;

// Mock数据作为兜底
const mockNewsData = [
    {
        time: '10:42',
        title: '半导体板块持续走强，多只个股涨停，机构看好国产替代逻辑',
        tag: '半导体',
        summary: '今日半导体板块表现强势，多只个股触及涨停。分析人士指出，随着国内晶圆厂扩产加速，半导体设备材料国产替代进程持续推进，相关产业链公司有望持续受益。机构建议关注设备、材料、设计等环节的龙头标的。'
    },
    {
        time: '10:35',
        title: '贵州茅台发布业绩预告，2024年净利润同比增长15%，符合市场预期',
        tag: '白酒',
        summary: '贵州茅台公告，预计2024年实现营业总收入约1492亿元，同比增长约17%；预计实现归属于上市公司股东的净利润约735亿元，同比增长约15%。公司表示，业绩变动主要系产品销量增长及产品结构优化所致。'
    },
    {
        time: '10:28',
        title: '美联储官员暗示3月可能暂停加息，美股三大指数集体高开',
        tag: '美联储',
        summary: '美联储官员最新讲话暗示，考虑到通胀数据持续改善，3月议息会议可能暂停加息。受此消息影响，美股三大指数集体高开，道指涨0.8%，纳指涨1.2%，标普500指数涨0.9%。市场关注下周即将公布的非农就业数据。'
    },
    {
        time: '10:15',
        title: '新能源车企1月销量数据出炉，比亚迪、蔚来表现超预期',
        tag: '新能源',
        summary: '多家新能源车企公布1月销量数据。比亚迪1月销量20.1万辆，同比增长33%；蔚来交付1.5万辆，同比增长18%；理想交付3.1万辆，同比增长106%。业内人士表示，春节因素叠加地方促销政策，推动新能源汽车消费持续增长。'
    },
    {
        time: '09:56',
        title: '北向资金净流入超50亿元，连续3个交易日加仓A股核心资产',
        tag: '资金流向',
        summary: '今日北向资金净流入52.3亿元，连续第3个交易日净流入。从资金流向看，资金主要流入食品饮料、医药生物、电子等行业龙头企业。分析人士认为，外资持续流入反映了对A股中长期投资价值的认可。'
    },
    {
        time: '09:42',
        title: '券商板块异动拉升，头部券商获大资金青睐，市场活跃度提升',
        tag: '券商',
        summary: '券商板块今日早盘异动拉升，多只券商股涨幅超3%。成交数据显示，头部券商获得大资金净流入。市场分析认为，随着资本市场改革深化，券商投行、财富管理等业务有望迎来新的增长点，行业龙头估值有望修复。'
    },
    {
        time: '09:30',
        title: 'A股三大指数开盘涨跌不一，半导体、通信设备板块领涨',
        tag: '开盘',
        summary: 'A股三大指数今日开盘涨跌不一，上证指数跌0.12%，深证成指涨0.15%，创业板指涨0.28%。板块方面，半导体、通信设备、计算机设备涨幅居前；房地产、银行、煤炭板块跌幅居前。两市超2800只个股上涨。'
    }
];

// 新闻API配置
const NEWS_API_CONFIG = {
    // 东方财富7x24快讯API（通过allorigins代理）
    eastmoney: 'https://api.allorigins.win/raw?url=' + encodeURIComponent('https://emweb.securities.eastmoney.com/PC_HSF10/News/Index?type=7x24'),
    // 新浪财经RSS（通过allorigins代理）
    sina: 'https://api.allorigins.win/raw?url=' + encodeURIComponent('https://finance.sina.com.cn/stock/marketresearch/'),
    // 财联社API（通过allorigins代理）
    cls: 'https://api.allorigins.win/raw?url=' + encodeURIComponent('https://www.cls.cn/telegraph'),
    // 备用：使用East Money的JSONP接口
    eastmoneyDirect: 'https://newsapi.eastmoney.com/kuaixun/v1/getlist?size=20&callback=newsCallback'
};

// ====================
// 工具函数
// ====================

/**
 * 显示临时提示消息
 * @param {string} message - 提示内容
 * @param {number} duration - 显示时长（毫秒）
 */
function showToast(message, duration = 3000) {
    // 移除已存在的 toast
    const existingToast = document.querySelector('.toast-message');
    if (existingToast) {
        existingToast.remove();
    }
    
    // 创建新的 toast
    const toast = document.createElement('div');
    toast.className = 'toast-message';
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        font-size: 14px;
        z-index: 10000;
        animation: fadeInUp 0.3s ease;
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

/**
 * 带超时的 fetch 封装
 * @param {string} url - 请求URL
 * @param {object} options - fetch 选项
 * @param {number} timeout - 超时时间（毫秒）
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, options = {}, timeout = FETCH_TIMEOUT) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error(`Request timeout after ${timeout}ms`);
        }
        throw error;
    }
}

/**
 * 带限制的 Map 缓存类（LRU策略）
 */
class LRUCache extends Map {
    constructor(maxSize = MAX_CACHE_SIZE) {
        super();
        this.maxSize = maxSize;
    }
    
    set(key, value) {
        // 如果已存在，先删除再添加（移到最新）
        if (this.has(key)) {
            this.delete(key);
        }
        
        // 如果超出限制，删除最旧的条目
        if (this.size >= this.maxSize) {
            const firstKey = this.keys().next().value;
            this.delete(firstKey);
        }
        
        super.set(key, value);
        return this;
    }
}

// ====================
// 真实走势图数据获取
// ====================

// 历史数据缓存（使用LRU策略限制大小）
const historyDataCache = new LRUCache(MAX_CACHE_SIZE);

/**
 * 获取今天的日期字符串作为缓存键
 * 格式：YYYY-MM-DD（月份和日期补零）
 */
function getTodayKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * 获取基金历史走势数据（真实数据）
 * 使用东方财富基金数据接口（尝试多种数据源）
 */
async function fetchFundHistory(fundCode) {
    const todayKey = getTodayKey();
    const cacheKey = `${fundCode}_history_${todayKey}`;

    // 检查缓存
    if (historyDataCache.has(cacheKey)) {
        return historyDataCache.get(cacheKey);
    }

    // 定义多个数据源
    const dataSources = [
        {
            name: 'allorigins代理',
            url: `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://fund.eastmoney.com/pingzhongdata/${fundCode}.js?v=${Date.now()}`)}`
        },
        {
            name: 'corsproxy代理',
            url: `https://corsproxy.io/?${encodeURIComponent(`https://fund.eastmoney.com/pingzhongdata/${fundCode}.js?v=${Date.now()}`)}`
        },
        {
            name: '直接请求(需扩展)',
            url: `https://fund.eastmoney.com/pingzhongdata/${fundCode}.js?v=${Date.now()}`
        }
    ];

    for (const source of dataSources) {
        try {
            console.log(`📊 尝试使用 ${source.name} 获取基金 ${fundCode} 的历史数据...`);

            const response = await fetchWithTimeout(source.url, {
                headers: {
                    'Accept': '*/*'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const text = await response.text();
            console.log(`📄 基金 ${fundCode} 原始响应长度: ${text.length} 字符`);

            // 解析返回的JS数据
            // 东方财富返回的数据格式：Data_netWorthTrend = [{x: ..., y: ...}, {...}, ...];
            // 使用更强大的正则匹配，提取完整的数组
            // 先尝试匹配带分号的格式，再尝试不带分号的
            let netWorthMatch = text.match(/Data_netWorthTrend\s*=\s*(\[[\s\S]*?\]);/);
            if (!netWorthMatch) {
                netWorthMatch = text.match(/Data_netWorthTrend\s*=\s*(\[[\s\S]*?\])/);
            }

            console.log(`🔍 正则匹配结果: ${netWorthMatch ? '成功' : '失败'}`);

            let historyData = [];

            if (netWorthMatch) {
                try {
                    const netWorthData = JSON.parse(netWorthMatch[1]);
                    console.log(`📊 基金 ${fundCode} 解析到 ${netWorthData.length} 条原始数据`);

                    // 转换为内部格式 { date: '2024-01-15', nav: 1.2345, change: 0.5 }
                    const validData = netWorthData.filter(item => item.y !== null && item.y !== undefined && !isNaN(item.y));
                    historyData = validData.slice(-60).map((item, index, arr) => {
                        const date = new Date(item.x);
                        const prevNav = index > 0 ? arr[index - 1].y : item.y;
                        const change = index > 0 ? ((item.y - prevNav) / prevNav * 100) : 0;

                        return {
                            date: date.toISOString().split('T')[0],
                            time: `${date.getMonth() + 1}/${date.getDate()}`,
                            nav: item.y,
                            change: change,
                            timestamp: item.x
                        };
                    });
                    console.log(`✅ 基金 ${fundCode} 成功处理 ${historyData.length} 条有效历史数据`);

                    // 如果成功获取到数据，缓存并返回
                    if (historyData.length > 0) {
                        historyDataCache.set(cacheKey, historyData);
                        return historyData;
                    }
                } catch (e) {
                    console.warn(`❌ 解析基金 ${fundCode} 净值数据失败:`, e);
                }
            } else {
                console.warn(`⚠️ 基金 ${fundCode} 数据格式不匹配，未找到 Data_netWorthTrend`);
            }
        } catch (e) {
            console.warn(`⚠️ 使用 ${source.name} 获取基金 ${fundCode} 失败: ${e.message}`);
        }
    }

    // 所有数据源都尝试失败，返回null让调用方使用模拟数据
    console.warn(`⚠️ 基金 ${fundCode} 所有数据源获取失败，将使用模拟数据`);
    return null;
}

/**
 * 生成基于估算涨跌幅的分时图数据
 * 简单线性插值，不添加随机波动，真实反映估算值
 */
async function generateIntradayData(basePrice, changePercent, fundCode = 'default') {
    // 生成49个时间点的数据（9:30-11:30, 13:00-15:00）
    const points = 49;
    const data = [];
    
    // 目标价格（基于估算涨跌幅）
    const targetPrice = basePrice * (1 + changePercent / 100);
    
    for (let i = 0; i < points; i++) {
        const progress = i / (points - 1);
        const time = getTradeTime(i, points);
        
        // 简单线性插值：从昨收(basePrice)到当前估算(targetPrice)
        const price = basePrice + (targetPrice - basePrice) * progress;
        
        data.push({
            time: time,
            price: price,
            change: ((price - basePrice) / basePrice * 100)
        });
    }

    return data;
}

/**
 * 生成模拟分时数据（作为后备方案）
 * 简单线性走势，不添加随机波动
 */
function generateSimulatedIntradayData(basePrice, changePercent, fundCode = 'default', timeSeed = 0) {
    const points = 49;
    const data = [];
    
    // 目标价格
    const targetPrice = basePrice * (1 + changePercent / 100);
    
    // 简单线性插值
    for (let i = 0; i < points; i++) {
        const progress = i / (points - 1);
        const time = getTradeTime(i, points);
        const price = basePrice + (targetPrice - basePrice) * progress;
        
        data.push({
            time: time,
            price: price,
            change: ((price - basePrice) / basePrice * 100)
        });
    }

    return data;
}

function getTradeTime(index, totalPoints = 49) {
    // A股交易时间：9:30 - 11:30, 13:00 - 15:00
    // 共 4 小时 = 240 分钟 = 48 个 5 分钟间隔
    // 使用 49 个点确保包含起点和终点（9:30 和 15:00）
    const morningStart = 9 * 60 + 30; // 9:30
    const morningEnd = 11 * 60 + 30;  // 11:30
    const afternoonStart = 13 * 60;   // 13:00
    const afternoonEnd = 15 * 60;     // 15:00

    const morningMinutes = morningEnd - morningStart; // 120分钟
    const afternoonMinutes = afternoonEnd - afternoonStart; // 120分钟
    const totalMinutes = morningMinutes + afternoonMinutes; // 240分钟

    // 计算当前时间点对应的真实分钟数（均匀分布）
    const progress = index / (totalPoints - 1);
    const currentTotalMinutes = progress * totalMinutes;

    let actualMinutes;
    if (currentTotalMinutes <= morningMinutes) {
        // 上午时段
        actualMinutes = morningStart + currentTotalMinutes;
    } else {
        // 下午时段
        actualMinutes = afternoonStart + (currentTotalMinutes - morningMinutes);
    }

    const hours = Math.floor(actualMinutes / 60);
    const mins = Math.floor(actualMinutes % 60);

    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

// 初始化加载
function initStorage() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            portfolio.funds = parsed.funds || [];
        } catch (e) {
            console.error('Storage parse error:', e);
        }
    }

    // 如果没有数据，添加示例
    if (portfolio.funds.length === 0) {
        portfolio.funds = [
            { code: '014143', shares: 1000, costPrice: 1.00 },
            { code: '162711', shares: 686, costPrice: 1.4567 },
            { code: '009803', shares: 1000, costPrice: 1.00 },
            { code: '011908', shares: 100, costPrice: 0.7166 },
            { code: '011608', shares: 1000, costPrice: 2.4152 },
            { code: '013301', shares: 1000, costPrice: 4.6546 }
        ];
        saveStorage();
    }
}

function saveStorage() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            funds: portfolio.funds,
            lastUpdate: new Date().toISOString()
        }));
    } catch (e) {
        console.error('保存到本地存储失败:', e);
        // 检查是否是存储空间不足
        if (e.name === 'QuotaExceededError') {
            showToast('存储空间不足，请清理浏览器数据');
        }
    }
}

// ====================
// 天天基金数据接口
// ====================

/**
 * 解析基金数据（支持 JSON 和 JSONP 格式）
 */
async function parseFundResponse(response) {
    const contentType = response.headers.get('content-type');
    let data;

    if (contentType && contentType.includes('application/json')) {
        // 代理返回的 JSON
        data = await response.json();
    } else {
        // JSONP 格式
        const text = await response.text();
        const match = text.match(/jsonpgz\(({.+})\)/);
        if (!match) {
            throw new Error('Invalid response format');
        }
        try {
            data = JSON.parse(match[1]);
        } catch (e) {
            console.error('JSON解析失败:', e);
            throw new Error('JSON parse error');
        }
    }

    return {
        code: data.fundcode || data.code,
        name: data.name,
        nav: parseFloat(data.dwjz || data.nav || 0),
        estimate: parseFloat(data.gsz || data.estimate || 0),
        changePercent: parseFloat(data.gszzl || data.changePercent || 0),
        updateTime: data.gztime || data.updateTime
    };
}

/**
 * 获取单只基金数据（多数据源降级策略）
 */
async function fetchFundData(fundCode) {
    // 构建多个数据源（带时间戳防止缓存）
    // 优先使用 Vercel 代理（无CORS问题），备用第三方代理
    const timestamp = Date.now();
    const dataSources = [
        {
            name: 'Vercel代理',
            url: `/api/fund?code=${fundCode}&_=${timestamp}`,
            type: 'json'
        },
        {
            name: 'allorigins代理',
            url: `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://fundgz.1234567.com.cn/js/${fundCode}.js?_${timestamp}`)}`,
            type: 'jsonp'
        },
        {
            name: 'corsproxy代理',
            url: `https://corsproxy.io/?${encodeURIComponent(`https://fundgz.1234567.com.cn/js/${fundCode}.js?_${timestamp}`)}`,
            type: 'jsonp'
        }
    ];

    for (const source of dataSources) {
        try {
            console.log(`📊 尝试[${source.name}]获取基金 ${fundCode}...`);
            
            const response = await fetchWithTimeout(source.url, {
                headers: {
                    'Accept': '*/*',
                }
            }, 8000);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await parseFundResponse(response);
            console.log(`✅ [${source.name}]成功获取 ${fundCode}: ${data.name}`);
            return data;
            
        } catch (error) {
            console.warn(`❌ [${source.name}]失败: ${error.message}`);
            continue;
        }
    }

    console.error(`❌ 所有数据源均失败: ${fundCode}`);
    return null;
}

/**
 * 批量获取所有持仓基金数据
 */
async function fetchAllFundData() {
    updateDataStatus('loading');

    const codes = portfolio.funds.map(f => f.code);
    const results = await Promise.allSettled(
        codes.map(code => fetchFundData(code))
    );

    let successCount = 0;
    let failCount = 0;

    results.forEach((result, index) => {
        const code = codes[index];
        if (result.status === 'fulfilled' && result.value) {
            portfolio.dataCache[code] = result.value;
            successCount++;
        } else {
            failCount++;
            // 如果缓存中有旧数据，保留并使用
            if (!portfolio.dataCache[code]) {
                portfolio.dataCache[code] = null;
            }
        }
    });

    portfolio.lastUpdate = new Date();

    // 更新状态提示
    if (failCount === 0) {
        updateDataStatus('live');
    } else if (successCount > 0) {
        updateDataStatus('delayed');
    } else {
        updateDataStatus('error');
    }

    return { successCount, failCount };
}

// ====================
// 数据状态提示
// ====================
function updateDataStatus(status) {
    const statusEl = document.getElementById('dataStatus');
    const textEl = document.getElementById('statusText');

    if (!statusEl || !textEl) return;

    statusEl.className = 'data-status';

    switch (status) {
        case 'loading':
            textEl.textContent = '更新中...';
            break;
        case 'live':
            textEl.textContent = '数据实时';
            break;
        case 'delayed':
            statusEl.classList.add('delayed');
            textEl.textContent = '数据延迟';
            break;
        case 'error':
            statusEl.classList.add('error');
            textEl.textContent = '获取失败';
            break;
    }
}

// ====================
// 收益计算
// ====================

/**
 * 计算单只基金的收益
 * 今日收益 = (当前估值 - 昨日净值) * 持有份额
 * 累计收益 = (当前估值 - 成本单价) * 持有份额
 */
function calculateFundProfit(fund) {
    const data = portfolio.dataCache[fund.code];

    if (!data || !data.estimate) {
        return {
            ...fund,
            name: data?.name || '加载中...',
            marketValue: 0,
            dayProfit: 0,
            holdProfit: 0,
            dayRate: 0,
            isValid: false
        };
    }

    // 使用 round 函数处理浮点数精度
    const marketValue = round(fund.shares * data.estimate, 2);           // 市值
    const dayProfit = round((data.estimate - data.nav) * fund.shares, 2); // 今日收益
    const holdProfit = round((data.estimate - fund.costPrice) * fund.shares, 2); // 累计收益
    const dayRate = round(data.changePercent, 2);                        // 今日涨跌幅

    return {
        ...fund,
        name: data.name,
        nav: data.nav,
        estimate: data.estimate,
        updateTime: data.updateTime,
        marketValue,
        dayProfit,
        holdProfit,
        dayRate,
        isDayUp: dayRate >= 0,
        isHoldUp: holdProfit >= 0,
        isValid: true
    };
}

/**
 * 计算总览数据
 */
function calculateTotal() {
    const calculated = portfolio.funds.map(calculateFundProfit);

    // 使用 round 函数处理浮点数精度
    const totalAsset = round(calculated.reduce((sum, f) => sum + f.marketValue, 0), 2);
    const totalCost = round(calculated.reduce((sum, f) => sum + (f.shares * f.costPrice), 0), 2);
    const dayProfit = round(calculated.reduce((sum, f) => sum + f.dayProfit, 0), 2);
    const holdProfit = round(totalAsset - totalCost, 2);
    const totalRate = totalCost > 0 ? round((holdProfit / totalCost * 100), 2) : 0;

    return {
        funds: calculated,
        totalAsset,
        totalCost,
        dayProfit,
        holdProfit,
        totalRate
    };
}

// ====================
// UI 渲染
// ====================

/**
 * 处理浮点数精度问题
 * @param {number} num - 输入数字
 * @param {number} precision - 精度（小数位数）
 * @returns {number} 处理后的数字
 */
function round(num, precision = 2) {
    if (isNaN(num)) return 0;
    const factor = Math.pow(10, precision);
    return Math.round(num * factor) / factor;
}

function formatMoney(num) {
    if (isNaN(num)) return '--';
    // 先处理精度问题，再格式化
    const rounded = round(num, 2);
    return rounded.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatChange(num) {
    if (isNaN(num)) return '--';
    const sign = num >= 0 ? '+' : '';
    const rounded = round(num, 2);
    return `${sign}${rounded.toFixed(2)}%`;
}

function renderFundList() {
    const data = calculateTotal();
    const container = document.getElementById('fundList');
    const countEl = document.getElementById('fundCount');

    if (countEl) {
        countEl.textContent = `${data.funds.length} 只基金`;
    }

    if (data.funds.length === 0) {
        container.innerHTML = '<div class="empty-state">暂无持仓，点击右上角添加</div>';
        return;
    }

    container.innerHTML = data.funds.map(fund => {
        const rateClass = fund.isDayUp ? 'up' : 'down';
        const rateStr = fund.isValid ? formatChange(fund.dayRate) : '--';
        const valueStr = fund.isValid ? `¥ ${formatMoney(fund.marketValue)}` : '--';
        const loadingClass = !fund.isValid ? 'loading' : '';
        const activeClass = selectedFundCode === fund.code ? 'active' : '';

        return `
            <div class="fund-list-item ${loadingClass} ${activeClass}" data-code="${fund.code}"
                 onclick="handleFundClick('${fund.code}', event)">
                <div class="fund-list-header">
                    <span class="fund-list-name">${fund.name}</span>
                    <span class="fund-list-rate ${rateClass}">${rateStr}</span>
                </div>
                <div class="fund-list-footer">
                    <span class="fund-list-sector">${fund.code}</span>
                    <span class="fund-list-value">${valueStr}</span>
                </div>
            </div>
        `;
    }).join('');
}

// 处理基金点击 - 单击选中图表，双击或长按编辑
function handleFundClick(fundCode, event) {
    // 如果点击的是已选中的基金，打开编辑弹窗
    if (selectedFundCode === fundCode) {
        openEditModal(fundCode);
    } else {
        // 否则选中该基金并更新图表
        selectFund(fundCode);
    }
}

function updateOverview() {
    const data = calculateTotal();

    // 总资产
    const assetEl = document.getElementById('totalAsset');
    if (assetEl) assetEl.textContent = '¥ ' + formatMoney(data.totalAsset);

    // 当日收益
    const profitEl = document.getElementById('todayProfit');
    if (profitEl) {
        const prefix = data.dayProfit >= 0 ? '+' : '';
        profitEl.textContent = prefix + formatMoney(data.dayProfit);
        profitEl.className = 'stat-value ' + (data.dayProfit >= 0 ? 'positive' : 'negative');
    }

    // 持有收益
    const holdEl = document.getElementById('holdProfit');
    if (holdEl) {
        const prefix = data.holdProfit >= 0 ? '+' : '';
        holdEl.textContent = prefix + formatMoney(data.holdProfit);
        holdEl.className = 'stat-value ' + (data.holdProfit >= 0 ? 'positive' : 'negative');
    }

    // 累计收益率
    const rateEl = document.getElementById('totalRate');
    if (rateEl) {
        const prefix = data.totalRate >= 0 ? '+' : '';
        rateEl.textContent = prefix + data.totalRate.toFixed(2) + '%';
        rateEl.className = 'stat-value ' + (data.totalRate >= 0 ? 'positive' : 'negative');
    }
}

// ====================
// 7x24小时财经快讯渲染
// ====================
function renderNews() {
    const container = document.getElementById('newsList');
    if (!container) return;

    // 使用newsData（实时或Mock）
    const displayData = newsData.length > 0 ? newsData : mockNewsData;

    container.innerHTML = displayData.map((news, index) => `
        <div class="news-item" onclick="openNewsModal(${index})">
            <span class="news-time">${news.time}</span>
            <span class="news-title">${news.title}</span>
            ${news.tag ? `<span class="news-tag">${news.tag}</span>` : ''}
        </div>
    `).join('');

    // 更新LIVE徽章状态
    updateLiveBadge();
}

// 更新LIVE徽章状态
function updateLiveBadge() {
    const badge = document.getElementById('newsLiveBadge');
    if (!badge) return;

    if (lastNewsUpdate) {
        const updateTime = new Date(lastNewsUpdate);
        const now = new Date();
        const diffMinutes = Math.floor((now - updateTime) / 60000);

        if (diffMinutes < 5) {
            badge.textContent = 'LIVE';
            badge.classList.remove('offline');
        } else {
            badge.textContent = `${diffMinutes}分钟前`;
            badge.classList.add('offline');
        }
    } else {
        badge.textContent = 'LIVE';
        badge.classList.remove('offline');
    }
}

// ====================
// 新闻弹窗
// ====================
function openNewsModal(index) {
    // 优先使用newsData，如果没有则使用mockNewsData
    const displayData = newsData.length > 0 ? newsData : mockNewsData;
    const news = displayData[index];
    if (!news) return;

    document.getElementById('newsModalTime').textContent = news.time;
    document.getElementById('newsModalTag').textContent = news.tag || '快讯';
    document.getElementById('newsModalTitle').textContent = news.title;
    document.getElementById('newsModalSummary').textContent = news.summary || news.title;

    document.getElementById('newsModal').classList.add('active');
}

function closeNewsModal() {
    document.getElementById('newsModal').classList.remove('active');
}

// ====================
// ECharts 图表实例
// ====================
let chartInstance = null;

// 初始化 ECharts
function initChart() {
    const chartDom = document.getElementById('fundChart');
    if (!chartDom) return null;

    if (chartInstance) {
        chartInstance.dispose();
    }

    chartInstance = echarts.init(chartDom, null, {
        renderer: 'svg'
    });

    return chartInstance;
}

// 窗口大小变化时调整图表（带防抖）
let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        if (chartInstance) {
            chartInstance.resize();
        }
    }, 250);
});

// ====================
// 分时图渲染 - ECharts
// ====================
async function renderIntradayChart(data) {
    if (!chartInstance) {
        chartInstance = initChart();
    }
    if (!chartInstance) return;

    const intradayData = await generateIntradayData(data.nav, data.changePercent, data.code || 'default');
    const isUp = data.changePercent >= 0;
    const lineColor = isUp ? '#EF4444' : '#10B981';

    const times = intradayData.map(d => d.time);
    const prices = intradayData.map(d => d.price);

    const option = {
        grid: {
            top: '15%',
            left: '0%',
            right: '1%',
            bottom: '10%',
            containLabel: true
        },
        tooltip: {
            trigger: 'axis',
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            borderColor: 'rgba(148, 163, 184, 0.2)',
            borderWidth: 1,
            textStyle: {
                color: '#1e293b',
                fontSize: 13
            },
            formatter: function(params) {
                const dataIndex = params[0].dataIndex;
                const item = intradayData[dataIndex];
                const time = item.time;
                const price = item.price.toFixed(4);
                const change = item.change.toFixed(2);
                const changeColor = item.change >= 0 ? '#EF4444' : '#10B981';
                const changeSign = item.change >= 0 ? '+' : '';
                
                return `
                    <div style="padding: 8px;">
                        <div style="font-weight: 600; margin-bottom: 4px; color: #64748b;">${time}</div>
                        <div style="font-size: 16px; font-weight: 700; margin-bottom: 2px;">¥${price}</div>
                        <div style="color: ${changeColor}; font-size: 13px;">${changeSign}${change}%</div>
                    </div>
                `;
            }
        },
        xAxis: {
            type: 'category',
            data: times,
            boundaryGap: false,
            axisLine: { show: false },
            axisTick: {
                show: true,
                alignWithLabel: true,
                lineStyle: { color: 'rgba(148, 163, 184, 0.2)' }
            },
            axisLabel: {
                color: '#94A3B8',
                fontSize: 11,
                fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", sans-serif',
                interval: 11,
                formatter: function(value, index) {
                    const showLabels = ['09:30', '10:30', '11:30', '13:00', '14:00', '15:00'];
                    return showLabels.includes(value) ? value : '';
                }
            },
            splitLine: {
                show: true,
                lineStyle: {
                    color: 'rgba(148, 163, 184, 0.08)',
                    type: 'solid'
                },
                interval: 11
            }
        },
        yAxis: {
            type: 'value',
            scale: true,
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: { show: false },
            splitLine: {
                show: true,
                lineStyle: {
                    color: 'rgba(148, 163, 184, 0.12)',
                    type: 'dashed'
                }
            }
        },
        series: [
            {
                type: 'line',
                data: prices,
                smooth: 0.3,
                symbol: 'none',
                lineStyle: {
                    color: lineColor,
                    width: 2.5
                },
                areaStyle: {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: isUp ? 'rgba(239, 68, 68, 0.35)' : 'rgba(16, 185, 129, 0.35)' },
                        { offset: 0.6, color: isUp ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)' },
                        { offset: 1, color: isUp ? 'rgba(239, 68, 68, 0.02)' : 'rgba(16, 185, 129, 0.02)' }
                    ])
                },
                markLine: {
                    symbol: 'none',
                    silent: true,
                    data: [
                        {
                            yAxis: data.nav,
                            lineStyle: {
                                color: 'rgba(139, 92, 246, 0.4)',
                                type: 'dashed',
                                width: 1.5
                            },
                            label: { show: false }
                        }
                    ]
                },
                markPoint: {
                    symbol: 'circle',
                    symbolSize: 8,
                    data: [
                        {
                            coord: [prices.length - 1, prices[prices.length - 1]],
                            itemStyle: {
                                color: lineColor,
                                borderColor: '#fff',
                                borderWidth: 2
                            }
                        }
                    ],
                    label: { show: false }
                }
            }
        ],
        graphic: [
            {
                type: 'group',
                right: 10,
                top: 8,
                children: [
                    {
                        type: 'rect',
                        shape: { width: 60, height: 24, r: 6 },
                        style: { fill: isUp ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)' }
                    },
                    {
                        type: 'text',
                        style: {
                            text: (data.changePercent >= 0 ? '+' : '') + data.changePercent.toFixed(2) + '%',
                            fill: lineColor,
                            font: 'bold 13px -apple-system, BlinkMacSystemFont, "Inter", sans-serif',
                            textAlign: 'center',
                            textVerticalAlign: 'middle',
                            textBaseline: 'middle'
                        },
                        x: 30,
                        y: 12
                    }
                ]
            }
        ],
        animation: true,
        animationDuration: 500
    };

    chartInstance.setOption(option, true);
}

// 周期图表渲染（月、年、全部）- ECharts
async function renderPeriodChart(data, period) {
    if (!chartInstance) {
        chartInstance = initChart();
    }
    if (!chartInstance) return;

    const isUp = data.changePercent >= 0;
    const lineColor = isUp ? '#EF4444' : '#10B981';

    const pointsCount = { month: 30, year: 12, all: 24 }[period];
    const periodData = await generatePeriodData(data.nav, data.changePercent, pointsCount, period, data.code || 'default');

    // 生成标签：如果有真实日期数据就使用，否则使用默认格式
    const labels = periodData.map((d, i) => {
        // 如果有真实日期，优先使用
        if (d.date) {
            const date = new Date(d.date);
            if (period === 'month') {
                // 月度视图：显示日期，如 "1/15"
                return `${date.getMonth() + 1}/${date.getDate()}`;
            } else if (period === 'year') {
                // 年度视图：显示月份，如 "1月"
                return `${date.getMonth() + 1}月`;
            } else {
                // 全部视图：显示年月，如 "2024-01"
                return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            }
        }
        
        // 模拟数据的默认标签
        if (period === 'month') {
            return i % 7 === 0 ? `${i + 1}日` : '';
        } else if (period === 'year') {
            return `${i + 1}月`;
        } else {
            return i % 6 === 0 ? `${20 + Math.floor(i / 12)}年` : '';
        }
    });

    const option = {
        grid: {
            top: '15%',
            left: '0%',
            right: '1%',
            bottom: '10%',
            containLabel: true
        },
        tooltip: {
            trigger: 'axis',
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            borderColor: 'rgba(148, 163, 184, 0.2)',
            borderWidth: 1,
            textStyle: {
                color: '#1e293b',
                fontSize: 13
            },
            formatter: function(params) {
                const dataIndex = params[0].dataIndex;
                const item = periodData[dataIndex];
                const date = item.date || labels[dataIndex];
                const value = item.value.toFixed(4);
                const change = item.change ? item.change.toFixed(2) : '0.00';
                const changeColor = item.change >= 0 ? '#EF4444' : '#10B981';
                const changeSign = item.change >= 0 ? '+' : '';
                
                return `
                    <div style="padding: 8px;">
                        <div style="font-weight: 600; margin-bottom: 4px; color: #64748b;">${date}</div>
                        <div style="font-size: 16px; font-weight: 700; margin-bottom: 2px;">¥${value}</div>
                        <div style="color: ${changeColor}; font-size: 13px;">${changeSign}${change}%</div>
                    </div>
                `;
            }
        },
        xAxis: {
            type: 'category',
            data: labels,
            boundaryGap: false,
            axisLine: { show: false },
            axisTick: {
                show: true,
                alignWithLabel: true,
                lineStyle: { color: 'rgba(148, 163, 184, 0.2)' }
            },
            axisLabel: {
                color: '#94A3B8',
                fontSize: 11,
                fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", sans-serif',
                interval: period === 'month' ? 6 : 'auto',
                rotate: period === 'all' ? 45 : 0
            },
            splitLine: {
                show: true,
                lineStyle: {
                    color: 'rgba(148, 163, 184, 0.08)',
                    type: 'solid'
                }
            }
        },
        yAxis: {
            type: 'value',
            scale: true,
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: { show: false },
            splitLine: {
                show: true,
                lineStyle: {
                    color: 'rgba(148, 163, 184, 0.12)',
                    type: 'dashed'
                }
            }
        },
        series: [
            {
                type: 'line',
                data: periodData.map(d => d.value),
                smooth: 0.3,
                symbol: 'none',
                lineStyle: {
                    color: lineColor,
                    width: 2.5
                },
                areaStyle: {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: isUp ? 'rgba(239, 68, 68, 0.35)' : 'rgba(16, 185, 129, 0.35)' },
                        { offset: 0.6, color: isUp ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)' },
                        { offset: 1, color: isUp ? 'rgba(239, 68, 68, 0.02)' : 'rgba(16, 185, 129, 0.02)' }
                    ])
                },
                markLine: {
                    symbol: 'none',
                    silent: true,
                    data: [
                        {
                            yAxis: data.nav,
                            lineStyle: {
                                color: 'rgba(139, 92, 246, 0.4)',
                                type: 'dashed',
                                width: 1.5
                            },
                            label: { show: false }
                        }
                    ]
                },
                markPoint: {
                    symbol: 'circle',
                    symbolSize: 8,
                    data: [
                        {
                            coord: [periodData.length - 1, periodData[periodData.length - 1].value],
                            itemStyle: {
                                color: lineColor,
                                borderColor: '#fff',
                                borderWidth: 2
                            }
                        }
                    ],
                    label: { show: false }
                }
            }
        ],
        graphic: [
            {
                type: 'group',
                right: 10,
                top: 8,
                children: [
                    {
                        type: 'rect',
                        shape: { width: 60, height: 24, r: 6 },
                        style: { fill: isUp ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)' }
                    },
                    {
                        type: 'text',
                        style: {
                            text: (data.changePercent >= 0 ? '+' : '') + data.changePercent.toFixed(2) + '%',
                            fill: lineColor,
                            font: 'bold 13px -apple-system, BlinkMacSystemFont, "Inter", sans-serif',
                            textAlign: 'center',
                            textVerticalAlign: 'middle',
                            textBaseline: 'middle'
                        },
                        x: 30,
                        y: 12
                    }
                ]
            }
        ],
        animation: true,
        animationDuration: 500
    };

    chartInstance.setOption(option, true);
}

// 周期数据缓存（使用LRU策略）
const periodDataCache = new LRUCache(MAX_CACHE_SIZE);

/**
 * 生成周期数据（月、年、全部）- 优先使用真实历史数据
 */
async function generatePeriodData(basePrice, changePercent, points, period, fundCode = 'default') {
    // 缓存键只包含基金代码、周期和点数，不包含价格和涨跌幅
    const cacheKey = `${fundCode}_${period}_${points}_${getTodayKey()}`;

    // 检查缓存
    if (periodDataCache.has(cacheKey)) {
        console.log(`📈 使用缓存数据: ${fundCode} ${period}`);
        return periodDataCache.get(cacheKey);
    }

    // 尝试获取真实历史数据
    console.log(`📊 获取历史数据: ${fundCode} ${period}...`);
    const historyData = await fetchFundHistory(fundCode);
    
    console.log(`📊 ${fundCode} 获取到 ${historyData ? historyData.length : 0} 条历史数据`);

    // 只要有足够的历史数据（至少5条），就优先使用
    if (historyData && historyData.length >= 5) {
        let filteredData = [];

        if (period === 'month') {
            // 近30天数据，取最近的points条或全部
            filteredData = historyData.slice(-Math.min(points, historyData.length));
        } else if (period === 'year') {
            // 近12个月，每月取一个点
            const monthlyData = [];
            const monthMap = new Map();

            for (const item of historyData) {
                const date = new Date(item.date);
                const monthKey = `${date.getFullYear()}-${date.getMonth()}`;

                if (!monthMap.has(monthKey)) {
                    monthMap.set(monthKey, item);
                    monthlyData.push(item);
                }
            }

            filteredData = monthlyData.slice(-Math.min(points, monthlyData.length));
        } else {
            // 'all' - 所有历史数据，均匀取点
            const targetCount = Math.min(points, historyData.length);
            const step = Math.max(1, Math.floor(historyData.length / targetCount));
            for (let i = 0; i < historyData.length; i += step) {
                filteredData.push(historyData[i]);
                if (filteredData.length >= targetCount) break;
            }
        }

        console.log(`✅ ${fundCode} ${period} 使用 ${filteredData.length} 条真实历史数据`);

        // 转换为图表数据格式
        const data = filteredData.map((item, index) => ({
            index: index,
            value: item.nav,
            change: item.change,
            date: item.date
        }));

        // 缓存结果
        periodDataCache.set(cacheKey, data);
        return data;
    }

    console.warn(`⚠️ ${fundCode} 历史数据不足，使用模拟数据`);
    // 如果没有真实数据，使用模拟数据（传入时间戳确保每次刷新有变化）
    const now = new Date();
    const timeSeed = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    const simulatedData = generateSimulatedPeriodData(basePrice, changePercent, points, period, fundCode, timeSeed);
    periodDataCache.set(cacheKey, simulatedData);
    return simulatedData;
}

/**
 * 生成模拟周期数据（后备方案）
 * 使用随机漫步而非正弦波，更贴近真实市场走势
 */
function generateSimulatedPeriodData(basePrice, changePercent, points, period, fundCode = 'default', timeSeed = 0) {
    const data = [];
    
    // 根据周期确定总变化幅度
    const periodChange = changePercent * (period === 'month' ? 1 : period === 'year' ? 2.5 : 5);
    
    // 目标终点价格
    const targetEndPrice = basePrice * (1 + periodChange / 100);
    
    // 简单线性插值
    for (let i = 0; i < points; i++) {
        const progress = i / (points - 1);
        const value = basePrice + (targetEndPrice - basePrice) * progress;

        data.push({
            index: i,
            value: value,
            change: ((value - basePrice) / basePrice * 100)
        });
    }

    return data;
}

function renderDefaultChart() {
    if (!chartInstance) {
        chartInstance = initChart();
    }
    if (!chartInstance) return;

    const option = {
        grid: {
            top: '15%',
            left: '0%',
            right: '1%',
            bottom: '10%',
            containLabel: true
        },
        xAxis: {
            type: 'category',
            data: [],
            boundaryGap: false,
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: { show: false },
            splitLine: { show: false }
        },
        yAxis: {
            type: 'value',
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: { show: false },
            splitLine: { show: false }
        },
        series: [],
        graphic: [
            {
                type: 'text',
                left: 'center',
                top: 'center',
                style: {
                    text: '点击左侧基金查看走势',
                    fill: '#94A3B8',
                    font: '14px -apple-system, BlinkMacSystemFont, "Inter", sans-serif'
                }
            }
        ]
    };

    chartInstance.setOption(option, true);
}

// 选择基金并更新图表
function selectFund(fundCode) {
    selectedFundCode = fundCode;

    // 更新列表选中状态
    document.querySelectorAll('.fund-list-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.code === fundCode) {
            item.classList.add('active');
        }
    });

    // 使用 setTimeout 确保 DOM 更新完成后再渲染图表
    setTimeout(() => {
        renderChart(fundCode, currentChartPeriod);
    }, 0);
}

// 切换图表周期
function switchChartPeriod(period) {
    currentChartPeriod = period;

    // 更新按钮状态
    document.querySelectorAll('.period-tab').forEach(tab => {
        tab.classList.remove('active');
        tab.setAttribute('aria-selected', 'false');
        if (tab.dataset.period === period) {
            tab.classList.add('active');
            tab.setAttribute('aria-selected', 'true');
        }
    });

    // 使用 setTimeout 确保 DOM 更新完成后再渲染图表
    setTimeout(() => {
        // 如果有选中的基金，重新渲染图表
        if (selectedFundCode) {
            renderChart(selectedFundCode, period);
        } else {
            // 显示默认图表
            renderDefaultChart();
        }
    }, 0);
}

// 通用图表渲染函数
async function renderChart(fundCode, period) {
    const titleEl = document.getElementById('chartTitle');

    if (!titleEl) return;

    const fund = portfolio.funds.find(f => f.code === fundCode);
    const data = portfolio.dataCache[fundCode];

    if (!fund || !data || !data.estimate) {
        titleEl.textContent = '收益走势';
        renderDefaultChart();
        return;
    }

    // 根据周期更新标题
    const periodNames = { day: '分时', month: '月度', year: '年度', all: '全部' };
    titleEl.textContent = `${data.name} ${periodNames[period]}走势`;

    switch (period) {
        case 'day':
            await renderIntradayChart(data);
            break;
        case 'month':
            await renderPeriodChart(data, 'month');
            break;
        case 'year':
            await renderPeriodChart(data, 'year');
            break;
        case 'all':
            await renderPeriodChart(data, 'all');
            break;
    }
}

async function updateUI() {
    // 并行获取基金数据和市场指数
    await Promise.all([
        fetchAllFundData(),
        fetchMarketIndices()
    ]);
    renderFundList();
    updateOverview();
    // 获取实时新闻（首次加载或间隔超过5分钟）
    if (!lastNewsUpdate || (new Date() - new Date(lastNewsUpdate)) > 5 * 60 * 1000) {
        await fetchNews();
    } else {
        renderNews();
    }

    // 渲染图表（async 函数调用）
    // 如果有选中的基金，更新图表；否则显示默认图表
    if (selectedFundCode && portfolio.dataCache[selectedFundCode]) {
        await renderChart(selectedFundCode, currentChartPeriod);
    } else {
        renderDefaultChart();
    }
}

// ====================
// iOS 编辑弹窗
// ====================

function openEditModal(fundCode) {
    editingFundCode = fundCode;
    const fund = portfolio.funds.find(f => f.code === fundCode);
    const data = portfolio.dataCache[fundCode];

    if (!fund) return;

    document.getElementById('editFundCode').textContent = fund.code;

    // 更新当前持仓信息
    document.getElementById('currentShares').textContent = fund.shares.toFixed(2);
    document.getElementById('currentCost').textContent = fund.costPrice.toFixed(4);

    if (data) {
        document.getElementById('editFundName').textContent = data.name;
        document.getElementById('previewNav').textContent = data.estimate.toFixed(4);

        const changeEl = document.getElementById('previewChange');
        const changeText = data.changePercent >= 0 ? `+${data.changePercent}%` : `${data.changePercent}%`;
        changeEl.textContent = changeText;
        changeEl.className = 'preview-value ' + (data.changePercent >= 0 ? 'up' : 'down');
    } else {
        document.getElementById('editFundName').textContent = '加载中...';
        document.getElementById('previewNav').textContent = '--';
        document.getElementById('previewChange').textContent = '--';
    }

    // 重置交易类型为买入
    switchTradeType('buy');

    document.getElementById('editModal').classList.add('active');
}

function hideEditModal() {
    document.getElementById('editModal').classList.remove('active');
    editingFundCode = null;
}

function saveFundEdit() {
    if (!editingFundCode) return;

    const shares = parseFloat(document.getElementById('editShares').value);
    const costPrice = parseFloat(document.getElementById('editCost').value);

    if (isNaN(shares) || isNaN(costPrice) || shares <= 0 || costPrice <= 0) {
        alert('请输入有效的数值');
        return;
    }

    const fund = portfolio.funds.find(f => f.code === editingFundCode);
    if (fund) {
        fund.shares = shares;
        fund.costPrice = costPrice;
        saveStorage();
        updateUI();
    }

    hideEditModal();
}

function deleteCurrentFund() {
    if (!editingFundCode) return;

    if (confirm('确定删除该基金？')) {
        portfolio.funds = portfolio.funds.filter(f => f.code !== editingFundCode);
        delete portfolio.dataCache[editingFundCode];
        saveStorage();
        updateUI();
        hideEditModal();
    }
}

// ====================
// 加减仓交易功能
// ====================

function switchTradeType(type) {
    currentTradeType = type;

    // 更新标签样式
    document.querySelectorAll('.trade-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.type === type) {
            tab.classList.add('active');
        }
    });

    // 更新输入标签
    const amountLabel = document.getElementById('tradeAmountLabel');
    const tradePriceGroup = document.getElementById('tradePriceGroup');
    const confirmBtn = document.getElementById('tradeConfirmBtn');

    if (type === 'buy') {
        amountLabel.textContent = '买入金额 (元)';
        tradePriceGroup.style.display = 'none';
        confirmBtn.textContent = '确认买入';
        confirmBtn.className = 'ios-btn-save';
    } else if (type === 'sell') {
        amountLabel.textContent = '卖出份额';
        tradePriceGroup.style.display = 'none';
        confirmBtn.textContent = '确认卖出';
        confirmBtn.className = 'ios-btn-delete';
    } else if (type === 'edit') {
        amountLabel.textContent = '持有份额';
        tradePriceGroup.style.display = 'block';
        confirmBtn.textContent = '保存修改';
        confirmBtn.className = 'ios-btn-save';
    }

    // 清空输入
    document.getElementById('tradeAmount').value = '';
    document.getElementById('tradePrice').value = '';
    document.getElementById('tradePreview').style.display = 'none';
}

function calculateTradePreview() {
    const amount = parseFloat(document.getElementById('tradeAmount').value);
    const price = parseFloat(document.getElementById('tradePrice').value);
    const fund = portfolio.funds.find(f => f.code === editingFundCode);
    const data = portfolio.dataCache[editingFundCode];

    if (!fund) return;

    const currentNav = data?.estimate || data?.nav || fund.costPrice;
    const tradePrice = !isNaN(price) && price > 0 ? price : currentNav;

    document.getElementById('tradePreview').style.display = 'block';

    const sharesEl = document.getElementById('previewTradeShares');
    const costChangeEl = document.getElementById('previewCostChange');

    if (currentTradeType === 'buy') {
        if (isNaN(amount) || amount <= 0 || tradePrice <= 0) {
            sharesEl.textContent = '--';
            costChangeEl.textContent = '--';
            return;
        }
        const newShares = amount / tradePrice;
        const totalShares = fund.shares + newShares;
        const totalCost = (fund.shares * fund.costPrice) + amount;
        const newCostPrice = totalCost / totalShares;

        sharesEl.textContent = `+${newShares.toFixed(2)} 份`;
        costChangeEl.textContent = `${fund.costPrice.toFixed(4)} → ${newCostPrice.toFixed(4)}`;
    } else if (currentTradeType === 'sell') {
        if (isNaN(amount) || amount <= 0) {
            sharesEl.textContent = '--';
            costChangeEl.textContent = '--';
            return;
        }
        const sellShares = Math.min(amount, fund.shares);
        const remainingShares = fund.shares - sellShares;

        sharesEl.textContent = `-${sellShares.toFixed(2)} 份`;
        costChangeEl.textContent = remainingShares > 0
            ? `剩余 ${remainingShares.toFixed(2)} 份`
            : '全部清仓';
    } else if (currentTradeType === 'edit') {
        if (isNaN(amount) || amount < 0 || isNaN(price) || price <= 0) {
            sharesEl.textContent = '--';
            costChangeEl.textContent = '--';
            return;
        }
        sharesEl.textContent = `${amount.toFixed(2)} 份`;
        costChangeEl.textContent = `${fund.costPrice.toFixed(4)} → ${price.toFixed(4)}`;
    }
}

function confirmTrade() {
    if (!editingFundCode) return;

    const fund = portfolio.funds.find(f => f.code === editingFundCode);
    if (!fund) return;

    const amount = parseFloat(document.getElementById('tradeAmount').value);
    const price = parseFloat(document.getElementById('tradePrice').value);
    const data = portfolio.dataCache[editingFundCode];
    const currentNav = data?.estimate || data?.nav || fund.costPrice;
    const tradePrice = !isNaN(price) && price > 0 ? price : currentNav;

    if (currentTradeType === 'buy') {
        if (isNaN(amount) || amount <= 0 || tradePrice <= 0) {
            alert('请输入有效的买入金额');
            return;
        }
        const newShares = amount / tradePrice;
        const totalCost = (fund.shares * fund.costPrice) + amount;
        fund.shares += newShares;
        fund.costPrice = totalCost / fund.shares;
    } else if (currentTradeType === 'sell') {
        if (isNaN(amount) || amount <= 0) {
            alert('请输入有效的卖出份额');
            return;
        }
        if (amount > fund.shares) {
            alert(`最多可卖出 ${fund.shares.toFixed(2)} 份`);
            return;
        }
        fund.shares -= amount;
        if (fund.shares <= 0.001) {
            // 全部清仓，删除基金
            portfolio.funds = portfolio.funds.filter(f => f.code !== editingFundCode);
            delete portfolio.dataCache[editingFundCode];
            if (selectedFundCode === editingFundCode) {
                selectedFundCode = null;
            }
        }
    } else if (currentTradeType === 'edit') {
        if (isNaN(amount) || amount < 0 || isNaN(price) || price <= 0) {
            alert('请输入有效的数值');
            return;
        }
        fund.shares = amount;
        fund.costPrice = price;
    }

    saveStorage();
    updateUI();
    hideEditModal();
}

// ====================
// 添加基金
// ====================

function showAddModal() {
    document.getElementById('addModal').classList.add('active');
    document.getElementById('fundCode').focus();
}

function hideAddModal() {
    document.getElementById('addModal').classList.remove('active');
    document.getElementById('fundCode').value = '';
    document.getElementById('fundAmount').value = '';
    document.getElementById('fundShares').value = '';
    document.getElementById('fundCost').value = '';
    document.getElementById('addPreview').style.display = 'none';
}

// 计算添加基金的预览份额
function calculateAddPreview() {
    const amount = parseFloat(document.getElementById('fundAmount').value);
    const cost = parseFloat(document.getElementById('fundCost').value);

    const previewEl = document.getElementById('addPreview');
    const sharesEl = document.getElementById('previewAddShares');
    const sharesInput = document.getElementById('fundShares');

    if (isNaN(amount) || amount <= 0 || isNaN(cost) || cost <= 0) {
        previewEl.style.display = 'none';
        sharesInput.value = '';
        return;
    }

    const shares = amount / cost;
    sharesEl.textContent = `${shares.toFixed(2)} 份`;
    sharesInput.value = shares.toFixed(2);
    previewEl.style.display = 'block';
}

async function addFund() {
    const code = document.getElementById('fundCode').value.trim();
    const amount = parseFloat(document.getElementById('fundAmount').value);
    const costPrice = parseFloat(document.getElementById('fundCost').value);
    const shares = parseFloat(document.getElementById('fundShares').value);

    if (!code || code.length !== 6 || isNaN(code)) {
        alert('请输入6位数字基金代码');
        return;
    }

    if (isNaN(amount) || amount <= 0) {
        alert('请输入有效的持仓金额');
        return;
    }

    if (isNaN(costPrice) || costPrice <= 0) {
        alert('请输入有效的成本单价');
        return;
    }

    const finalShares = !isNaN(shares) && shares > 0 ? shares : (amount / costPrice);

    if (finalShares <= 0) {
        alert('持有份额计算错误');
        return;
    }

    // 检查是否已存在
    if (portfolio.funds.find(f => f.code === code)) {
        alert('该基金已存在');
        return;
    }

    // 先验证基金是否存在
    updateDataStatus('loading');
    const fundData = await fetchFundData(code);

    if (!fundData) {
        alert('基金代码无效或数据获取失败');
        updateDataStatus('error');
        return;
    }

    // 添加到持仓
    portfolio.funds.push({ code, shares: finalShares, costPrice });
    portfolio.dataCache[code] = fundData;
    saveStorage();

    hideAddModal();
    updateUI();
}

// ====================
// 一键导入功能
// ====================

function showImportModal() {
    document.getElementById('importModal').classList.add('active');
    document.getElementById('importData').focus();
}

function hideImportModal() {
    document.getElementById('importModal').classList.remove('active');
    document.getElementById('importData').value = '';
    document.getElementById('importPreview').style.display = 'none';
    document.getElementById('importResult').innerHTML = '';
    importParsedData = [];
}

// 解析导入数据
function parseImportData() {
    const text = document.getElementById('importData').value.trim();
    if (!text) {
        alert('请输入导入数据');
        return;
    }

    const lines = text.split('\n');
    const parsed = [];
    const errors = [];

    lines.forEach((line, index) => {
        line = line.trim();
        if (!line) return;

        // 支持多种格式：
        // 014143 银河创新成长混合C 1000.00 1.2345
        // 014143 银河创新成长混合C 1000 1.2345
        // 014143,银河创新成长混合C,1000.00,1.2345
        // 014143, 1000.00, 1.2345
        const parts = line.split(/[\s,]+/).filter(p => p.trim());

        let code, name, shares, costPrice;

        if (parts.length >= 4) {
            code = parts[0];
            name = parts[1];
            shares = parseFloat(parts[2]);
            costPrice = parseFloat(parts[3]);
        } else if (parts.length === 3) {
            code = parts[0];
            shares = parseFloat(parts[1]);
            costPrice = parseFloat(parts[2]);
        } else {
            errors.push(`第 ${index + 1} 行格式错误`);
            return;
        }

        // 验证数据
        if (!/^\d{6}$/.test(code)) {
            errors.push(`第 ${index + 1} 行基金代码无效: ${code}`);
            return;
        }
        if (isNaN(shares) || shares <= 0) {
            errors.push(`第 ${index + 1} 行份额无效: ${parts[2]}`);
            return;
        }
        if (isNaN(costPrice) || costPrice <= 0) {
            errors.push(`第 ${index + 1} 行成本价无效: ${parts[3]}`);
            return;
        }

        parsed.push({ code, name: name || '未知', shares, costPrice });
    });

    importParsedData = parsed;

    // 显示预览
    const previewEl = document.getElementById('importPreview');
    const resultEl = document.getElementById('importResult');

    if (parsed.length === 0) {
        resultEl.innerHTML = `<div style="color: #DC2626;">未识别到有效数据</div>` +
            errors.map(e => `<div style="color: #DC2626; font-size: 12px;">${e}</div>`).join('');
    } else {
        resultEl.innerHTML = `<div style="color: #16A34A; margin-bottom: 8px;">成功识别 ${parsed.length} 只基金</div>` +
            parsed.map(p => `<div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">
                ${p.code} ${p.name} - ${p.shares.toFixed(2)}份 @ ${p.costPrice.toFixed(4)}元
            </div>`).join('') +
            (errors.length > 0 ? `<div style="margin-top: 8px; color: #DC2626; font-size: 12px;">警告: ${errors.length} 行解析失败</div>` : '');
    }

    previewEl.style.display = 'block';
}

// 确认导入
async function confirmImport() {
    if (importParsedData.length === 0) {
        alert('请先解析数据');
        return;
    }

    // 检查重复的基金代码
    const existingCodes = new Set(portfolio.funds.map(f => f.code));
    const duplicates = importParsedData.filter(p => existingCodes.has(p.code));

    if (duplicates.length > 0) {
        const dupNames = duplicates.map(d => `${d.code} ${d.name}`).join(', ');
        if (!confirm(`以下基金已存在，将更新持仓：${dupNames}。是否继续？`)) {
            return;
        }
    }

    let successCount = 0;
    let failCount = 0;

    // 逐个验证基金代码
    updateDataStatus('loading');

    for (const item of importParsedData) {
        const fundData = await fetchFundData(item.code);

        if (fundData) {
            const existingIndex = portfolio.funds.findIndex(f => f.code === item.code);
            if (existingIndex >= 0) {
                // 更新现有基金
                portfolio.funds[existingIndex] = {
                    code: item.code,
                    shares: item.shares,
                    costPrice: item.costPrice
                };
            } else {
                // 添加新基金
                portfolio.funds.push({
                    code: item.code,
                    shares: item.shares,
                    costPrice: item.costPrice
                });
            }
            portfolio.dataCache[item.code] = fundData;
            successCount++;
        } else {
            failCount++;
        }
    }

    saveStorage();
    updateUI();
    hideImportModal();

    if (failCount > 0) {
        alert(`导入完成: ${successCount} 只成功, ${failCount} 只失败`);
    } else {
        alert(`成功导入 ${successCount} 只基金`);
    }
}

// ====================
// 新闻数据获取（含 Mock 兜底）
// ====================
async function fetchNews() {
    // 显示加载状态
    const refreshBtn = document.getElementById('newsRefreshBtn');
    if (refreshBtn) {
        refreshBtn.classList.add('spinning');
        refreshBtn.disabled = true;
    }

    try {
        // 尝试从东方财富API获取实时新闻
        const timestamp = Date.now();
        const eastmoneyUrl = `https://newsapi.eastmoney.com/kuaixun/v1/getlist?size=20&_=${timestamp}`;
        const proxyUrl = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(eastmoneyUrl);

        const response = await fetchWithTimeout(proxyUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });

        if (response.ok) {
            const text = await response.text();
            let data;

            try {
                data = JSON.parse(text);
            } catch (e) {
                const jsonMatch = text.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    data = JSON.parse(jsonMatch[0]);
                }
            }

            if (data && data.result && data.result.data && data.result.data.length > 0) {
                const parsedNews = parseEastMoneyNews(data.result.data);
                if (parsedNews.length > 0) {
                    newsData = parsedNews;
                    lastNewsUpdate = new Date().toISOString();
                    console.log('✅ 实时新闻获取成功:', newsData.length, '条');
                    renderNews();
                    if (refreshBtn) {
                        refreshBtn.classList.remove('spinning');
                        refreshBtn.disabled = false;
                    }
                    return newsData;
                }
            }
        }
    } catch (e) {
        console.log('东财API获取失败:', e.message);
    }

    // 备用：尝试新浪财经
    try {
        const sinaUrl = 'https://api.allorigins.win/raw?url=' + encodeURIComponent('https://feed.mix.sina.com.cn/api/roll/get?pageid=153&lid=2516&k=&num=20&r=' + Math.random());
        const response = await fetchWithTimeout(sinaUrl, {}, 8000);

        if (response.ok) {
            const text = await response.text();
            let data;
            try {
                data = JSON.parse(text);
            } catch (e) {
                const jsonMatch = text.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    data = JSON.parse(jsonMatch[0]);
                }
            }

            if (data && data.result && data.result.data) {
                const parsedNews = parseSinaNews(data.result.data);
                if (parsedNews.length > 0) {
                    newsData = parsedNews;
                    lastNewsUpdate = new Date().toISOString();
                    console.log('✅ 新浪新闻获取成功:', newsData.length, '条');
                    renderNews();
                    if (refreshBtn) {
                        refreshBtn.classList.remove('spinning');
                        refreshBtn.disabled = false;
                    }
                    return newsData;
                }
            }
        }
    } catch (e) {
        console.log('新浪API获取失败:', e.message);
    }

    // 如果所有API都失败，使用Mock数据兜底
    console.log('⚠️ 使用Mock新闻数据');
    if (newsData.length === 0) {
        newsData = mockNewsData.map((item, index) => ({
            ...item,
            time: getRelativeTime(index * 10)
        }));
    } else {
        newsData.sort(() => Math.random() - 0.5);
    }
    renderNews();
    if (refreshBtn) {
        refreshBtn.classList.remove('spinning');
        refreshBtn.disabled = false;
    }
    return newsData;
}

// 解析东方财富新闻数据
function parseEastMoneyNews(rawData) {
    const parsed = [];
    const now = new Date();

    for (const item of rawData.slice(0, 10)) {
        try {
            // 东财时间格式: "2024-01-15 10:30:00"
            const pubTime = item.showtime || item.systime || item.otime;
            const time = formatNewsTime(pubTime);

            // 提取标签（从title或tag）
            let tag = item.tag || '快讯';
            const title = item.title || item.simtitle || '';
            const summary = item.digest || item.summary || item.content || title;

            // 从标题提取可能的板块标签
            const tagPatterns = [
                { pattern: /半导体|芯片|集成电路/, tag: '半导体' },
                { pattern: /白酒|茅台|五粮液|泸州老窖/, tag: '白酒' },
                { pattern: /新能源|电动车|锂电|光伏/, tag: '新能源' },
                { pattern: /券商|证券|投行/, tag: '券商' },
                { pattern: /银行|保险|金融/, tag: '金融' },
                { pattern: /医药|医疗|疫苗|生物/, tag: '医药' },
                { pattern: /房地产|地产|楼市/, tag: '房地产' },
                { pattern: /美联储|加息|降息|央行/, tag: '宏观' },
                { pattern: /北向资金|南向资金|主力/, tag: '资金流向' },
                { pattern: /涨停|跌停|大盘|指数|A股/, tag: '大盘' }
            ];

            for (const tp of tagPatterns) {
                if (tp.pattern.test(title)) {
                    tag = tp.tag;
                    break;
                }
            }

            parsed.push({
                time,
                title: title.replace(/<[\s\S]*?>/g, ''), // 去除HTML标签
                tag,
                summary: summary.replace(/<[\s\S]*?>/g, '').substring(0, 200) + '...'
            });
        } catch (e) {
            console.log('解析新闻项失败:', e);
        }
    }

    return parsed;
}

// 解析新浪财经数据
function parseSinaNews(rawData) {
    const parsed = [];

    for (const item of rawData.slice(0, 10)) {
        try {
            const time = formatNewsTime(item.ctime || item.pubDate || item.time);
            const title = item.title || '';
            const summary = item.summary || item.intro || item.content || title;
            let tag = '快讯';

            // 同样提取标签
            const tagPatterns = [
                { pattern: /半导体|芯片/, tag: '半导体' },
                { pattern: /白酒|茅台/, tag: '白酒' },
                { pattern: /新能源|电动车/, tag: '新能源' },
                { pattern: /券商/, tag: '券商' },
                { pattern: /银行|保险/, tag: '金融' },
                { pattern: /医药|医疗/, tag: '医药' },
                { pattern: /房地产/, tag: '房地产' },
                { pattern: /美联储|加息/, tag: '宏观' },
                { pattern: /资金|流入/, tag: '资金流向' },
                { pattern: /涨停|大盘|A股/, tag: '大盘' }
            ];

            for (const tp of tagPatterns) {
                if (tp.pattern.test(title)) {
                    tag = tp.tag;
                    break;
                }
            }

            parsed.push({
                time,
                title: title.replace(/<[\s\S]*?>/g, ''),
                tag,
                summary: summary.replace(/<[\s\S]*?>/g, '').substring(0, 200) + '...'
            });
        } catch (e) {
            console.log('解析新浪新闻失败:', e);
        }
    }

    return parsed;
}

// 格式化新闻时间
function formatNewsTime(timeStr) {
    if (!timeStr) return formatTime(new Date());

    try {
        const date = new Date(timeStr.replace(/-/g, '/'));
        if (isNaN(date.getTime())) {
            return formatTime(new Date());
        }
        return formatTime(date);
    } catch (e) {
        return formatTime(new Date());
    }
}

// 获取相对时间（用于Mock数据）
function getRelativeTime(minutesAgo) {
    const date = new Date(Date.now() - minutesAgo * 60000);
    return formatTime(date);
}

// 统一时间格式化函数
function formatTime(date) {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

// ====================
// 自动轮询
// ====================

let pollTimer = null;
let newsPollTimer = null;

function startAutoPoll() {
    // 避免重复启动
    if (pollTimer || newsPollTimer) {
        stopAutoPoll();
    }
    
    // 立即执行一次
    updateUI();

    // 设置基金数据定时器（60秒）
    pollTimer = setInterval(() => {
        updateUI();
    }, POLL_INTERVAL);

    // 设置新闻定时器（3分钟）
    newsPollTimer = setInterval(() => {
        fetchNews();
    }, NEWS_POLL_INTERVAL);
}

function stopAutoPoll() {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
    if (newsPollTimer) {
        clearInterval(newsPollTimer);
        newsPollTimer = null;
    }
}

// 页面可见性变化时优化轮询
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        stopAutoPoll();
    } else {
        startAutoPoll();
    }
});

// 页面卸载时清理定时器
window.addEventListener('beforeunload', stopAutoPoll);

// ====================
// 初始化
// ====================

// ====================
// 深色模式切换
// ====================

function initTheme() {
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        updateThemeIcon(true);
    } else {
        document.documentElement.removeAttribute('data-theme');
        updateThemeIcon(false);
    }
}

function toggleDarkMode() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem(THEME_KEY, 'light');
        updateThemeIcon(false);
    } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem(THEME_KEY, 'dark');
        updateThemeIcon(true);
    }
    // 重新渲染图表以适应新主题
    if (selectedFundCode && portfolio.dataCache[selectedFundCode]) {
        setTimeout(() => renderChart(selectedFundCode, currentChartPeriod), 100);
    }
}

function updateThemeIcon(isDark) {
    const moonIcons = document.querySelectorAll('.moon-icon');
    const sunIcons = document.querySelectorAll('.sun-icon');
    moonIcons.forEach(icon => icon.style.display = isDark ? 'none' : 'block');
    sunIcons.forEach(icon => icon.style.display = isDark ? 'block' : 'none');
}

document.addEventListener('DOMContentLoaded', async () => {
    initStorage();
    initTheme();
    // 初始化时先加载Mock数据显示界面，然后异步获取实时新闻
    newsData = [...mockNewsData];
    renderNews();
    startAutoPoll();
    // 立即获取一次实时新闻
    await fetchNews();
});

// ====================
// 市场指数实时数据
// ====================
const MARKET_INDICES = [
    { code: 'sh000001', name: '上证指数', displayCode: '000001' },
    { code: 'sz399001', name: '深证成指', displayCode: '399001' },
    { code: 'sz399006', name: '创业板指', displayCode: '399006' },
    { code: 'sh000300', name: '沪深300', displayCode: '000300' }
];

let marketIndexData = {};

/**
 * 获取实时市场指数数据
 * 使用东方财富API (带CORS代理)
 */
async function fetchMarketIndices() {
    try {
        // 使用东方财富API获取指数数据
        // 字段: f2=最新价 f3=涨跌幅 f4=涨跌额 f5=成交量 f6=成交额 f12=代码 f13=市场 f14=名称
        //       f15=最高 f16=最低 f17=今开 f18=昨收
        const codeList = MARKET_INDICES.map(idx => {
            const market = idx.code.startsWith('sh') ? '1' : '0';
            const num = idx.code.replace(/^(sh|sz)/, '');
            return `${market}.${num}`;
        }).join(',');

        const timestamp = Date.now();
        
        // 构建多个数据源
        const dataSources = [
            {
                name: 'allorigins代理',
                url: `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&invt=2&fields=f2,f3,f4,f5,f6,f12,f13,f14,f15,f16,f17,f18&secids=${codeList}&_=${timestamp}`)}`
            },
            {
                name: 'corsproxy代理',
                url: `https://corsproxy.io/?${encodeURIComponent(`https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&invt=2&fields=f2,f3,f4,f5,f6,f12,f13,f14,f15,f16,f17,f18&secids=${codeList}&_=${timestamp}`)}`
            },
            {
                name: '直接请求',
                url: `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&invt=2&fields=f2,f3,f4,f5,f6,f12,f13,f14,f15,f16,f17,f18&secids=${codeList}&_=${timestamp}`
            }
        ];

        for (const source of dataSources) {
            try {
                console.log(`📈 尝试[${source.name}]获取市场指数...`);
                
                const response = await fetchWithTimeout(source.url, {
                    method: 'GET',
                    headers: {
                        'Accept': '*/*',
                        'Referer': 'https://quote.eastmoney.com/'
                    }
                }, 10000);

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const data = await response.json();

                if (data && data.data && data.data.diff) {
                    data.data.diff.forEach(item => {
                        const code = item.f12;
                        const market = item.f13 === 1 ? 'sh' : 'sz';
                        const fullCode = `${market}${code}`;

                        const current = parseFloat(item.f2) || 0;
                        const changePercent = parseFloat(item.f3) || 0;
                        const change = parseFloat(item.f4) || 0;
                        const high = parseFloat(item.f15) || 0;
                        const low = parseFloat(item.f16) || 0;
                        const open = parseFloat(item.f17) || 0;
                        const prevClose = parseFloat(item.f18) || 0;
                        const volume = parseInt(item.f5) || 0;
                        const amount = parseFloat(item.f6) || 0;

                        // 找到对应的指数配置
                        const indexConfig = MARKET_INDICES.find(idx => idx.code === fullCode);

                        marketIndexData[fullCode] = {
                            name: item.f14 || (indexConfig ? indexConfig.name : fullCode),
                            current: current.toFixed(2),
                            change: change.toFixed(2),
                            changePercent: changePercent.toFixed(2),
                            high: high.toFixed(2),
                            low: low.toFixed(2),
                            open: open.toFixed(2),
                            prevClose: prevClose.toFixed(2),
                            volume: (volume / 100).toFixed(0), // 转换为手
                            amount: (amount / 100000000).toFixed(2), // 转换为亿元
                            isUp: change >= 0,
                            updateTime: new Date().toISOString()
                        };
                    });

                    renderMarketIndices();
                    console.log(`✅ [${source.name}]市场指数获取成功:`, Object.keys(marketIndexData).length, '个');

                    // 显示更新时间
                    showIndexUpdateTime();

                    return marketIndexData;
                }

                throw new Error('Invalid data format');
                
            } catch (e) {
                console.warn(`❌ [${source.name}]失败: ${e.message}`);
                continue;
            }
        }

        throw new Error('所有数据源均失败');

    } catch (e) {
        console.log('⚠️ 市场指数获取失败:', e.message);
        // 如果获取失败，保持现有数据或显示静态数据
        return null;
    }
}

/**
 * 显示指数更新时间
 */
function showIndexUpdateTime() {
    const header = document.querySelector('.market-overview .section-header');
    if (!header) return;

    // 移除旧的更新时间
    const oldTime = header.querySelector('.index-update-time');
    if (oldTime) oldTime.remove();

    // 添加新的更新时间
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

    const timeEl = document.createElement('span');
    timeEl.className = 'index-update-time';
    timeEl.style.cssText = 'font-size: 12px; color: #7C3AED; margin-left: 8px; font-weight: 500;';
    timeEl.textContent = `(${timeStr})`;

    header.appendChild(timeEl);
}

/**
 * 渲染市场指数到DOM
 */
function renderMarketIndices() {
    const container = document.querySelector('.index-cards');
    if (!container) return;

    const indexCards = container.querySelectorAll('.index-card');

    MARKET_INDICES.forEach((idx, index) => {
        const data = marketIndexData[idx.code];
        const card = indexCards[index];
        if (!card || !data) return;

        // 更新数值
        const valueEl = card.querySelector('.index-value');
        const changeEl = card.querySelector('.index-change');

        if (valueEl) {
            valueEl.textContent = data.current;
            valueEl.style.color = data.isUp ? '#EF4444' : '#10B981';
        }

        if (changeEl) {
            const sign = data.isUp ? '+' : '';
            changeEl.innerHTML = `<span>${sign}${data.change}</span><span>${sign}${data.changePercent}%</span>`;
            changeEl.style.color = data.isUp ? '#EF4444' : '#10B981';
        }

        // 更新涨跌样式类
        card.classList.remove('up', 'down');
        card.classList.add(data.isUp ? 'up' : 'down');
    });
}

// 导出全局函数
globalThis.showAddModal = showAddModal;
globalThis.hideAddModal = hideAddModal;
globalThis.addFund = addFund;
globalThis.calculateAddPreview = calculateAddPreview;
globalThis.openEditModal = openEditModal;
globalThis.hideEditModal = hideEditModal;
globalThis.saveFundEdit = saveFundEdit;
globalThis.deleteCurrentFund = deleteCurrentFund;
globalThis.switchTradeType = switchTradeType;
globalThis.calculateTradePreview = calculateTradePreview;
globalThis.confirmTrade = confirmTrade;
globalThis.handleFundClick = handleFundClick;
globalThis.selectFund = selectFund;
globalThis.switchChartPeriod = switchChartPeriod;
globalThis.openNewsModal = openNewsModal;
globalThis.closeNewsModal = closeNewsModal;
globalThis.fetchNews = fetchNews;
globalThis.showImportModal = showImportModal;
globalThis.hideImportModal = hideImportModal;
globalThis.parseImportData = parseImportData;
globalThis.confirmImport = confirmImport;
globalThis.fundApp = { portfolio, updateUI, selectedFundCode, currentChartPeriod };
globalThis.toggleDarkMode = toggleDarkMode;
globalThis.initTheme = initTheme;
globalThis.fetchMarketIndices = fetchMarketIndices;
