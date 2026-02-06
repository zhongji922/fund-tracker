export default async function handler(req, res) {
  const { code } = req.query;

  if (!code || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: 'Invalid fund code' });
  }

  try {
    const response = await fetch(`https://fundgz.1234567.com.cn/js/${code}.js?_=${Date.now()}`, {
      headers: {
        'Referer': 'https://fund.eastmoney.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const text = await response.text();
    const match = text.match(/jsonpgz\(({.+})\)/);

    if (!match) {
      return res.status(404).json({ error: 'Fund not found' });
    }

    const data = JSON.parse(match[1]);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache');
    res.status(200).json({
      code: data.fundcode,
      name: data.name,
      nav: parseFloat(data.dwjz || 0),
      estimate: parseFloat(data.gsz || 0),
      changePercent: parseFloat(data.gszzl || 0),
      updateTime: data.gztime
    });

  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: 'Failed to fetch fund data' });
  }
}
