export default async function handler(req, res) {
  try {
    const size = req.query.size || '20';
    
    const response = await fetch(`https://newsapi.eastmoney.com/kuaixun/v1/getlist?size=${size}&_=${Date.now()}`, {
      headers: {
        'Referer': 'https://news.eastmoney.com/',
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
    console.error('News API error:', error);
    res.status(500).json({ error: 'Failed to fetch news' });
  }
}
