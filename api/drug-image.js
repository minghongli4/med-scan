import fs from 'fs';
import path from 'path';

const IMG_PREFIX = 'https://mcp.fda.gov.tw/insert/shapeImg/';

// 讀取對照表（Vercel 會在 build 時打包，冷啟動時載入一次）
let lookup = null;
function getLookup() {
  if (!lookup) {
    const p = path.join(process.cwd(), 'api', 'drug_images.json');
    lookup = JSON.parse(fs.readFileSync(p, 'utf-8'));
  }
  return lookup;
}

// 與預處理時相同的正規化邏輯（務必一致）
function normalize(s) {
  if (!s) return '';
  s = String(s).trim();
  const fw = '０１２３４５６７８９';
  const hw = '0123456789';
  for (let i = 0; i < fw.length; i++) {
    s = s.split(fw[i]).join(hw[i]);
  }
  // 去除引號與各種空白
  s = s.replace(/["'\u201c\u201d\u301d\u301e\s\u3000]/g, '');
  return s;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { brandName } = req.body || {};
    if (!brandName) {
      return res.status(400).json({ error: 'Missing brandName' });
    }

    const table = getLookup();
    const key = normalize(brandName);

    // 只做精確比對：命中唯一才回傳，否則一律 null（安全紅線）
    const uuid = table[key];
    if (uuid) {
      return res.status(200).json({ found: true, imageUrl: IMG_PREFIX + uuid });
    }
    return res.status(200).json({ found: false, imageUrl: null });

  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
