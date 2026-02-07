export default async function handler(req, res) {
  const { code } = req.query;

  if (!code || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: 'Invalid fund code' });
  }

  try {
    // 获取基金分时估值数据
    const response = await fetch(`https://push2.eastmoney.com/api/qt/stock/get?secid=0.${code}&fields=f43,f44,f45,f46,f47,f48,f50,f51,f52,f57,f58,f60,f107,f108,f170&_=${Date.now()}`, {
      headers: {
        'Referer': 'https://fund.eastmoney.com/',
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
    console.error('Intraday API error:', error);
    res.status(500).json({ error: 'Failed to fetch intraday data' });
  }
}
