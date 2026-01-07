const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

// 配置参数 - 通过环境变量设置
const GITHUB_REPO = process.env.GITHUB_REPO || 'username/repo'; // 格式: owner/repo
const MUSIC_PATH = process.env.MUSIC_PATH || 'music'; // 仓库中的音乐文件夹路径
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || ''; // GitHub token (可选，用于提高API限制)
const BRANCH = process.env.BRANCH || 'main';

async function fetchMusicFiles() {
  try {
    console.log('正在获取音乐文件列表...');
    console.log(`仓库: ${GITHUB_REPO}`);
    console.log(`路径: ${MUSIC_PATH}`);
    console.log(`分支: ${BRANCH}`);
    
    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Vercel-Music-Player'
    };
    
    if (GITHUB_TOKEN) {
      headers['Authorization'] = `token ${GITHUB_TOKEN}`;
    }
    
    // 获取仓库内容
    const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${MUSIC_PATH}?ref=${BRANCH}`;
    console.log(`API URL: ${apiUrl}`);
    
    const response = await fetch(apiUrl, { headers });
    
    if (!response.ok) {
      throw new Error(`GitHub API 错误: ${response.status} ${response.statusText}`);
    }
    
    const files = await response.json();
    
    // 过滤音乐文件
    const musicExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'];
    const musicFiles = files.filter(file => {
      if (file.type !== 'file') return false;
      const ext = path.extname(file.name).toLowerCase();
      return musicExtensions.includes(ext);
    });
    
    console.log(`找到 ${musicFiles.length} 个音乐文件`);
    
    // 生成音乐列表数据
    const musicList = musicFiles.map(file => {
      // 使用GitHub的raw内容URL
      const rawUrl = `https://raw.githubusercontent.com/${GITHUB_REPO}/${BRANCH}/${MUSIC_PATH}/${encodeURIComponent(file.name)}`;
      
      return {
        name: file.name,
        url: rawUrl,
        size: file.size,
        type: getContentType(path.extname(file.name)),
        displayName: path.basename(file.name, path.extname(file.name)).replace(/_/g, ' ')
      };
    });
    
    // 排序：按文件名排序
    musicList.sort((a, b) => a.name.localeCompare(b.name));
    
    // 将音乐列表写入public目录
    const publicDir = path.join(__dirname, '../public');
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    
    // 生成音乐列表JSON文件
    fs.writeFileSync(
      path.join(publicDir, 'music-list.json'),
      JSON.stringify(musicList, null, 2)
    );
    
    console.log('音乐列表已生成:', musicList.length, '首歌曲');
    
    // 如果index.html不存在，创建默认的
    const indexPath = path.join(publicDir, 'index.html');
    if (!fs.existsSync(indexPath)) {
      createDefaultIndexHtml(indexPath, musicList);
      console.log('已创建默认 index.html');
    }
    
  } catch (error) {
    console.error('获取音乐文件时出错:', error);
    // 创建空列表作为后备
    const publicDir = path.join(__dirname, '../public');
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    
    fs.writeFileSync(
      path.join(publicDir, 'music-list.json'),
      JSON.stringify([], null, 2)
    );
    
    const indexPath = path.join(publicDir, 'index.html');
    if (!fs.existsSync(indexPath)) {
      createDefaultIndexHtml(indexPath, []);
      console.log('已创建默认 index.html（无音乐文件）');
    }
  }
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

function createDefaultIndexHtml(filePath, musicList) {
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GitHub 音乐播放器</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            color: #fff;
            min-height: 100vh;
            padding: 20px;
            line-height: 1.6;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        
        header {
            text-align: center;
            margin-bottom: 40px;
            padding-top: 20px;
        }
        
        h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
            background: linear-gradient(45deg, #4cc9f0, #4361ee);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        
        .subtitle {
            color: #a0a0c0;
            font-size: 1.1rem;
            margin-bottom: 30px;
        }
        
        .music-player {
            background: rgba(30, 30, 46, 0.8);
            border-radius: 20px;
            padding: 30px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
            backdrop-filter: blur(10px);
            margin-bottom: 40px;
        }
        
        .player-controls {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 30px;
            margin-bottom: 30px;
            flex-wrap: wrap;
        }
        
        .control-btn {
            background: #4361ee;
            border: none;
            width: 60px;
            height: 60px;
            border-radius: 50%;
            color: white;
            font-size: 1.5rem;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .control-btn:hover {
            background: #3a56d4;
            transform: scale(1.05);
        }
        
        .control-btn:active {
            transform: scale(0.95);
        }
        
        .progress-container {
            flex-grow: 1;
            max-width: 600px;
        }
        
        .progress-bar {
            width: 100%;
            height: 6px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 3px;
            overflow: hidden;
            margin-bottom: 10px;
            cursor: pointer;
        }
        
        .progress {
            height: 100%;
            background: linear-gradient(90deg, #4cc9f0, #4361ee);
            width: 0%;
            transition: width 0.1s linear;
        }
        
        .time-info {
            display: flex;
            justify-content: space-between;
            font-size: 0.9rem;
            color: #a0a0c0;
        }
        
        .current-song {
            text-align: center;
            font-size: 1.3rem;
            margin-bottom: 20px;
            min-height: 32px;
        }
        
        .current-song span {
            background: rgba(67, 97, 238, 0.2);
            padding: 8px 20px;
            border-radius: 50px;
            display: inline-block;
        }
        
        .playlist {
            background: rgba(30, 30, 46, 0.8);
            border-radius: 20px;
            padding: 30px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
            backdrop-filter: blur(10px);
        }
        
        .playlist h2 {
            margin-bottom: 20px;
            font-size: 1.8rem;
            color: #4cc9f0;
        }
        
        .playlist-item {
            padding: 15px 20px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            cursor: pointer;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: 15px;
        }
        
        .playlist-item:hover {
            background: rgba(255, 255, 255, 0.05);
            transform: translateX(5px);
        }
        
        .playlist-item.active {
            background: rgba(67, 97, 238, 0.2);
            border-left: 4px solid #4361ee;
        }
        
        .playlist-item i {
            color: #4cc9f0;
            width: 24px;
        }
        
        .song-title {
            flex-grow: 1;
        }
        
        .song-duration {
            color: #a0a0c0;
            font-size: 0.9rem;
        }
        
        .empty-playlist {
            text-align: center;
            padding: 40px;
            color: #a0a0c0;
            font-size: 1.1rem;
        }
        
        .empty-playlist i {
            font-size: 3rem;
            margin-bottom: 20px;
            opacity: 0.5;
        }
        
        .volume-container {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-top: 20px;
        }
        
        .volume-slider {
            width: 100px;
        }
        
        footer {
            text-align: center;
            margin-top: 40px;
            padding: 20px;
            color: #a0a0c0;
            font-size: 0.9rem;
        }
        
        footer a {
            color: #4cc9f0;
            text-decoration: none;
        }
        
        @media (max-width: 768px) {
            .player-controls {
                flex-direction: column;
                gap: 20px;
            }
            
            .progress-container {
                width: 100%;
            }
            
            .control-btn {
                width: 70px;
                height: 70px;
            }
            
            h1 {
                font-size: 2rem;
            }
        }
        
        .loading {
            display: flex;
            justify-content: center;
            align-items: center;
            height: 200px;
            font-size: 1.2rem;
            color: #a0a0c0;
        }
        
        .loading i {
            margin-right: 10px;
            animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1><i class="fas fa-music"></i> GitHub 音乐播放器</h1>
            <p class="subtitle">直接播放 GitHub 仓库中的音乐文件</p>
        </header>
        
        <main>
            <div class="music-player">
                <div class="current-song" id="current-song">
                    <span>请选择一首歌曲</span>
                </div>
                
                <div class="player-controls">
                    <button class="control-btn" id="prev-btn" title="上一首">
                        <i class="fas fa-step-backward"></i>
                    </button>
                    
                    <button class="control-btn" id="play-btn" title="播放">
                        <i class="fas fa-play"></i>
                    </button>
                    
                    <button class="control-btn" id="next-btn" title="下一首">
                        <i class="fas fa-step-forward"></i>
                    </button>
                    
                    <div class="progress-container">
                        <div class="progress-bar" id="progress-bar">
                            <div class="progress" id="progress"></div>
                        </div>
                        <div class="time-info">
                            <span id="current-time">0:00</span>
                            <span id="duration">0:00</span>
                        </div>
                    </div>
                    
                    <div class="volume-container">
                        <i class="fas fa-volume-up"></i>
                        <input type="range" min="0" max="1" step="0.01" value="0.7" class="volume-slider" id="volume-slider">
                    </div>
                </div>
            </div>
            
            <div class="playlist">
                <h2><i class="fas fa-list"></i> 播放列表</h2>
                <div id="playlist-container">
                    <div class="loading">
                        <i class="fas fa-spinner"></i> 正在加载音乐列表...
                    </div>
                </div>
            </div>
        </main>
        
        <footer>
            <p>音乐文件来自 GitHub 仓库: <span id="repo-name">${process.env.GITHUB_REPO || '未配置'}</span></p>
            <p>最后更新: <span id="last-updated">${new Date().toLocaleString('zh-CN')}</span></p>
        </footer>
    </div>
    
    <audio id="audio-player" preload="metadata"></audio>
    
    <script>
        // 全局变量
        let currentTrackIndex = 0;
        let musicList = [];
        let isPlaying = false;
        let audio = document.getElementById('audio-player');
        
        // DOM 元素
        const playBtn = document.getElementById('play-btn');
        const prevBtn = document.getElementById('prev-btn');
        const nextBtn = document.getElementById('next-btn');
        const progressBar = document.getElementById('progress-bar');
        const progress = document.getElementById('progress');
        const currentTimeEl = document.getElementById('current-time');
        const durationEl = document.getElementById('duration');
        const currentSongEl = document.getElementById('current-song');
        const playlistContainer = document.getElementById('playlist-container');
        const volumeSlider = document.getElementById('volume-slider');
        
        // 加载音乐列表
        async function loadMusicList() {
            try {
                const response = await fetch('/music-list.json');
                if (!response.ok) throw new Error('无法加载音乐列表');
                
                musicList = await response.json();
                renderPlaylist();
                
                // 如果有音乐文件，自动播放第一首
                if (musicList.length > 0) {
                    loadTrack(0);
                } else {
                    playlistContainer.innerHTML = '<div class="empty-playlist"><i class="fas fa-music"></i><p>未找到音乐文件</p></div>';
                }
            } catch (error) {
                console.error('加载音乐列表失败:', error);
                playlistContainer.innerHTML = '<div class="empty-playlist"><i class="fas fa-exclamation-triangle"></i><p>无法加载音乐列表，请检查配置</p></div>';
            }
        }
        
        // 渲染播放列表
        function renderPlaylist() {
            playlistContainer.innerHTML = '';
            
            if (musicList.length === 0) {
                playlistContainer.innerHTML = '<div class="empty-playlist"><i class="fas fa-music"></i><p>未找到音乐文件</p></div>';
                return;
            }
            
            musicList.forEach((track, index) => {
                const item = document.createElement('div');
                item.className = 'playlist-item';
                if (index === currentTrackIndex) {
                    item.classList.add('active');
                }
                
                item.innerHTML = \`
                    <i class="fas fa-music"></i>
                    <div class="song-title">\${track.displayName}</div>
                    <div class="song-duration">\${formatTime(track.duration || 0)}</div>
                \`;
                
                item.addEventListener('click', () => {
                    loadTrack(index);
                    playTrack();
                });
                
                playlistContainer.appendChild(item);
            });
        }
        
        // 加载指定曲目
        function loadTrack(index) {
            if (index < 0 || index >= musicList.length) return;
            
            // 更新当前曲目索引
            currentTrackIndex = index;
            
            // 设置音频源
            const track = musicList[index];
            audio.src = track.url;
            audio.type = track.type || 'audio/mpeg';
            
            // 更新当前歌曲显示
            currentSongEl.innerHTML = \`<span>\${track.displayName}</span>\`;
            
            // 更新播放列表高亮
            renderPlaylist();
            
            // 加载元数据
            audio.addEventListener('loadedmetadata', function() {
                durationEl.textContent = formatTime(audio.duration);
                // 更新音乐列表中的时长信息
                if (!musicList[index].duration) {
                    musicList[index].duration = audio.duration;
                }
            }, { once: true });
        }
        
        // 播放/暂停
        function togglePlay() {
            if (musicList.length === 0) return;
            
            if (isPlaying) {
                pauseTrack();
            } else {
                playTrack();
            }
        }
        
        // 播放
        function playTrack() {
            if (musicList.length === 0) return;
            
            audio.play();
            isPlaying = true;
            playBtn.innerHTML = '<i class="fas fa-pause"></i>';
            playBtn.title = '暂停';
        }
        
        // 暂停
        function pauseTrack() {
            audio.pause();
            isPlaying = false;
            playBtn.innerHTML = '<i class="fas fa-play"></i>';
            playBtn.title = '播放';
        }
        
        // 下一首
        function nextTrack() {
            if (musicList.length === 0) return;
            
            currentTrackIndex = (currentTrackIndex + 1) % musicList.length;
            loadTrack(currentTrackIndex);
            playTrack();
        }
        
        // 上一首
        function prevTrack() {
            if (musicList.length === 0) return;
            
            currentTrackIndex = (currentTrackIndex - 1 + musicList.length) % musicList.length;
            loadTrack(currentTrackIndex);
            playTrack();
        }
        
        // 更新进度条
        function updateProgress() {
            const { currentTime, duration } = audio;
            const progressPercent = (currentTime / duration) * 100;
            progress.style.width = \`\${progressPercent}%\`;
            
            currentTimeEl.textContent = formatTime(currentTime);
        }
        
        // 设置进度
        function setProgress(e) {
            const width = this.clientWidth;
            const clickX = e.offsetX;
            const duration = audio.duration;
            
            audio.currentTime = (clickX / width) * duration;
        }
        
        // 格式化时间 (秒 -> MM:SS)
        function formatTime(seconds) {
            if (isNaN(seconds)) return '0:00';
            
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return \`\${mins}:\${secs < 10 ? '0' : ''}\${secs}\`;
        }
        
        // 设置音量
        function setVolume() {
            audio.volume = this.value;
        }
        
        // 事件监听器
        playBtn.addEventListener('click', togglePlay);
        prevBtn.addEventListener('click', prevTrack);
        nextBtn.addEventListener('click', nextTrack);
        audio.addEventListener('timeupdate', updateProgress);
        audio.addEventListener('ended', nextTrack);
        progressBar.addEventListener('click', setProgress);
        volumeSlider.addEventListener('input', setVolume);
        
        // 初始化音量
        audio.volume = volumeSlider.value;
        
        // 键盘快捷键
        document.addEventListener('keydown', (e) => {
            // 空格键: 播放/暂停
            if (e.code === 'Space') {
                e.preventDefault();
                togglePlay();
            }
            
            // 右箭头: 下一首
            if (e.code === 'ArrowRight' && e.ctrlKey) {
                e.preventDefault();
                nextTrack();
            }
            
            // 左箭头: 上一首
            if (e.code === 'ArrowLeft' && e.ctrlKey) {
                e.preventDefault();
                prevTrack();
            }
            
            // 上箭头: 增加音量
            if (e.code === 'ArrowUp' && e.ctrlKey) {
                e.preventDefault();
                volumeSlider.value = Math.min(1, parseFloat(volumeSlider.value) + 0.1);
                setVolume.call(volumeSlider);
            }
            
            // 下箭头: 减少音量
            if (e.code === 'ArrowDown' && e.ctrlKey) {
                e.preventDefault();
                volumeSlider.value = Math.max(0, parseFloat(volumeSlider.value) - 0.1);
                setVolume.call(volumeSlider);
            }
        });
        
        // 页面加载完成后加载音乐列表
        document.addEventListener('DOMContentLoaded', loadMusicList);
    </script>
</body>
</html>`;
  
  fs.writeFileSync(filePath, html);
}

// 执行主函数
if (require.main === module) {
  fetchMusicFiles();
}

module.exports = fetchMusicFiles;
