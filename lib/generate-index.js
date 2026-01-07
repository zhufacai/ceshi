const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

// 配置参数 - 通过环境变量设置
const GITHUB_REPO = process.env.GITHUB_REPO || 'username/repo'; // 格式: owner/repo
const MUSIC_PATH = process.env.MUSIC_PATH || ''; // 仓库中的音乐文件夹路径，空字符串表示根目录
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || ''; // GitHub token (可选，用于提高API限制)
const BRANCH = process.env.BRANCH || 'main';

async function fetchMusicFiles() {
  try {
    console.log('正在获取音乐文件列表...');
    console.log(`仓库: ${GITHUB_REPO}`);
    console.log(`路径: ${MUSIC_PATH || '根目录'}`);
    console.log(`分支: ${BRANCH}`);
    
    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Vercel-Music-Player'
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
      throw new Error(`GitHub API 错误: ${response.status} ${response.statusText}`);
    }
    
    const contents = await response.json();
    
    // 分离文件夹和文件
    const folders = contents.filter(item => item.type === 'dir');
    const files = contents.filter(item => item.type === 'file');
    
    console.log(`找到 ${folders.length} 个文件夹，${files.length} 个文件`);
    
    // 获取所有专辑（文件夹）中的音乐
    const albums = [];
    
    // 处理根目录下的音乐文件
    const rootMusicFiles = files.filter(file => {
      const ext = path.extname(file.name).toLowerCase();
      return ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'].includes(ext);
    });
    
    if (rootMusicFiles.length > 0) {
      const rootAlbum = {
        name: '根目录',
        path: MUSIC_PATH || '',
        cover: null,
        tracks: await processMusicFiles(rootMusicFiles, MUSIC_PATH || '')
      };
      albums.push(rootAlbum);
      console.log(`根目录中找到 ${rootAlbum.tracks.length} 首歌曲`);
    }
    
    // 处理每个文件夹（专辑）
    for (const folder of folders) {
      try {
        const folderApiUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${folder.path}?ref=${BRANCH}`;
        const folderResponse = await fetch(folderApiUrl, { headers });
        
        if (folderResponse.ok) {
          const folderContents = await folderResponse.json();
          const folderFiles = folderContents.filter(item => item.type === 'file');
          
          // 查找专辑封面和音乐文件
          const coverFile = folderFiles.find(file => 
            ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(path.extname(file.name).toLowerCase())
          );
          
          const musicFiles = folderFiles.filter(file => {
            const ext = path.extname(file.name).toLowerCase();
            return ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'].includes(ext);
          });
          
          if (musicFiles.length > 0) {
            const album = {
              name: folder.name,
              path: folder.path,
              cover: coverFile ? `https://raw.githubusercontent.com/${GITHUB_REPO}/${BRANCH}/${folder.path}/${encodeURIComponent(coverFile.name)}` : null,
              tracks: await processMusicFiles(musicFiles, folder.path)
            };
            albums.push(album);
            
            console.log(`专辑 "${folder.name}" 中找到 ${musicFiles.length} 首歌曲`);
          }
        }
      } catch (error) {
        console.error(`获取文件夹 ${folder.name} 内容时出错:`, error.message);
      }
    }
    
    console.log(`总共生成 ${albums.length} 个专辑，${albums.reduce((sum, album) => sum + album.tracks.length, 0)} 首歌曲`);
    
    // 将音乐列表写入public目录
    const publicDir = path.join(__dirname, '../public');
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    
    // 生成音乐列表JSON文件
    fs.writeFileSync(
      path.join(publicDir, 'music-data.json'),
      JSON.stringify({
        albums: albums,
        totalSongs: albums.reduce((sum, album) => sum + album.tracks.length, 0),
        totalAlbums: albums.length,
        lastUpdated: new Date().toISOString(),
        repo: GITHUB_REPO,
        path: MUSIC_PATH || '根目录'
      }, null, 2)
    );
    
    console.log('音乐列表已生成:', albums.length, '个专辑');
    
    // 如果index.html不存在，创建默认的
    const indexPath = path.join(publicDir, 'index.html');
    if (!fs.existsSync(indexPath)) {
      createModernIndexHtml(indexPath, albums);
      console.log('已创建现代风格的 index.html');
    }
    
  } catch (error) {
    console.error('获取音乐文件时出错:', error);
    console.error('错误详情:', error.message);
    
    // 创建空列表作为后备
    const publicDir = path.join(__dirname, '../public');
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    
    fs.writeFileSync(
      path.join(publicDir, 'music-data.json'),
      JSON.stringify({
        albums: [],
        totalSongs: 0,
        totalAlbums: 0,
        lastUpdated: new Date().toISOString(),
        repo: GITHUB_REPO,
        path: MUSIC_PATH || '根目录',
        error: error.message
      }, null, 2)
    );
    
    const indexPath = path.join(publicDir, 'index.html');
    createModernIndexHtml(indexPath, []);
    console.log('已创建默认 index.html（无音乐文件）');
  }
}

async function processMusicFiles(files, folderPath) {
  const musicExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'];
  const musicFiles = files.filter(file => {
    const ext = path.extname(file.name).toLowerCase();
    return musicExtensions.includes(ext);
  });
  
  return musicFiles.map(file => {
    const rawUrl = `https://raw.githubusercontent.com/${GITHUB_REPO}/${BRANCH}/${folderPath}/${encodeURIComponent(file.name)}`;
    const fileNameWithoutExt = path.basename(file.name, path.extname(file.name));
    
    return {
      name: file.name,
      url: rawUrl,
      lrcUrl: rawUrl.replace(path.extname(file.name), '.lrc'),
      size: file.size,
      type: getContentType(path.extname(file.name)),
      displayName: fileNameWithoutExt.replace(/_/g, ' ').replace(/-/g, ' '),
      fileName: fileNameWithoutExt,
      id: Math.random().toString(36).substr(2, 9)
    };
  });
}

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

// 保持原有的 createModernIndexHtml 函数不变...

function createModernIndexHtml(filePath, albums) {
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>GitHub 音乐播放器 | 专辑分类 & 歌词支持</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary: #1DB954;
            --primary-dark: #1AA34A;
            --secondary: #535353;
            --bg-primary: #121212;
            --bg-secondary: #181818;
            --bg-tertiary: #282828;
            --text-primary: #FFFFFF;
            --text-secondary: #B3B3B3;
            --text-tertiary: #7A7A7A;
            --card-bg: #1E1E1E;
            --shadow: 0 8px 30px rgba(0, 0, 0, 0.3);
            --transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            --border-radius: 12px;
            --border-radius-sm: 8px;
            --border-radius-lg: 16px;
            --modal-bg: rgba(0, 0, 0, 0.9);
        }
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background-color: var(--bg-primary);
            color: var(--text-primary);
            min-height: 100vh;
            overflow-x: hidden;
            padding-bottom: 120px; /* 为播放器留出空间 */
        }
        
        /* 移动端顶部导航栏 */
        .mobile-header {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            background: rgba(18, 18, 18, 0.95);
            backdrop-filter: blur(20px);
            padding: 16px;
            z-index: 1000;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
        
        .mobile-nav {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .mobile-logo {
            display: flex;
            align-items: center;
            gap: 12px;
            font-size: 20px;
            font-weight: 600;
        }
        
        .mobile-logo-icon {
            background: var(--primary);
            width: 32px;
            height: 32px;
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .mobile-menu-btn {
            background: none;
            border: none;
            color: var(--text-primary);
            font-size: 24px;
            cursor: pointer;
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: var(--border-radius-sm);
            transition: var(--transition);
        }
        
        .mobile-menu-btn:hover {
            background: rgba(255, 255, 255, 0.05);
        }
        
        /* 移动端下拉菜单 */
        .mobile-dropdown {
            position: fixed;
            top: 73px;
            left: 0;
            right: 0;
            background: var(--bg-secondary);
            backdrop-filter: blur(20px);
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            z-index: 999;
            transform: translateY(-100%);
            opacity: 0;
            transition: var(--transition);
            max-height: 70vh;
            overflow-y: auto;
        }
        
        .mobile-dropdown.active {
            transform: translateY(0);
            opacity: 1;
        }
        
        .mobile-dropdown-section {
            padding: 20px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
        
        .mobile-dropdown-title {
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: var(--text-tertiary);
            margin-bottom: 16px;
            font-weight: 600;
        }
        
        .mobile-dropdown-item {
            display: flex;
            align-items: center;
            gap: 16px;
            padding: 12px 16px;
            border-radius: var(--border-radius-sm);
            color: var(--text-secondary);
            text-decoration: none;
            transition: var(--transition);
            margin-bottom: 4px;
            cursor: pointer;
        }
        
        .mobile-dropdown-item:hover,
        .mobile-dropdown-item.active {
            background: rgba(255, 255, 255, 0.05);
            color: var(--text-primary);
        }
        
        .mobile-dropdown-item i {
            font-size: 20px;
            width: 24px;
        }
        
        /* 加载动画 */
        .loading-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: var(--bg-primary);
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            z-index: 2000;
            transition: opacity 0.5s ease;
        }
        
        .loading-spinner {
            width: 50px;
            height: 50px;
            border: 3px solid var(--secondary);
            border-top-color: var(--primary);
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-bottom: 20px;
        }
        
        .loading-text {
            font-size: 16px;
            color: var(--text-secondary);
            font-weight: 500;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        /* 主容器 */
        .app-container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 24px;
        }
        
        /* 桌面端侧边栏和主内容区 */
        .desktop-layout {
            display: flex;
            gap: 24px;
        }
        
        /* 侧边栏 */
        .sidebar {
            width: 280px;
            background: var(--bg-secondary);
            border-radius: var(--border-radius-lg);
            padding: 24px;
            display: flex;
            flex-direction: column;
            position: sticky;
            top: 24px;
            height: fit-content;
        }
        
        .logo {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 32px;
            font-size: 24px;
            font-weight: 700;
            color: var(--text-primary);
        }
        
        .logo-icon {
            background: var(--primary);
            width: 40px;
            height: 40px;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .nav-section {
            margin-bottom: 32px;
        }
        
        .nav-title {
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: var(--text-tertiary);
            margin-bottom: 16px;
            font-weight: 600;
        }
        
        .nav-item {
            display: flex;
            align-items: center;
            gap: 16px;
            padding: 12px 16px;
            border-radius: var(--border-radius-sm);
            color: var(--text-secondary);
            text-decoration: none;
            transition: var(--transition);
            margin-bottom: 4px;
            cursor: pointer;
        }
        
        .nav-item:hover {
            background: rgba(255, 255, 255, 0.05);
            color: var(--text-primary);
        }
        
        .nav-item.active {
            background: rgba(255, 255, 255, 0.1);
            color: var(--text-primary);
        }
        
        .nav-item i {
            font-size: 20px;
            width: 24px;
        }
        
        .album-list {
            flex-grow: 1;
            overflow-y: auto;
            max-height: 400px;
        }
        
        .album-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 10px 16px;
            border-radius: var(--border-radius-sm);
            color: var(--text-secondary);
            transition: var(--transition);
            cursor: pointer;
            margin-bottom: 4px;
        }
        
        .album-item:hover {
            background: rgba(255, 255, 255, 0.05);
            color: var(--text-primary);
        }
        
        .album-item.active {
            background: rgba(29, 185, 84, 0.1);
            color: var(--primary);
        }
        
        .album-cover {
            width: 40px;
            height: 40px;
            border-radius: 6px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            overflow: hidden;
        }
        
        .album-cover img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        
        .album-info {
            flex-grow: 1;
            overflow: hidden;
        }
        
        .album-name {
            font-size: 14px;
            font-weight: 500;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        
        .album-count {
            font-size: 12px;
            color: var(--text-tertiary);
        }
        
        /* 主内容区 */
        .main-content {
            flex-grow: 1;
            min-width: 0; /* 防止flex元素溢出 */
        }
        
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 32px;
        }
        
        .page-title {
            font-size: 32px;
            font-weight: 700;
            background: linear-gradient(45deg, var(--primary), #1ED760);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        
        .repo-info {
            background: var(--card-bg);
            padding: 12px 20px;
            border-radius: var(--border-radius);
            font-size: 14px;
            color: var(--text-secondary);
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .repo-info i {
            color: var(--primary);
        }
        
        /* 专辑卡片网格 */
        .albums-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 40px;
        }
        
        .album-card {
            background: var(--card-bg);
            border-radius: var(--border-radius);
            padding: 20px;
            transition: var(--transition);
            cursor: pointer;
            position: relative;
            overflow: hidden;
        }
        
        .album-card:hover {
            background: var(--bg-tertiary);
            transform: translateY(-4px);
            box-shadow: var(--shadow);
        }
        
        .album-card-cover {
            width: 100%;
            aspect-ratio: 1;
            border-radius: 8px;
            margin-bottom: 16px;
            overflow: hidden;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            position: relative;
        }
        
        .album-card-cover img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        
        .album-card-play {
            position: absolute;
            bottom: 8px;
            right: 8px;
            width: 40px;
            height: 40px;
            background: var(--primary);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            transform: translateY(10px);
            transition: var(--transition);
        }
        
        .album-card:hover .album-card-play {
            opacity: 1;
            transform: translateY(0);
        }
        
        .album-card-info {
            flex-grow: 1;
        }
        
        .album-card-name {
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 4px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        
        .album-card-count {
            font-size: 14px;
            color: var(--text-secondary);
        }
        
        /* 音乐列表 */
        .music-list-container {
            background: var(--card-bg);
            border-radius: var(--border-radius);
            overflow: hidden;
            margin-bottom: 40px;
        }
        
        .music-list-header {
            display: flex;
            align-items: center;
            padding: 20px 24px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            background: rgba(0, 0, 0, 0.2);
        }
        
        .music-list-title {
            font-size: 18px;
            font-weight: 600;
            color: var(--text-primary);
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .music-list-count {
            font-size: 14px;
            color: var(--text-secondary);
            background: rgba(255, 255, 255, 0.05);
            padding: 2px 8px;
            border-radius: 10px;
        }
        
        .music-list {
            max-height: 500px;
            overflow-y: auto;
        }
        
        .music-item {
            display: flex;
            align-items: center;
            padding: 16px 24px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            transition: var(--transition);
            cursor: pointer;
        }
        
        .music-item:hover {
            background: rgba(255, 255, 255, 0.03);
        }
        
        .music-item.playing {
            background: rgba(29, 185, 84, 0.1);
            border-left: 4px solid var(--primary);
        }
        
        .music-item-index {
            width: 40px;
            font-size: 16px;
            color: var(--text-secondary);
            text-align: center;
            font-weight: 500;
        }
        
        .music-item-info {
            flex-grow: 1;
            display: flex;
            flex-direction: column;
            gap: 4px;
            overflow: hidden;
        }
        
        .music-item-title {
            font-size: 16px;
            font-weight: 500;
            color: var(--text-primary);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        
        .music-item-album {
            font-size: 14px;
            color: var(--text-secondary);
        }
        
        .music-item-duration {
            width: 80px;
            text-align: right;
            font-size: 14px;
            color: var(--text-secondary);
        }
        
        .music-item-lyrics {
            width: 60px;
            text-align: center;
        }
        
        .lyrics-btn {
            background: none;
            border: none;
            color: var(--text-secondary);
            font-size: 16px;
            cursor: pointer;
            padding: 8px;
            border-radius: 50%;
            transition: var(--transition);
        }
        
        .lyrics-btn:hover {
            background: rgba(255, 255, 255, 0.05);
            color: var(--primary);
        }
        
        /* 播放器 */
        .player-container {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            background: rgba(0, 0, 0, 0.95);
            backdrop-filter: blur(20px);
            border-top: 1px solid rgba(255, 255, 255, 0.05);
            padding: 16px 24px;
            z-index: 100;
            display: flex;
            align-items: center;
            gap: 24px;
        }
        
        .player-now-playing {
            display: flex;
            align-items: center;
            gap: 16px;
            min-width: 300px;
        }
        
        .player-cover {
            width: 56px;
            height: 56px;
            border-radius: 8px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            overflow: hidden;
            cursor: pointer;
            transition: var(--transition);
        }
        
        .player-cover:hover {
            transform: scale(1.05);
        }
        
        .player-cover img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        
        .player-track-info {
            flex-grow: 1;
            overflow: hidden;
        }
        
        .player-track-title {
            font-size: 14px;
            font-weight: 600;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        
        .player-track-album {
            font-size: 12px;
            color: var(--text-secondary);
        }
        
        .player-controls {
            flex-grow: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            max-width: 600px;
        }
        
        .control-buttons {
            display: flex;
            align-items: center;
            gap: 24px;
            margin-bottom: 12px;
        }
        
        .control-btn {
            background: none;
            border: none;
            color: var(--text-secondary);
            font-size: 20px;
            cursor: pointer;
            transition: var(--transition);
            display: flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
        }
        
        .control-btn:hover {
            color: var(--text-primary);
            transform: scale(1.1);
        }
        
        .control-btn.play-pause {
            width: 40px;
            height: 40px;
            background: var(--text-primary);
            color: #000;
            border-radius: 50%;
        }
        
        .control-btn.play-pause:hover {
            transform: scale(1.05);
        }
        
        .player-progress {
            width: 100%;
            display: flex;
            align-items: center;
            gap: 12px;
        }
        
        .progress-time {
            font-size: 12px;
            color: var(--text-secondary);
            min-width: 40px;
        }
        
        .progress-bar {
            flex-grow: 1;
            height: 4px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 2px;
            overflow: hidden;
            cursor: pointer;
            position: relative;
        }
        
        .progress-fill {
            position: absolute;
            top: 0;
            left: 0;
            height: 100%;
            background: var(--primary);
            width: 0%;
            transition: width 0.1s linear;
        }
        
        .progress-handle {
            position: absolute;
            top: 50%;
            width: 12px;
            height: 12px;
            background: var(--text-primary);
            border-radius: 50%;
            transform: translate(-50%, -50%);
            opacity: 0;
            transition: opacity 0.2s ease;
        }
        
        .progress-bar:hover .progress-handle {
            opacity: 1;
        }
        
        .player-extra {
            display: flex;
            align-items: center;
            gap: 16px;
            min-width: 200px;
            justify-content: flex-end;
        }
        
        .volume-control {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .volume-slider {
            width: 80px;
            height: 4px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 2px;
            overflow: hidden;
            position: relative;
            cursor: pointer;
        }
        
        .volume-fill {
            position: absolute;
            top: 0;
            left: 0;
            height: 100%;
            background: var(--text-secondary);
            width: 70%;
        }
        
        /* 播放页面模态框 */
        .player-modal {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: var(--modal-bg);
            backdrop-filter: blur(20px);
            z-index: 2000;
            display: flex;
            flex-direction: column;
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.3s ease, visibility 0.3s ease;
        }
        
        .player-modal.active {
            opacity: 1;
            visibility: visible;
        }
        
        .player-modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 24px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .player-modal-title {
            font-size: 20px;
            font-weight: 600;
        }
        
        .player-modal-close {
            background: none;
            border: none;
            color: var(--text-secondary);
            font-size: 24px;
            cursor: pointer;
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            transition: var(--transition);
        }
        
        .player-modal-close:hover {
            background: rgba(255, 255, 255, 0.1);
            color: var(--text-primary);
        }
        
        .player-modal-content {
            flex-grow: 1;
            display: flex;
            overflow: hidden;
        }
        
        .player-modal-left {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 40px;
        }
        
        .player-modal-cover {
            width: 300px;
            height: 300px;
            border-radius: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            margin-bottom: 40px;
            overflow: hidden;
            box-shadow: var(--shadow);
        }
        
        .player-modal-cover img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        
        .player-modal-track-info {
            text-align: center;
            margin-bottom: 40px;
        }
        
        .player-modal-track-title {
            font-size: 32px;
            font-weight: 700;
            margin-bottom: 8px;
        }
        
        .player-modal-track-album {
            font-size: 18px;
            color: var(--text-secondary);
        }
        
        .player-modal-progress {
            width: 100%;
            max-width: 400px;
        }
        
        .player-modal-right {
            flex: 1;
            display: flex;
            flex-direction: column;
            padding: 40px;
            border-left: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .lyrics-container {
            flex-grow: 1;
            overflow-y: auto;
            padding: 20px;
            border-radius: var(--border-radius);
            background: rgba(255, 255, 255, 0.03);
        }
        
        .lyrics-content {
            font-size: 18px;
            line-height: 2;
            color: var(--text-secondary);
            text-align: center;
            transition: var(--transition);
        }
        
        .lyrics-line {
            margin-bottom: 16px;
            transition: var(--transition);
        }
        
        .lyrics-line.active {
            color: var(--primary);
            font-size: 22px;
            font-weight: 600;
        }
        
        .no-lyrics {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: var(--text-tertiary);
            text-align: center;
        }
        
        .no-lyrics i {
            font-size: 48px;
            margin-bottom: 20px;
        }
        
        /* 空状态 */
        .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 80px 20px;
            text-align: center;
        }
        
        .empty-state-icon {
            font-size: 64px;
            color: var(--text-tertiary);
            margin-bottom: 24px;
        }
        
        .empty-state-title {
            font-size: 20px;
            font-weight: 600;
            margin-bottom: 12px;
            color: var(--text-primary);
        }
        
        .empty-state-description {
            font-size: 14px;
            color: var(--text-secondary);
            max-width: 400px;
            margin-bottom: 24px;
        }
        
        /* 动画 */
        @keyframes fadeIn {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        
        .fade-in {
            animation: fadeIn 0.5s ease forwards;
        }
        
        .hidden {
            display: none !important;
        }
        
        /* 响应式设计 */
        @media (max-width: 1024px) {
            .sidebar {
                width: 240px;
            }
            
            .albums-grid {
                grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
            }
            
            .player-modal-content {
                flex-direction: column;
            }
            
            .player-modal-right {
                border-left: none;
                border-top: 1px solid rgba(255, 255, 255, 0.1);
            }
            
            .player-modal-left {
                padding: 20px;
            }
            
            .player-modal-cover {
                width: 200px;
                height: 200px;
            }
        }
        
        @media (max-width: 768px) {
            /* 显示移动端导航，隐藏桌面端布局 */
            .mobile-header {
                display: block;
            }
            
            .desktop-layout {
                display: none;
            }
            
            .app-container {
                padding: 16px;
                padding-top: 80px; /* 为移动端头部留出空间 */
            }
            
            .player-container {
                padding: 12px 16px;
                flex-wrap: wrap;
            }
            
            .player-now-playing {
                min-width: auto;
                flex-grow: 1;
            }
            
            .player-controls {
                order: 3;
                width: 100%;
                margin-top: 12px;
            }
            
            .player-extra {
                min-width: auto;
            }
            
            .header {
                flex-direction: column;
                align-items: flex-start;
                gap: 16px;
            }
            
            .page-title {
                font-size: 24px;
            }
            
            .music-item-size {
                display: none;
            }
            
            .music-item-duration {
                width: 60px;
            }
            
            .albums-grid {
                grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
                gap: 12px;
            }
            
            .player-modal-left {
                padding: 20px;
            }
            
            .player-modal-cover {
                width: 150px;
                height: 150px;
                margin-bottom: 20px;
            }
            
            .player-modal-track-title {
                font-size: 24px;
            }
            
            .player-modal-track-album {
                font-size: 16px;
            }
            
            .lyrics-content {
                font-size: 16px;
            }
            
            .lyrics-line.active {
                font-size: 18px;
            }
        }
        
        @media (min-width: 769px) {
            .desktop-layout {
                display: flex;
            }
            
            .mobile-header {
                display: none;
            }
        }
        
        @media (max-width: 480px) {
            .music-item-index {
                display: none;
            }
            
            .music-item-duration {
                display: none;
            }
            
            .music-item-lyrics {
                width: 40px;
            }
            
            .album-card {
                padding: 12px;
            }
            
            .album-card-name {
                font-size: 14px;
            }
            
            .album-card-count {
                font-size: 12px;
            }
        }
        
        /* 列表滚动条 */
        .music-list::-webkit-scrollbar,
        .album-list::-webkit-scrollbar,
        .lyrics-container::-webkit-scrollbar,
        .mobile-dropdown::-webkit-scrollbar {
            width: 8px;
        }
        
        .music-list::-webkit-scrollbar-track,
        .album-list::-webkit-scrollbar-track,
        .lyrics-container::-webkit-scrollbar-track,
        .mobile-dropdown::-webkit-scrollbar-track {
            background: rgba(255, 255, 255, 0.05);
            border-radius: 4px;
        }
        
        .music-list::-webkit-scrollbar-thumb,
        .album-list::-webkit-scrollbar-thumb,
        .lyrics-container::-webkit-scrollbar-thumb,
        .mobile-dropdown::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.1);
            border-radius: 4px;
        }
        
        .music-list::-webkit-scrollbar-thumb:hover,
        .album-list::-webkit-scrollbar-thumb:hover,
        .lyrics-container::-webkit-scrollbar-thumb:hover,
        .mobile-dropdown::-webkit-scrollbar-thumb:hover {
            background: rgba(255, 255, 255, 0.2);
        }
    </style>
</head>
<body>
    <!-- 加载动画 -->
    <div class="loading-overlay" id="loading-overlay">
        <div class="loading-spinner"></div>
        <div class="loading-text">加载音乐库...</div>
    </div>
    
    <!-- 移动端顶部导航栏 -->
    <div class="mobile-header" id="mobile-header">
        <div class="mobile-nav">
            <div class="mobile-logo">
                <div class="mobile-logo-icon">
                    <i class="fas fa-music"></i>
                </div>
                <span>GitHub Music</span>
            </div>
            <button class="mobile-menu-btn" id="mobile-menu-btn">
                <i class="fas fa-bars"></i>
            </button>
        </div>
        
        <!-- 移动端下拉菜单 -->
        <div class="mobile-dropdown" id="mobile-dropdown">
            <div class="mobile-dropdown-section">
                <div class="mobile-dropdown-title">导航</div>
                <div class="mobile-dropdown-item active" data-page="albums">
                    <i class="fas fa-compact-disc"></i>
                    <span>专辑</span>
                </div>
                <div class="mobile-dropdown-item" data-page="library">
                    <i class="fas fa-music"></i>
                    <span>所有歌曲</span>
                </div>
                <div class="mobile-dropdown-item" data-page="playlists">
                    <i class="fas fa-list"></i>
                    <span>播放列表</span>
                </div>
            </div>
            
            <div class="mobile-dropdown-section">
                <div class="mobile-dropdown-title">发现</div>
                <div class="mobile-dropdown-item" data-page="popular">
                    <i class="fas fa-fire"></i>
                    <span>热门歌曲</span>
                </div>
                <div class="mobile-dropdown-item" data-page="random">
                    <i class="fas fa-random"></i>
                    <span>随机播放</span>
                </div>
            </div>
            
            <div class="mobile-dropdown-section">
                <div class="mobile-dropdown-title">专辑</div>
                <div id="mobile-albums-list">
                    <!-- 动态生成专辑列表 -->
                </div>
            </div>
            
            <div class="mobile-dropdown-section">
                <div class="repo-info">
                    <i class="fab fa-github"></i>
                    <span id="mobile-repo-display">${GITHUB_REPO || '未配置仓库'}</span>
                </div>
            </div>
        </div>
    </div>
    
    <!-- 主应用容器 -->
    <div class="app-container hidden" id="app-container">
        <!-- 桌面端布局 -->
        <div class="desktop-layout">
            <!-- 侧边栏 -->
            <div class="sidebar">
                <div class="logo">
                    <div class="logo-icon">
                        <i class="fas fa-music"></i>
                    </div>
                    <span>GitHub Music</span>
                </div>
                
                <div class="nav-section">
                    <div class="nav-title">导航</div>
                    <div class="nav-item active" id="nav-albums" data-page="albums">
                        <i class="fas fa-compact-disc"></i>
                        <span>专辑</span>
                    </div>
                    <div class="nav-item" id="nav-library" data-page="library">
                        <i class="fas fa-music"></i>
                        <span>所有歌曲</span>
                    </div>
                    <div class="nav-item" id="nav-playlists" data-page="playlists">
                        <i class="fas fa-list"></i>
                        <span>播放列表</span>
                    </div>
                </div>
                
                <div class="nav-section">
                    <div class="nav-title">发现</div>
                    <div class="nav-item" id="nav-popular" data-page="popular">
                        <i class="fas fa-fire"></i>
                        <span>热门歌曲</span>
                    </div>
                    <div class="nav-item" id="nav-random" data-page="random">
                        <i class="fas fa-random"></i>
                        <span>随机播放</span>
                    </div>
                </div>
                
                <div class="nav-section">
                    <div class="nav-title">专辑</div>
                    <div class="album-list" id="desktop-albums-list">
                        <!-- 动态生成专辑列表 -->
                    </div>
                </div>
                
                <div class="repo-info">
                    <i class="fab fa-github"></i>
                    <span id="repo-display">${GITHUB_REPO || '未配置仓库'}</span>
                </div>
            </div>
            
            <!-- 主内容区 -->
            <div class="main-content">
                <!-- 头部 -->
                <div class="header">
                    <h1 class="page-title" id="page-title">专辑</h1>
                    <div class="repo-info">
                        <i class="fas fa-folder"></i>
                        <span id="music-path">${MUSIC_PATH || '根目录'}</span>
                    </div>
                </div>
                
                <!-- 专辑视图 -->
                <div class="albums-grid fade-in" id="albums-grid">
                    <div class="empty-state">
                        <div class="empty-state-icon">
                            <i class="fas fa-compact-disc"></i>
                        </div>
                        <h3 class="empty-state-title">正在加载专辑...</h3>
                        <p class="empty-state-description">请稍候，我们正在从 GitHub 仓库获取您的音乐专辑。</p>
                    </div>
                </div>
                
                <!-- 音乐列表视图 -->
                <div class="music-list-container fade-in hidden" id="music-list-container">
                    <div class="music-list-header">
                        <div class="music-list-title">
                            <i class="fas fa-music"></i>
                            <span id="list-title">所有歌曲</span>
                            <span class="music-list-count" id="list-count">0</span>
                        </div>
                    </div>
                    <div class="music-list" id="music-list">
                        <!-- 动态生成音乐列表 -->
                    </div>
                </div>
            </div>
        </div>
    </div>
    
    <!-- 播放器控件 -->
    <div class="player-container hidden" id="player-container">
        <div class="player-now-playing">
            <div class="player-cover" id="player-cover">
                <i class="fas fa-music"></i>
            </div>
            <div class="player-track-info">
                <div class="player-track-title" id="player-track-title">选择一首歌曲开始播放</div>
                <div class="player-track-album" id="player-track-album">GitHub Music</div>
            </div>
        </div>
        
        <div class="player-controls">
            <div class="control-buttons">
                <button class="control-btn" id="shuffle-btn" title="随机播放">
                    <i class="fas fa-random"></i>
                </button>
                <button class="control-btn" id="prev-btn" title="上一首">
                    <i class="fas fa-step-backward"></i>
                </button>
                <button class="control-btn play-pause" id="play-btn" title="播放">
                    <i class="fas fa-play" id="play-icon"></i>
                </button>
                <button class="control-btn" id="next-btn" title="下一首">
                    <i class="fas fa-step-forward"></i>
                </button>
                <button class="control-btn" id="repeat-btn" title="重复播放">
                    <i class="fas fa-redo"></i>
                </button>
            </div>
            
            <div class="player-progress">
                <span class="progress-time" id="current-time">0:00</span>
                <div class="progress-bar" id="progress-bar">
                    <div class="progress-fill" id="progress-fill"></div>
                    <div class="progress-handle" id="progress-handle"></div>
                </div>
                <span class="progress-time" id="duration">0:00</span>
            </div>
        </div>
        
        <div class="player-extra">
            <div class="volume-control">
                <button class="control-btn" id="volume-btn" title="静音">
                    <i class="fas fa-volume-up" id="volume-icon"></i>
                </button>
                <div class="volume-slider" id="volume-slider">
                    <div class="volume-fill" id="volume-fill"></div>
                </div>
            </div>
        </div>
    </div>
    
    <!-- 播放页面模态框 -->
    <div class="player-modal" id="player-modal">
        <div class="player-modal-header">
            <div class="player-modal-title">正在播放</div>
            <button class="player-modal-close" id="player-modal-close">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="player-modal-content">
            <div class="player-modal-left">
                <div class="player-modal-cover" id="player-modal-cover">
                    <i class="fas fa-music"></i>
                </div>
                <div class="player-modal-track-info">
                    <div class="player-modal-track-title" id="player-modal-track-title">歌曲标题</div>
                    <div class="player-modal-track-album" id="player-modal-track-album">专辑名称</div>
                </div>
                <div class="player-modal-progress">
                    <div class="player-progress">
                        <span class="progress-time" id="modal-current-time">0:00</span>
                        <div class="progress-bar" id="modal-progress-bar">
                            <div class="progress-fill" id="modal-progress-fill"></div>
                            <div class="progress-handle" id="modal-progress-handle"></div>
                        </div>
                        <span class="progress-time" id="modal-duration">0:00</span>
                    </div>
                </div>
            </div>
            <div class="player-modal-right">
                <div class="lyrics-container" id="lyrics-container">
                    <div class="no-lyrics">
                        <i class="fas fa-music"></i>
                        <p>加载歌词中...</p>
                    </div>
                </div>
            </div>
        </div>
    </div>
    
    <!-- 音频元素 -->
    <audio id="audio-player" preload="metadata"></audio>
    
// ... 前面的HTML和CSS部分保持不变 ...

<script>
    // 全局变量
    let musicData = {
        albums: [],
        currentAlbumIndex: 0,
        currentView: 'albums', // albums, library, playlists, popular, random
        currentTrackIndex: -1,
        currentAlbumTracks: [],
        isPlaying: false,
        isShuffle: false,
        isRepeat: false,  // 修复：应该是 let isRepeat = false，但这里在对象中不需要let
        volume: 0.7,
        lyrics: [],
        currentLyricIndex: 0
    };
    
    // DOM 元素
    const loadingOverlay = document.getElementById('loading-overlay');
    const appContainer = document.getElementById('app-container');
    const playerContainer = document.getElementById('player-container');
    const playerModal = document.getElementById('player-modal');
    
    // 移动端元素
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const mobileDropdown = document.getElementById('mobile-dropdown');
    const mobileAlbumsList = document.getElementById('mobile-albums-list');
    
    // 桌面端元素
    const desktopAlbumsList = document.getElementById('desktop-albums-list');
    
    // 视图元素
    const albumsGrid = document.getElementById('albums-grid');
    const musicListContainer = document.getElementById('music-list-container');
    const musicList = document.getElementById('music-list');
    
    // 导航元素
    const navAlbums = document.getElementById('nav-albums');
    const navLibrary = document.getElementById('nav-library');
    const navPlaylists = document.getElementById('nav-playlists');
    const navPopular = document.getElementById('nav-popular');
    const navRandom = document.getElementById('nav-random');
    const pageTitle = document.getElementById('page-title');
    const listTitle = document.getElementById('list-title');
    const listCount = document.getElementById('list-count');
    
    // 播放器元素
    const playBtn = document.getElementById('play-btn');
    const playIcon = document.getElementById('play-icon');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const shuffleBtn = document.getElementById('shuffle-btn');
    const repeatBtn = document.getElementById('repeat-btn');
    const volumeBtn = document.getElementById('volume-btn');
    const volumeIcon = document.getElementById('volume-icon');
    const progressBar = document.getElementById('progress-bar');
    const progressFill = document.getElementById('progress-fill');
    const progressHandle = document.getElementById('progress-handle');
    const currentTimeEl = document.getElementById('current-time');
    const durationEl = document.getElementById('duration');
    const volumeSlider = document.getElementById('volume-slider');
    const volumeFill = document.getElementById('volume-fill');
    const playerCover = document.getElementById('player-cover');
    
    // 模态框元素
    const playerModalClose = document.getElementById('player-modal-close');
    const modalProgressBar = document.getElementById('modal-progress-bar');
    const modalProgressFill = document.getElementById('modal-progress-fill');
    const modalCurrentTimeEl = document.getElementById('modal-current-time');
    const modalDurationEl = document.getElementById('modal-duration');
    const lyricsContainer = document.getElementById('lyrics-container');
    
    // 信息元素
    const playerTrackTitle = document.getElementById('player-track-title');
    const playerTrackAlbum = document.getElementById('player-track-album');
    const playerModalTrackTitle = document.getElementById('player-modal-track-title');
    const playerModalTrackAlbum = document.getElementById('player-modal-track-album');
    const playerModalCover = document.getElementById('player-modal-cover');
    const repoDisplayEl = document.getElementById('repo-display');
    const mobileRepoDisplayEl = document.getElementById('mobile-repo-display');
    const musicPathEl = document.getElementById('music-path');
    
    // 音频元素
    const audio = document.getElementById('audio-player');
    
    // 页面加载完成后初始化
    document.addEventListener('DOMContentLoaded', async () => {
        console.log('页面加载完成，开始初始化...');
        
        // 设置仓库信息
        repoDisplayEl.textContent = '${GITHUB_REPO || '未配置仓库'}';
        mobileRepoDisplayEl.textContent = '${GITHUB_REPO || '未配置仓库'}';
        musicPathEl.textContent = '${MUSIC_PATH || '根目录'}';
        
        try {
            // 加载音乐数据
            await loadMusicData();
            
            // 隐藏加载界面，显示主界面
            setTimeout(() => {
                loadingOverlay.style.opacity = '0';
                setTimeout(() => {
                    loadingOverlay.style.display = 'none';
                    appContainer.classList.remove('hidden');
                    if (musicData.albums.length > 0) {
                        playerContainer.classList.remove('hidden');
                        console.log('播放器已显示');
                    } else {
                        console.log('没有找到音乐文件');
                    }
                }, 500);
            }, 1000);
            
            // 初始化导航
            initNavigation();
            initMobileMenu();
            
            // 初始化事件监听器
            initEventListeners();
            
            console.log('初始化完成');
        } catch (error) {
            console.error('初始化失败:', error);
            loadingOverlay.innerHTML = `
                <div style="text-align: center;">
                    <div style="font-size: 48px; color: #ff6b6b; margin-bottom: 20px;">
                        <i class="fas fa-exclamation-triangle"></i>
                    </div>
                    <div style="font-size: 18px; margin-bottom: 10px;">初始化失败</div>
                    <div style="font-size: 14px; color: #aaa; margin-bottom: 20px;">${error.message}</div>
                    <button onclick="location.reload()" style="
                        background: var(--primary);
                        color: white;
                        border: none;
                        padding: 10px 20px;
                        border-radius: 5px;
                        cursor: pointer;
                        font-size: 14px;
                    ">
                        重新加载
                    </button>
                </div>
            `;
        }
    });
    
    // 初始化移动端菜单
    function initMobileMenu() {
        // 移动端菜单按钮点击事件
        mobileMenuBtn.addEventListener('click', () => {
            mobileDropdown.classList.toggle('active');
            mobileMenuBtn.innerHTML = mobileDropdown.classList.contains('active') 
                ? '<i class="fas fa-times"></i>' 
                : '<i class="fas fa-bars"></i>';
        });
        
        // 点击下拉菜单项
        document.querySelectorAll('.mobile-dropdown-item').forEach(item => {
            item.addEventListener('click', function() {
                const page = this.getAttribute('data-page');
                handleNavigation(page);
                mobileDropdown.classList.remove('active');
                mobileMenuBtn.innerHTML = '<i class="fas fa-bars"></i>';
            });
        });
        
        // 点击外部关闭下拉菜单
        document.addEventListener('click', (e) => {
            if (!mobileDropdown.contains(e.target) && !mobileMenuBtn.contains(e.target)) {
                mobileDropdown.classList.remove('active');
                mobileMenuBtn.innerHTML = '<i class="fas fa-bars"></i>';
            }
        });
    }
    
    // 初始化导航
    function initNavigation() {
        console.log('初始化导航...');
        
        // 桌面端导航点击事件
        [navAlbums, navLibrary, navPlaylists, navPopular, navRandom].forEach(nav => {
            if (nav) {
                nav.addEventListener('click', function() {
                    const page = this.getAttribute('data-page');
                    handleNavigation(page);
                });
            }
        });
    }
    
    // 处理导航
    function handleNavigation(page) {
        console.log('导航到页面:', page);
        musicData.currentView = page;
        
        // 更新导航项状态
        updateNavActiveState(page);
        
        // 更新页面标题
        updatePageTitle(page);
        
        // 渲染对应视图
        renderView(page);
    }
    
    // 更新导航项状态
    function updateNavActiveState(page) {
        console.log('更新导航状态:', page);
        
        // 桌面端
        [navAlbums, navLibrary, navPlaylists, navPopular, navRandom].forEach(nav => {
            if (nav) {
                nav.classList.remove('active');
            }
        });
        
        switch(page) {
            case 'albums':
                if (navAlbums) navAlbums.classList.add('active');
                break;
            case 'library':
                if (navLibrary) navLibrary.classList.add('active');
                break;
            case 'playlists':
                if (navPlaylists) navPlaylists.classList.add('active');
                break;
            case 'popular':
                if (navPopular) navPopular.classList.add('active');
                break;
            case 'random':
                if (navRandom) navRandom.classList.add('active');
                break;
        }
        
        // 移动端
        document.querySelectorAll('.mobile-dropdown-item').forEach(item => {
            item.classList.remove('active');
            if (item.getAttribute('data-page') === page) {
                item.classList.add('active');
            }
        });
    }
    
    // 更新页面标题
    function updatePageTitle(page) {
        switch(page) {
            case 'albums':
                pageTitle.textContent = '专辑';
                break;
            case 'library':
                pageTitle.textContent = '所有歌曲';
                break;
            case 'playlists':
                pageTitle.textContent = '播放列表';
                break;
            case 'popular':
                pageTitle.textContent = '热门歌曲';
                break;
            case 'random':
                pageTitle.textContent = '随机播放';
                break;
        }
    }
    
    // 初始化事件监听器
    function initEventListeners() {
        console.log('初始化事件监听器...');
        
        // 播放器控制
        if (playBtn) playBtn.addEventListener('click', togglePlay);
        if (prevBtn) prevBtn.addEventListener('click', prevTrack);
        if (nextBtn) nextBtn.addEventListener('click', nextTrack);
        if (shuffleBtn) shuffleBtn.addEventListener('click', toggleShuffle);
        if (repeatBtn) repeatBtn.addEventListener('click', toggleRepeat);
        if (volumeBtn) volumeBtn.addEventListener('click', toggleMute);
        if (volumeSlider) volumeSlider.addEventListener('click', setVolume);
        
        // 进度条事件
        if (progressBar) progressBar.addEventListener('click', setProgress);
        if (modalProgressBar) modalProgressBar.addEventListener('click', setModalProgress);
        
        // 音频事件
        audio.addEventListener('timeupdate', updateProgress);
        audio.addEventListener('ended', handleTrackEnd);
        audio.addEventListener('error', (e) => {
            console.error('音频播放错误:', e);
        });
        
        // 封面点击打开播放页面
        if (playerCover) playerCover.addEventListener('click', openPlayerModal);
        
        // 模态框关闭
        if (playerModalClose) playerModalClose.addEventListener('click', closePlayerModal);
        
        // 点击模态框外部关闭
        playerModal.addEventListener('click', (e) => {
            if (e.target === playerModal) {
                closePlayerModal();
            }
        });
        
        // 键盘快捷键
        document.addEventListener('keydown', handleKeyboardShortcuts);
    }
    
    // 加载音乐数据
    async function loadMusicData() {
        console.log('开始加载音乐数据...');
        
        try {
            const response = await fetch('/music-data.json');
            console.log('音乐数据响应状态:', response.status);
            
            if (!response.ok) {
                throw new Error('无法加载音乐数据，状态码: ' + response.status);
            }
            
            const data = await response.json();
            console.log('音乐数据加载成功:', data);
            
            if (!data.albums) {
                throw new Error('音乐数据格式错误: 缺少 albums 字段');
            }
            
            musicData.albums = data.albums || [];
            musicData.currentAlbumTracks = musicData.albums[0]?.tracks || [];
            
            console.log('解析后的专辑数量:', musicData.albums.length);
            console.log('总歌曲数:', data.totalSongs || 0);
            
            // 更新统计信息显示
            updateStats(data);
            
            // 渲染专辑列表
            renderAlbumLists();
            
            // 渲染默认视图（专辑视图）
            renderView('albums');
            
            // 如果有音乐文件，初始化播放器
            if (data.totalSongs > 0) {
                // 设置默认音量
                audio.volume = musicData.volume;
                updateVolumeUI();
                
                // 如果有上次播放的记录，恢复播放位置
                const lastPlayed = localStorage.getItem('lastPlayed');
                if (lastPlayed) {
                    try {
                        const { albumIndex, trackIndex } = JSON.parse(lastPlayed);
                        if (albumIndex < musicData.albums.length && 
                            trackIndex < musicData.albums[albumIndex].tracks.length) {
                            loadTrack(albumIndex, trackIndex, false);
                        }
                    } catch (e) {
                        console.log('无法恢复上次播放记录:', e);
                    }
                }
            }
            
            return true;
            
        } catch (error) {
            console.error('加载音乐数据失败:', error);
            
            // 显示错误信息
            showEmptyState('无法加载音乐数据', '请检查网络连接或刷新页面重试。');
            
            // 尝试使用备用数据
            musicData.albums = [];
            musicData.currentAlbumTracks = [];
            
            throw error;
        }
    }
    
    // 更新统计信息
    function updateStats(data) {
        console.log('更新统计信息:', data);
        
        // 这里可以添加统计信息显示
        const totalSongsEl = document.getElementById('total-songs');
        const totalSizeEl = document.getElementById('total-size');
        const lastUpdatedEl = document.getElementById('last-updated');
        
        if (totalSongsEl) totalSongsEl.textContent = data.totalSongs || 0;
        if (totalSizeEl) {
            // 计算总大小
            const totalSize = musicData.albums.reduce((sum, album) => {
                return sum + (album.tracks || []).reduce((trackSum, track) => trackSum + (track.size || 0), 0);
            }, 0);
            const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(1);
            totalSizeEl.textContent = \`\${totalSizeMB} MB\`;
        }
        if (lastUpdatedEl) lastUpdatedEl.textContent = '刚刚';
    }
    
    // 渲染专辑列表（侧边栏和移动端）
    function renderAlbumLists() {
        console.log('渲染专辑列表...');
        
        if (musicData.albums.length === 0) {
            console.log('没有专辑可显示');
            return;
        }
        
        // 清空列表
        if (desktopAlbumsList) desktopAlbumsList.innerHTML = '';
        if (mobileAlbumsList) mobileAlbumsList.innerHTML = '';
        
        // 添加专辑项
        musicData.albums.forEach((album, index) => {
            // 桌面端
            if (desktopAlbumsList) {
                const desktopItem = createAlbumListItem(album, index, 'desktop');
                desktopAlbumsList.appendChild(desktopItem);
            }
            
            // 移动端
            if (mobileAlbumsList) {
                const mobileItem = createAlbumListItem(album, index, 'mobile');
                mobileAlbumsList.appendChild(mobileItem);
            }
        });
        
        console.log('专辑列表渲染完成');
    }
    
    // 创建专辑列表项
    function createAlbumListItem(album, index, type) {
        const item = document.createElement('div');
        item.className = type === 'desktop' ? 'album-item' : 'mobile-dropdown-item';
        item.setAttribute('data-album-index', index);
        
        const coverHtml = album.cover 
            ? \`<img src="\${album.cover}" alt="\${album.name}" onerror="this.style.display='none'; this.parentElement.innerHTML='<i class=\\"fas fa-compact-disc\\"></i>';">\`
            : \`<i class="fas fa-compact-disc"></i>\`;
        
        item.innerHTML = type === 'desktop' ? \`
            <div class="album-cover">
                \${coverHtml}
            </div>
            <div class="album-info">
                <div class="album-name">\${album.name}</div>
                <div class="album-count">\${(album.tracks || []).length} 首歌曲</div>
            </div>
        \` : \`
            <i class="fas fa-compact-disc"></i>
            <span>\${album.name} (\${(album.tracks || []).length})</span>
        \`;
        
        item.addEventListener('click', () => {
            console.log('点击专辑:', album.name, '索引:', index);
            
            // 设置当前专辑
            musicData.currentAlbumIndex = index;
            musicData.currentAlbumTracks = album.tracks || [];
            
            // 更新专辑项高亮
            updateAlbumActiveState(index, type);
            
            // 切换到专辑视图并显示该专辑的歌曲
            handleNavigation('albums');
            renderAlbumSongs(album);
        });
        
        return item;
    }
    
    // 更新专辑项高亮状态
    function updateAlbumActiveState(albumIndex, type) {
        // 桌面端
        if (type === 'desktop' || type === 'all') {
            document.querySelectorAll('.album-item').forEach((item, index) => {
                item.classList.toggle('active', index === albumIndex);
            });
        }
        
        // 移动端
        if (type === 'mobile' || type === 'all') {
            const mobileItems = document.querySelectorAll('#mobile-albums-list .mobile-dropdown-item');
            mobileItems.forEach((item, index) => {
                item.classList.toggle('active', index === albumIndex);
            });
        }
    }
    
    // 渲染视图
    function renderView(view) {
        console.log('渲染视图:', view);
        
        // 隐藏所有视图
        if (albumsGrid) albumsGrid.classList.add('hidden');
        if (musicListContainer) musicListContainer.classList.add('hidden');
        
        switch(view) {
            case 'albums':
                // 显示专辑网格或当前专辑的歌曲
                if (musicData.currentAlbumTracks && musicData.currentAlbumTracks.length > 0) {
                    const album = musicData.albums[musicData.currentAlbumIndex];
                    if (album) {
                        renderAlbumSongs(album);
                    } else {
                        renderAlbumsGrid();
                        if (albumsGrid) albumsGrid.classList.remove('hidden');
                    }
                } else {
                    renderAlbumsGrid();
                    if (albumsGrid) albumsGrid.classList.remove('hidden');
                }
                break;
                
            case 'library':
                // 显示所有歌曲
                renderAllSongs();
                if (musicListContainer) musicListContainer.classList.remove('hidden');
                if (listTitle) listTitle.textContent = '所有歌曲';
                break;
                
            case 'playlists':
                // 显示播放列表（这里显示所有歌曲作为示例）
                renderAllSongs();
                if (musicListContainer) musicListContainer.classList.remove('hidden');
                if (listTitle) listTitle.textContent = '播放列表';
                break;
                
            case 'popular':
                // 显示热门歌曲（按文件大小排序）
                renderPopularSongs();
                if (musicListContainer) musicListContainer.classList.remove('hidden');
                if (listTitle) listTitle.textContent = '热门歌曲';
                break;
                
            case 'random':
                // 随机播放一首歌曲
                playRandomTrack();
                // 显示所有歌曲
                renderAllSongs();
                if (musicListContainer) musicListContainer.classList.remove('hidden');
                if (listTitle) listTitle.textContent = '随机播放';
                break;
        }
    }
    
    // 渲染专辑网格
    function renderAlbumsGrid() {
        console.log('渲染专辑网格...');
        
        if (!albumsGrid) return;
        
        if (musicData.albums.length === 0) {
            showAlbumsEmptyState();
            return;
        }
        
        albumsGrid.innerHTML = '';
        
        musicData.albums.forEach((album, index) => {
            const card = document.createElement('div');
            card.className = 'album-card fade-in';
            card.style.animationDelay = \`\${index * 0.05}s\`;
            
            const coverHtml = album.cover 
                ? \`<img src="\${album.cover}" alt="\${album.name}" onerror="this.style.display='none'; this.parentElement.innerHTML='<i class=\\"fas fa-compact-disc\\"></i>';">\`
                : \`<i class="fas fa-compact-disc"></i>\`;
            
            card.innerHTML = \`
                <div class="album-card-cover">
                    \${coverHtml}
                    <div class="album-card-play">
                        <i class="fas fa-play"></i>
                    </div>
                </div>
                <div class="album-card-info">
                    <div class="album-card-name">\${album.name}</div>
                    <div class="album-card-count">\${(album.tracks || []).length} 首歌曲</div>
                </div>
            \`;
            
            card.addEventListener('click', () => {
                console.log('点击专辑卡片:', album.name);
                
                // 设置当前专辑
                musicData.currentAlbumIndex = index;
                musicData.currentAlbumTracks = album.tracks || [];
                
                // 更新专辑项高亮
                updateAlbumActiveState(index, 'all');
                
                // 渲染该专辑的歌曲
                renderAlbumSongs(album);
            });
            
            albumsGrid.appendChild(card);
        });
        
        console.log('专辑网格渲染完成');
    }
    
    // 渲染专辑歌曲
    function renderAlbumSongs(album) {
        console.log('渲染专辑歌曲:', album.name);
        
        if (!musicListContainer || !musicList || !listTitle || !listCount) return;
        
        // 切换到音乐列表视图
        if (albumsGrid) albumsGrid.classList.add('hidden');
        musicListContainer.classList.remove('hidden');
        
        // 更新列表标题
        listTitle.textContent = album.name;
        listCount.textContent = (album.tracks || []).length;
        
        // 清空音乐列表
        musicList.innerHTML = '';
        
        if (!album.tracks || album.tracks.length === 0) {
            musicList.innerHTML = \`
                <div class="empty-state">
                    <div class="empty-state-icon">
                        <i class="fas fa-music"></i>
                    </div>
                    <h3 class="empty-state-title">专辑为空</h3>
                    <p class="empty-state-description">该专辑中没有找到音乐文件。</p>
                </div>
            \`;
            return;
        }
        
        // 添加歌曲项
        album.tracks.forEach((track, index) => {
            const item = createMusicListItem(track, index, album);
            musicList.appendChild(item);
        });
        
        console.log('专辑歌曲渲染完成，共', album.tracks.length, '首');
    }
    
    // 渲染所有歌曲
    function renderAllSongs() {
        console.log('渲染所有歌曲...');
        
        if (!musicList || !listCount) return;
        
        // 收集所有歌曲
        const allTracks = [];
        musicData.albums.forEach(album => {
            (album.tracks || []).forEach(track => {
                allTracks.push({
                    ...track,
                    albumName: album.name,
                    albumIndex: musicData.albums.indexOf(album)
                });
            });
        });
        
        // 按文件名排序
        allTracks.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
        
        // 更新列表计数
        listCount.textContent = allTracks.length;
        
        // 清空音乐列表
        musicList.innerHTML = '';
        
        if (allTracks.length === 0) {
            showMusicListEmptyState();
            return;
        }
        
        // 添加歌曲项
        allTracks.forEach((track, index) => {
            const album = musicData.albums[track.albumIndex] || { name: '未知专辑', cover: null };
            const item = createMusicListItem(track, index, album);
            musicList.appendChild(item);
        });
        
        console.log('所有歌曲渲染完成，共', allTracks.length, '首');
    }
    
    // 渲染热门歌曲
    function renderPopularSongs() {
        console.log('渲染热门歌曲...');
        
        if (!musicList || !listCount) return;
        
        // 收集所有歌曲并按文件大小排序（模拟热门程度）
        const allTracks = [];
        musicData.albums.forEach(album => {
            (album.tracks || []).forEach(track => {
                allTracks.push({
                    ...track,
                    albumName: album.name,
                    albumIndex: musicData.albums.indexOf(album)
                });
            });
        });
        
        // 按文件大小降序排序
        allTracks.sort((a, b) => (b.size || 0) - (a.size || 0));
        
        // 只显示前50首
        const popularTracks = allTracks.slice(0, 50);
        
        // 更新列表计数
        listCount.textContent = popularTracks.length;
        
        // 清空音乐列表
        musicList.innerHTML = '';
        
        if (popularTracks.length === 0) {
            showMusicListEmptyState();
            return;
        }
        
        // 添加歌曲项
        popularTracks.forEach((track, index) => {
            const album = musicData.albums[track.albumIndex] || { name: '未知专辑', cover: null };
            const item = createMusicListItem(track, index, album);
            musicList.appendChild(item);
        });
    }
    
    // 创建音乐列表项
    function createMusicListItem(track, index, album) {
        const item = document.createElement('div');
        item.className = 'music-item fade-in';
        item.style.animationDelay = \`\${index * 0.02}s\`;
        item.setAttribute('data-track-id', track.id);
        
        // 检查是否是当前播放的歌曲
        const isCurrentPlaying = musicData.currentTrackIndex >= 0 && 
                               musicData.currentAlbumTracks[musicData.currentTrackIndex]?.id === track.id;
        
        if (isCurrentPlaying) {
            item.classList.add('playing');
        }
        
        item.innerHTML = \`
            <div class="music-item-index">\${index + 1}</div>
            <div class="music-item-info">
                <div class="music-item-title">\${track.displayName || track.name}</div>
                <div class="music-item-album">\${album.name}</div>
            </div>
            <div class="music-item-duration" id="duration-\${track.id}">--:--</div>
            <div class="music-item-lyrics">
                <button class="lyrics-btn" data-track-id="\${track.id}" title="显示歌词">
                    <i class="fas fa-file-alt"></i>
                </button>
            </div>
        \`;
        
        // 点击播放歌曲
        item.addEventListener('click', (e) => {
            if (!e.target.closest('.lyrics-btn')) {
                console.log('点击播放歌曲:', track.displayName);
                
                // 找到歌曲在专辑中的索引
                const albumIndex = track.albumIndex !== undefined ? track.albumIndex : musicData.currentAlbumIndex;
                const trackIndex = (album.tracks || []).findIndex(t => t.id === track.id);
                
                if (trackIndex !== -1) {
                    loadTrack(albumIndex, trackIndex);
                    playTrack();
                    openPlayerModal();
                } else {
                    console.warn('未找到歌曲索引:', track);
                }
            }
        });
        
        // 歌词按钮点击事件
        const lyricsBtn = item.querySelector('.lyrics-btn');
        if (lyricsBtn) {
            lyricsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                console.log('点击歌词按钮:', track.displayName);
                
                // 找到歌曲在专辑中的索引
                const albumIndex = track.albumIndex !== undefined ? track.albumIndex : musicData.currentAlbumIndex;
                const trackIndex = (album.tracks || []).findIndex(t => t.id === track.id);
                
                if (trackIndex !== -1) {
                    loadTrack(albumIndex, trackIndex);
                    playTrack();
                    openPlayerModal();
                }
            });
        }
        
        // 预加载歌曲时长
        preloadDuration(track);
        
        return item;
    }
    
    // 播放随机歌曲
    function playRandomTrack() {
        console.log('播放随机歌曲');
        
        if (musicData.albums.length === 0) return;
        
        // 随机选择一个专辑
        const randomAlbumIndex = Math.floor(Math.random() * musicData.albums.length);
        const album = musicData.albums[randomAlbumIndex];
        
        if (!album.tracks || album.tracks.length === 0) return;
        
        // 随机选择一首歌
        const randomTrackIndex = Math.floor(Math.random() * album.tracks.length);
        
        loadTrack(randomAlbumIndex, randomTrackIndex);
        playTrack();
    }
    
    // 显示专辑空状态
    function showAlbumsEmptyState() {
        if (!albumsGrid) return;
        
        albumsGrid.innerHTML = \`
            <div class="empty-state">
                <div class="empty-state-icon">
                    <i class="fas fa-compact-disc"></i>
                </div>
                <h3 class="empty-state-title">没有找到专辑</h3>
                <p class="empty-state-description">请在 GitHub 仓库的指定路径下添加音乐文件和文件夹。</p>
            </div>
        \`;
    }
    
    // 显示音乐列表空状态
    function showMusicListEmptyState() {
        if (!musicList) return;
        
        musicList.innerHTML = \`
            <div class="empty-state">
                <div class="empty-state-icon">
                    <i class="fas fa-music"></i>
                </div>
                <h3 class="empty-state-title">没有找到音乐文件</h3>
                <p class="empty-state-description">请在 GitHub 仓库的指定路径下添加音乐文件。</p>
            </div>
        \`;
    }
    
    // 显示空状态（通用）
    function showEmptyState(title, description) {
        if (albumsGrid) {
            albumsGrid.innerHTML = \`
                <div class="empty-state">
                    <div class="empty-state-icon">
                        <i class="fas fa-exclamation-triangle"></i>
                    </div>
                    <h3 class="empty-state-title">\${title}</h3>
                    <p class="empty-state-description">\${description}</p>
                </div>
            \`;
        }
    }
    
    // 预加载歌曲时长
    function preloadDuration(track) {
        const tempAudio = new Audio();
        tempAudio.src = track.url;
        tempAudio.preload = 'metadata';
        
        tempAudio.addEventListener('loadedmetadata', () => {
            const durationEl = document.getElementById(\`duration-\${track.id}\`);
            if (durationEl) {
                durationEl.textContent = formatTime(tempAudio.duration);
            }
        });
        
        tempAudio.addEventListener('error', () => {
            const durationEl = document.getElementById(\`duration-\${track.id}\`);
            if (durationEl) {
                durationEl.textContent = '--:--';
            }
        });
    }
    
    // 加载指定曲目
    function loadTrack(albumIndex, trackIndex, playImmediately = true) {
        console.log('加载曲目，专辑索引:', albumIndex, '曲目索引:', trackIndex);
        
        if (albumIndex < 0 || albumIndex >= musicData.albums.length) {
            console.error('专辑索引无效:', albumIndex);
            return;
        }
        
        const album = musicData.albums[albumIndex];
        if (!album || !album.tracks || trackIndex < 0 || trackIndex >= album.tracks.length) {
            console.error('曲目索引无效:', trackIndex);
            return;
        }
        
        // 保存当前播放信息
        musicData.currentAlbumIndex = albumIndex;
        musicData.currentTrackIndex = trackIndex;
        musicData.currentAlbumTracks = album.tracks || [];
        
        // 保存到本地存储
        try {
            localStorage.setItem('lastPlayed', JSON.stringify({
                albumIndex: albumIndex,
                trackIndex: trackIndex
            }));
        } catch (e) {
            console.log('无法保存播放记录到本地存储:', e);
        }
        
        const track = album.tracks[trackIndex];
        
        console.log('加载歌曲:', track.displayName);
        
        // 设置音频源
        audio.src = track.url;
        audio.type = track.type || 'audio/mpeg';
        
        // 更新播放器界面
        if (playerTrackTitle) playerTrackTitle.textContent = track.displayName || track.name;
        if (playerTrackAlbum) playerTrackAlbum.textContent = album.name;
        if (playerModalTrackTitle) playerModalTrackTitle.textContent = track.displayName || track.name;
        if (playerModalTrackAlbum) playerModalTrackAlbum.textContent = album.name;
        
        // 更新封面
        updateCovers(album);
        
        // 更新音乐列表高亮
        updatePlayingItem();
        
        // 加载歌词
        if (track.lrcUrl) {
            loadLyrics(track.lrcUrl);
        } else {
            musicData.lyrics = [];
            renderNoLyrics();
        }
        
        // 清除之前的loadedmetadata事件
        audio.onloadedmetadata = null;
        
        // 加载元数据
        audio.addEventListener('loadedmetadata', function onLoaded() {
            console.log('音频元数据加载完成，时长:', audio.duration);
            
            if (durationEl) durationEl.textContent = formatTime(audio.duration);
            if (modalDurationEl) modalDurationEl.textContent = formatTime(audio.duration);
            
            // 移除事件监听器，避免重复触发
            audio.removeEventListener('loadedmetadata', onLoaded);
            
            // 如果设置了自动播放，则播放
            if (playImmediately) {
                playTrack();
            }
        }, { once: true });
        
        // 处理加载错误
        audio.addEventListener('error', function onError(e) {
            console.error('音频加载错误:', e);
            alert('无法加载音频文件，请检查网络连接或文件URL是否正确。');
            audio.removeEventListener('error', onError);
        }, { once: true });
    }
    
    // 更新封面
    function updateCovers(album) {
        // 播放器封面
        if (playerCover) {
            if (album.cover) {
                playerCover.innerHTML = \`<img src="\${album.cover}" alt="\${album.name}" onerror="this.style.display='none'; this.parentElement.innerHTML='<i class=\\"fas fa-music\\"></i>';">\`;
            } else {
                playerCover.innerHTML = '<i class="fas fa-music"></i>';
            }
        }
        
        // 模态框封面
        if (playerModalCover) {
            if (album.cover) {
                playerModalCover.innerHTML = \`<img src="\${album.cover}" alt="\${album.name}" onerror="this.style.display='none'; this.parentElement.innerHTML='<i class=\\"fas fa-music\\"></i>';">\`;
            } else {
                playerModalCover.innerHTML = '<i class="fas fa-music"></i>';
            }
        }
    }
    
    // 更新播放中的列表项高亮
    function updatePlayingItem() {
        document.querySelectorAll('.music-item').forEach(item => {
            item.classList.remove('playing');
        });
        
        // 找到当前播放的歌曲并高亮
        if (musicData.currentTrackIndex >= 0 && musicData.currentAlbumTracks.length > 0) {
            const currentTrack = musicData.currentAlbumTracks[musicData.currentTrackIndex];
            const currentTrackId = currentTrack.id;
            
            document.querySelectorAll('.music-item').forEach(item => {
                const trackId = item.getAttribute('data-track-id');
                if (trackId === currentTrackId) {
                    item.classList.add('playing');
                }
            });
        }
    }
    
    // 加载歌词
    async function loadLyrics(lrcUrl) {
        console.log('加载歌词:', lrcUrl);
        
        try {
            const response = await fetch(lrcUrl);
            if (!response.ok) {
                throw new Error('歌词文件不存在或无法访问');
            }
            
            const lrcText = await response.text();
            musicData.lyrics = parseLRC(lrcText);
            musicData.currentLyricIndex = 0;
            
            renderLyrics();
            console.log('歌词加载成功，行数:', musicData.lyrics.length);
        } catch (error) {
            console.log('无法加载歌词:', error.message);
            musicData.lyrics = [];
            renderNoLyrics();
        }
    }
    
    // 解析LRC歌词
    function parseLRC(lrcText) {
        const lines = lrcText.split('\\n');
        const lyrics = [];
        
        // 正则表达式匹配时间标签和歌词
        const timeTagRegex = /\\[(\\d{2}):(\\d{2}\\.\\d{2})\\]/g;
        
        lines.forEach(line => {
            const timeTags = line.match(timeTagRegex);
            const text = line.replace(timeTagRegex, '').trim();
            
            if (timeTags && text) {
                timeTags.forEach(tag => {
                    const minutes = parseInt(tag.match(/\\[(\\d{2}):/)[1]);
                    const seconds = parseFloat(tag.match(/:([\\d\\.]+)\\]/)[1]);
                    const time = minutes * 60 + seconds;
                    
                    lyrics.push({
                        time: time,
                        text: text
                    });
                });
            }
        });
        
        // 按时间排序
        lyrics.sort((a, b) => a.time - b.time);
        
        return lyrics;
    }
    
    // 渲染歌词
    function renderLyrics() {
        if (!lyricsContainer) return;
        
        if (musicData.lyrics.length === 0) {
            renderNoLyrics();
            return;
        }
        
        const lyricsHTML = musicData.lyrics.map((line, index) => {
            return \`<div class="lyrics-line" data-index="\${index}">\${line.text}</div>\`;
        }).join('');
        
        lyricsContainer.innerHTML = \`<div class="lyrics-content">\${lyricsHTML}</div>\`;
    }
    
    // 渲染无歌词状态
    function renderNoLyrics() {
        if (!lyricsContainer) return;
        
        lyricsContainer.innerHTML = \`
            <div class="no-lyrics">
                <i class="fas fa-file-alt"></i>
                <p>暂无歌词</p>
                <p style="font-size: 14px; margin-top: 10px;">可以在音乐文件同级目录添加同名的 .lrc 文件</p>
            </div>
        \`;
    }
    
    // 更新当前显示的歌词
    function updateCurrentLyric() {
        if (musicData.lyrics.length === 0) return;
        
        const currentTime = audio.currentTime;
        
        // 找到当前时间对应的歌词
        let newIndex = musicData.currentLyricIndex;
        
        // 如果当前时间小于当前歌词时间，向前查找
        if (currentTime < musicData.lyrics[newIndex]?.time) {
            while (newIndex > 0 && currentTime < musicData.lyrics[newIndex].time) {
                newIndex--;
            }
        } 
        // 否则向后查找
        else {
            while (newIndex < musicData.lyrics.length - 1 && 
                   currentTime >= musicData.lyrics[newIndex + 1].time) {
                newIndex++;
            }
        }
        
        // 如果索引发生变化，更新高亮
        if (newIndex !== musicData.currentLyricIndex) {
            musicData.currentLyricIndex = newIndex;
            
            // 移除所有高亮
            document.querySelectorAll('.lyrics-line').forEach(line => {
                line.classList.remove('active');
            });
            
            // 高亮当前歌词
            const currentLine = document.querySelector(\`.lyrics-line[data-index="\${newIndex}"]\`);
            if (currentLine) {
                currentLine.classList.add('active');
                
                // 滚动到当前歌词
                currentLine.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center'
                });
            }
        }
    }
    
    // 播放/暂停
    function togglePlay() {
        console.log('切换播放/暂停，当前状态:', musicData.isPlaying);
        
        if (musicData.albums.length === 0 || musicData.currentTrackIndex === -1) {
            console.log('没有可播放的音乐');
            return;
        }
        
        if (musicData.isPlaying) {
            pauseTrack();
        } else {
            playTrack();
        }
    }
    
    // 播放
    function playTrack() {
        console.log('播放音乐');
        
        if (musicData.albums.length === 0 || musicData.currentTrackIndex === -1) {
            // 如果没有正在播放的曲目，播放第一首
            if (musicData.albums.length > 0 && musicData.albums[0].tracks && musicData.albums[0].tracks.length > 0) {
                loadTrack(0, 0);
            }
            return;
        }
        
        audio.play().then(() => {
            musicData.isPlaying = true;
            if (playIcon) playIcon.className = 'fas fa-pause';
            if (playBtn) playBtn.title = '暂停';
            console.log('播放成功');
        }).catch(error => {
            console.error('播放失败:', error);
            alert('播放失败，请检查音频文件或网络连接。');
        });
    }
    
    // 暂停
    function pauseTrack() {
        console.log('暂停音乐');
        
        audio.pause();
        musicData.isPlaying = false;
        if (playIcon) playIcon.className = 'fas fa-play';
        if (playBtn) playBtn.title = '播放';
    }
    
    // 下一首
    function nextTrack() {
        console.log('下一首');
        
        if (musicData.albums.length === 0) return;
        
        let nextAlbumIndex = musicData.currentAlbumIndex;
        let nextTrackIndex;
        
        if (musicData.isShuffle) {
            // 随机播放
            nextAlbumIndex = Math.floor(Math.random() * musicData.albums.length);
            nextTrackIndex = Math.floor(Math.random() * musicData.albums[nextAlbumIndex].tracks.length);
            
            // 确保不重复播放同一首歌（除非只有一首歌）
            while (nextAlbumIndex === musicData.currentAlbumIndex && 
                   nextTrackIndex === musicData.currentTrackIndex && 
                   musicData.albums[nextAlbumIndex].tracks.length > 1) {
                nextAlbumIndex = Math.floor(Math.random() * musicData.albums.length);
                nextTrackIndex = Math.floor(Math.random() * musicData.albums[nextAlbumIndex].tracks.length);
            }
        } else {
            // 顺序播放
            nextTrackIndex = (musicData.currentTrackIndex + 1) % musicData.currentAlbumTracks.length;
            
            // 如果当前专辑播放完，播放下一个专辑的第一首
            if (nextTrackIndex === 0) {
                nextAlbumIndex = (musicData.currentAlbumIndex + 1) % musicData.albums.length;
                nextTrackIndex = 0;
            }
        }
        
        loadTrack(nextAlbumIndex, nextTrackIndex);
    }
    
    // 上一首
    function prevTrack() {
        console.log('上一首');
        
        if (musicData.albums.length === 0) return;
        
        let prevAlbumIndex = musicData.currentAlbumIndex;
        let prevTrackIndex;
        
        if (musicData.isShuffle) {
            // 随机播放
            prevAlbumIndex = Math.floor(Math.random() * musicData.albums.length);
            prevTrackIndex = Math.floor(Math.random() * musicData.albums[prevAlbumIndex].tracks.length);
            
            // 确保不重复播放同一首歌（除非只有一首歌）
            while (prevAlbumIndex === musicData.currentAlbumIndex && 
                   prevTrackIndex === musicData.currentTrackIndex && 
                   musicData.albums[prevAlbumIndex].tracks.length > 1) {
                prevAlbumIndex = Math.floor(Math.random() * musicData.albums.length);
                prevTrackIndex = Math.floor(Math.random() * musicData.albums[prevAlbumIndex].tracks.length);
            }
        } else {
            // 顺序播放
            prevTrackIndex = musicData.currentTrackIndex - 1;
            
            // 如果是第一首，播放上一个专辑的最后一首
            if (prevTrackIndex < 0) {
                prevAlbumIndex = (musicData.currentAlbumIndex - 1 + musicData.albums.length) % musicData.albums.length;
                prevTrackIndex = musicData.albums[prevAlbumIndex].tracks.length - 1;
            }
        }
        
        loadTrack(prevAlbumIndex, prevTrackIndex);
    }
    
    // 处理歌曲结束
    function handleTrackEnd() {
        console.log('歌曲播放结束');
        
        if (musicData.isRepeat) {
            // 重复播放当前歌曲
            audio.currentTime = 0;
            audio.play();
        } else {
            // 播放下一首
            nextTrack();
        }
    }
    
    // 切换随机播放
    function toggleShuffle() {
        musicData.isShuffle = !musicData.isShuffle;
        console.log('切换随机播放:', musicData.isShuffle);
        
        if (shuffleBtn) {
            shuffleBtn.style.color = musicData.isShuffle ? 'var(--primary)' : 'var(--text-secondary)';
            shuffleBtn.title = musicData.isShuffle ? '关闭随机播放' : '开启随机播放';
        }
    }
    
    // 切换重复播放
    function toggleRepeat() {
        musicData.isRepeat = !musicData.isRepeat;
        console.log('切换重复播放:', musicData.isRepeat);
        
        if (repeatBtn) {
            repeatBtn.style.color = musicData.isRepeat ? 'var(--primary)' : 'var(--text-secondary)';
            repeatBtn.title = musicData.isRepeat ? '关闭重复播放' : '开启重复播放';
        }
    }
    
    // 切换音量
    function toggleMute() {
        console.log('切换静音，当前音量:', audio.volume);
        
        if (audio.volume > 0) {
            audio.volume = 0;
            if (volumeIcon) volumeIcon.className = 'fas fa-volume-mute';
            if (volumeFill) volumeFill.style.width = '0%';
        } else {
            audio.volume = musicData.volume;
            updateVolumeUI();
        }
    }
    
    // 设置音量
    function setVolume(e) {
        const rect = volumeSlider.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const width = rect.width;
        
        musicData.volume = Math.max(0, Math.min(1, clickX / width));
        audio.volume = musicData.volume;
        
        updateVolumeUI();
    }
    
    // 更新音量UI
    function updateVolumeUI() {
        console.log('更新音量UI:', musicData.volume);
        
        if (volumeFill) volumeFill.style.width = \`\${musicData.volume * 100}%\`;
        
        if (volumeIcon) {
            if (musicData.volume === 0) {
                volumeIcon.className = 'fas fa-volume-mute';
            } else if (musicData.volume < 0.5) {
                volumeIcon.className = 'fas fa-volume-down';
            } else {
                volumeIcon.className = 'fas fa-volume-up';
            }
        }
    }
    
    // 更新进度条
    function updateProgress() {
        const { currentTime, duration } = audio;
        const progressPercent = (currentTime / duration) * 100 || 0;
        
        if (progressFill) progressFill.style.width = \`\${progressPercent}%\`;
        if (modalProgressFill) modalProgressFill.style.width = \`\${progressPercent}%\`;
        if (progressHandle) progressHandle.style.left = \`\${progressPercent}%\`;
        if (modalProgressHandle) modalProgressHandle.style.left = \`\${progressPercent}%\`;
        
        if (currentTimeEl) currentTimeEl.textContent = formatTime(currentTime);
        if (modalCurrentTimeEl) modalCurrentTimeEl.textContent = formatTime(currentTime);
        
        // 更新歌词
        updateCurrentLyric();
    }
    
    // 设置播放进度
    function setProgress(e) {
        const rect = progressBar.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const width = rect.width;
        
        const percent = Math.max(0, Math.min(1, clickX / width));
        audio.currentTime = percent * audio.duration;
    }
    
    // 设置模态框播放进度
    function setModalProgress(e) {
        const rect = modalProgressBar.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const width = rect.width;
        
        const percent = Math.max(0, Math.min(1, clickX / width));
        audio.currentTime = percent * audio.duration;
    }
    
    // 打开播放页面模态框
    function openPlayerModal() {
        console.log('打开播放页面');
        playerModal.classList.add('active');
        document.body.style.overflow = 'hidden'; // 防止背景滚动
    }
    
    // 关闭播放页面模态框
    function closePlayerModal() {
        console.log('关闭播放页面');
        playerModal.classList.remove('active');
        document.body.style.overflow = ''; // 恢复背景滚动
    }
    
    // 格式化时间 (秒 -> MM:SS)
    function formatTime(seconds) {
        if (isNaN(seconds) || !isFinite(seconds) || seconds === Infinity) return '0:00';
        
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return \`\${mins}:\${secs < 10 ? '0' : ''}\${secs}\`;
    }
    
    // 键盘快捷键处理
    function handleKeyboardShortcuts(e) {
        // 空格键: 播放/暂停
        if (e.code === 'Space' && !e.target.matches('input, textarea, button')) {
            e.preventDefault();
            togglePlay();
        }
        
        // 右箭头: 快进10秒
        if (e.code === 'ArrowRight' && e.ctrlKey) {
            e.preventDefault();
            audio.currentTime = Math.min(audio.duration, audio.currentTime + 10);
        }
        
        // 左箭头: 快退10秒
        if (e.code === 'ArrowLeft' && e.ctrlKey) {
            e.preventDefault();
            audio.currentTime = Math.max(0, audio.currentTime - 10);
        }
        
        // N: 下一首
        if (e.code === 'KeyN' && e.ctrlKey) {
            e.preventDefault();
            nextTrack();
        }
        
        // P: 上一首
        if (e.code === 'KeyP' && e.ctrlKey) {
            e.preventDefault();
            prevTrack();
        }
        
        // M: 静音
        if (e.code === 'KeyM' && e.ctrlKey) {
            e.preventDefault();
            toggleMute();
        }
        
        // L: 显示/隐藏歌词页面
        if (e.code === 'KeyL' && e.ctrlKey) {
            e.preventDefault();
            if (playerModal.classList.contains('active')) {
                closePlayerModal();
            } else {
                openPlayerModal();
            }
        }
        
        // ESC: 关闭播放页面
        if (e.code === 'Escape' && playerModal.classList.contains('active')) {
            e.preventDefault();
            closePlayerModal();
        }
        
        // 上箭头: 增加音量
        if (e.code === 'ArrowUp' && e.ctrlKey) {
            e.preventDefault();
            musicData.volume = Math.min(1, musicData.volume + 0.1);
            audio.volume = musicData.volume;
            updateVolumeUI();
        }
        
        // 下箭头: 减少音量
        if (e.code === 'ArrowDown' && e.ctrlKey) {
            e.preventDefault();
            musicData.volume = Math.max(0, musicData.volume - 0.1);
            audio.volume = musicData.volume;
            updateVolumeUI();
        }
    }
    
    // 添加全局错误处理
    window.addEventListener('error', function(event) {
        console.error('全局错误:', event.error);
        
        // 显示错误信息
        const errorDiv = document.createElement('div');
        errorDiv.style.position = 'fixed';
        errorDiv.style.top = '10px';
        errorDiv.style.right = '10px';
        errorDiv.style.background = '#ff6b6b';
        errorDiv.style.color = 'white';
        errorDiv.style.padding = '10px';
        errorDiv.style.borderRadius = '5px';
        errorDiv.style.zIndex = '9999';
        errorDiv.style.maxWidth = '300px';
        errorDiv.innerHTML = \`
            <div style="font-weight: bold;">页面错误</div>
            <div style="font-size: 12px; margin-top: 5px;">\${event.error.message}</div>
            <button onclick="this.parentElement.remove()" style="
                background: none;
                border: none;
                color: white;
                float: right;
                cursor: pointer;
            ">×</button>
        \`;
        
        document.body.appendChild(errorDiv);
        
        // 5秒后自动移除
        setTimeout(() => {
            if (errorDiv.parentElement) {
                errorDiv.remove();
            }
        }, 5000);
    });
    
    // 添加页面可见性变化处理
    document.addEventListener('visibilitychange', function() {
        if (document.hidden) {
            console.log('页面被隐藏');
            // 页面被隐藏时暂停音乐
            if (musicData.isPlaying) {
                audio.pause();
                // 注意：这里不改变musicData.isPlaying状态，以便页面重新可见时恢复播放
            }
        } else {
            console.log('页面重新可见');
            // 页面重新可见时恢复播放
            if (musicData.isPlaying && audio.paused) {
                audio.play().catch(e => {
                    console.error('恢复播放失败:', e);
                    musicData.isPlaying = false;
                    if (playIcon) playIcon.className = 'fas fa-play';
                });
            }
        }
    });
</script>

// ... 后面的HTML部分保持不变 ...
</body>
</html>`;
  
  fs.writeFileSync(filePath, html);
}

// 执行主函数
if (require.main === module) {
  fetchMusicFiles();
}

module.exports = fetchMusicFiles;
