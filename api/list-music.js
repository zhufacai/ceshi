const fetch = require('node-fetch');

module.exports = async (req, res) => {
  // 允许CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const {
      GITHUB_REPO = process.env.GITHUB_REPO || '',
      MUSIC_PATH = process.env.MUSIC_PATH || '',
      BRANCH = process.env.BRANCH || 'main',
      GITHUB_TOKEN = process.env.GITHUB_TOKEN || ''
    } = req.query;

    if (!GITHUB_REPO) {
      return res.status(400).json({ error: '缺少 GitHub 仓库参数' });
    }

    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Vercel-Music-Player-API'
    };

    if (GITHUB_TOKEN) {
      headers['Authorization'] = `token ${GITHUB_TOKEN}`;
    }

    // 构建API URL - 处理MUSIC_PATH为空的情况
    let apiUrl;
    if (MUSIC_PATH && MUSIC_PATH.trim() !== '') {
      apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${MUSIC_PATH}?ref=${BRANCH}`;
    } else {
      apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents?ref=${BRANCH}`;
    }
    
    console.log(`API URL: ${apiUrl}`);
    const response = await fetch(apiUrl, { headers });

    if (!response.ok) {
      return res.status(response.status).json({
        error: `GitHub API 错误: ${response.status} ${response.statusText}`,
        url: apiUrl
      });
    }

    const contents = await response.json();

    // 分离文件夹和文件
    const folders = contents.filter(item => item.type === 'dir');
    const files = contents.filter(item => item.type === 'file');

    // 处理根目录下的音乐文件
    const path = require('path');
    const musicExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'];
    const rootMusicFiles = files.filter(file => {
      const ext = path.extname(file.name).toLowerCase();
      return musicExtensions.includes(ext);
    });

    const albums = [];

    // 添加根目录专辑
    if (rootMusicFiles.length > 0) {
      const rootAlbum = {
        name: '根目录',
        path: MUSIC_PATH || '',
        tracks: rootMusicFiles.map(file => {
          const rawUrl = `https://raw.githubusercontent.com/${GITHUB_REPO}/${BRANCH}/${MUSIC_PATH || ''}${MUSIC_PATH ? '/' : ''}${encodeURIComponent(file.name)}`;
          
          return {
            name: file.name,
            url: rawUrl,
            lrcUrl: rawUrl.replace(path.extname(file.name), '.lrc'),
            size: file.size,
            type: getContentType(path.extname(file.name)),
            displayName: path.basename(file.name, path.extname(file.name)).replace(/_/g, ' '),
            fileName: path.basename(file.name, path.extname(file.name)),
            id: Math.random().toString(36).substr(2, 9)
          };
        })
      };
      albums.push(rootAlbum);
    }

    res.status(200).json({
      success: true,
      albums: albums,
      count: albums.reduce((sum, album) => sum + album.tracks.length, 0),
      repo: GITHUB_REPO,
      path: MUSIC_PATH || '根目录',
      branch: BRANCH,
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    console.error('API 错误:', error);
    res.status(500).json({
      error: '服务器内部错误',
      message: error.message
    });
  }
};

function getContentType(ext) {
  const types = {
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.m4a': 'audio/mp4',
    '.flac': 'audio/flac',
    '.aac': 'audio/aac'
  };
  
  return types[ext.toLowerCase()] || 'audio/mpeg';
}
