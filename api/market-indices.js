export default async function handler(req, res) {
  try {
    const indices = req.query.indices || '1.000001,0.399001,0.399006,1.000300';
    
    const response = await fetch(`https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&invt=2&fields=f2,f3,f4,f5,f6,f12,f13,f14,f15,f16,f17,f18&secids=${indices}&_=${Date.now()}`, {
      headers: {
        'Referer': 'https://quote.eastmoney.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache');
    res.status(200).json(data);

  } catch (error) {
    console.error('Market indices API error:', error);
    res.status(500).json({ error: 'Failed to fetch market indices' });
  }
}
