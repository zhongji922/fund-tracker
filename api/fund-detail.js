export default async function handler(req, res) {
  const { code } = req.query;

  if (!code || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: 'Invalid fund code' });
  }

  try {
    // 获取基金详细数据（包含板块/行业信息）
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

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.status(200).send(text);

  } catch (error) {
    console.error('Fund detail API error:', error);
    res.status(500).json({ error: 'Failed to fetch fund detail' });
  }
}
