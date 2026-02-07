export default async function handler(req, res) {
  const { code } = req.query;

  if (!code || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: 'Invalid fund code' });
  }

  try {
    // 获取基金历史数据
    const response = await fetch(`https://fund.eastmoney.com/pingzhongdata/${code}.js?v=${Date.now()}`, {
      headers: {
        'Referer': 'https://fund.eastmoney.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const text = await response.text();
    
    // 解析净值数据
    let netWorthMatch = text.match(/Data_netWorthTrend\s*=\s*(\[[\s\S]*?\]);/);
    if (!netWorthMatch) {
      netWorthMatch = text.match(/Data_netWorthTrend\s*=\s*(\[[\s\S]*?\])/);
    }

    if (!netWorthMatch) {
      return res.status(404).json({ error: 'Data not found' });
    }

    const netWorthData = JSON.parse(netWorthMatch[1]);
    
    // 处理数据
    const historyData = netWorthData
      .filter(item => item.y !== null && item.y !== undefined && !isNaN(item.y))
      .slice(-60)
      .map((item, index, arr) => {
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

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache');
    res.status(200).json({ data: historyData });

  } catch (error) {
    console.error('Fund history API error:', error);
    res.status(500).json({ error: 'Failed to fetch fund history' });
  }
}
