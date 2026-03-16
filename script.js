const canvas = document.getElementById('game-canvas');
const ctx = canvas ? canvas.getContext('2d') : null;
const nextPieceCanvas = document.getElementById('next-piece-canvas');
const nextPieceCtx = nextPieceCanvas ? nextPieceCanvas.getContext('2d') : null;

if (!ctx || !nextPieceCtx) {
    console.error("Erro crítico: Canvas não encontrado ou contexto 2D não suportado.");
}

const scoreValue = document.getElementById('score-value');
const bestScoreValue = document.getElementById('best-score-value');
const levelValue = document.getElementById('level-value');
const finalScore = document.getElementById('final-score');
const gameOverBestScore = document.getElementById('game-over-best-score');
const newRecordLabel = document.getElementById('new-record');
const gameOverOverlay = document.getElementById('game-over');
const restartButton = document.getElementById('restart-button');

// Game Constants
const GRID_WIDTH = 10;
const GRID_HEIGHT = 20;
let SQ = 30;

const SHAPES = {
    I: [[1, 1, 1, 1]],
    O: [[1, 1], [1, 1]],
    T: [[0, 1, 0], [1, 1, 1]],
    S: [[0, 1, 1], [1, 1, 0]],
    Z: [[1, 1, 0], [0, 1, 1]],
    J: [[1, 0, 0], [1, 1, 1]],
    L: [[0, 0, 1], [1, 1, 1]]
};

const COLORS = {
    I: '#00ffff',
    O: '#ffff00',
    T: '#ff00ff',
    S: '#00ff00',
    Z: '#ff0000',
    J: '#0080ff',
    L: '#ff8800'
};

const SHAPE_NAMES = Object.keys(SHAPES);

// Audio setup
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

const audio = {};
try {
    audio.move = new Audio('move.mp3');
    audio.rotate = new Audio('rotate.mp3');
    audio.drop = new Audio('drop.mp3');
    audio.destroy = new Audio('destroy.mp3');
    audio.gameover = new Audio('gameover.mp3');
} catch (e) {
    console.warn("Áudio não suportado:", e);
}

function synthesizeSound(type) {
    try {
        if (!AudioContext) return;
        if (!audioCtx) audioCtx = new AudioContext();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        const now = audioCtx.currentTime;

        switch(type) {
            case 'move':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(440, now);
                osc.frequency.exponentialRampToValueAtTime(880, now + 0.05);
                gain.gain.setValueAtTime(0.05, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
                osc.start(now); osc.stop(now + 0.05);
                break;
            case 'rotate':
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(660, now);
                osc.frequency.exponentialRampToValueAtTime(330, now + 0.08);
                gain.gain.setValueAtTime(0.05, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
                osc.start(now); osc.stop(now + 0.08);
                break;
            case 'drop':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(220, now);
                gain.gain.setValueAtTime(0.03, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
                osc.start(now); osc.stop(now + 0.03);
                break;
            case 'destroy':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(880, now);
                osc.frequency.exponentialRampToValueAtTime(1760, now + 0.15);
                gain.gain.setValueAtTime(0.08, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
                osc.start(now); osc.stop(now + 0.15);
                break;
            case 'gameover':
                const notes = [440, 349, 311, 261];
                notes.forEach((freq, i) => {
                    const startTime = now + (i * 0.15);
                    const o = audioCtx.createOscillator();
                    const g = audioCtx.createGain();
                    o.type = 'square';
                    o.frequency.setValueAtTime(freq, startTime);
                    o.connect(g); g.connect(audioCtx.destination);
                    g.gain.setValueAtTime(0.1, startTime);
                    g.gain.exponentialRampToValueAtTime(0.001, startTime + 0.15);
                    o.start(startTime); o.stop(startTime + 0.15);
                });
                break;
        }
    } catch (e) {
        console.warn("Erro ao sintetizar som:", e);
    }
}

function playSound(name) {
    const s = audio[name];
    if (s && s.readyState >= 2) {
        s.currentTime = 0;
        s.play().catch(() => synthesizeSound(name));
    } else {
        synthesizeSound(name);
    }
}

// Game State
let grid = [];
let score = 0;
let level = 1;
let bestScore = 0;
let isGameOver = false;
let currentPiece = null;
let nextPiece = null;
let dropCounter = 0;
let dropInterval = 800;
let lastTime = 0;
let animationId = null; // Para controlar o loop

// Funções de Persistência Seguras
function loadPersistedState() {
    try {
        score = parseInt(localStorage.getItem('cosmoblock-current-score')) || 0;
        level = parseInt(localStorage.getItem('cosmoblock-current-level')) || 1;
        bestScore = parseInt(localStorage.getItem('cosmoblock-best-score')) || 0;
        
        // Carregar estado do meteoro
        const savedMeteorHp = localStorage.getItem('cosmoblock-meteor-hp');
        if (savedMeteorHp) meteorHp = parseFloat(savedMeteorHp);
        
        const savedMeteorY = localStorage.getItem('cosmoblock-meteor-y');
        if (savedMeteorY) meteorY = parseFloat(savedMeteorY);
        
        const savedGrid = localStorage.getItem('cosmoblock-current-grid');
        if (savedGrid) {
            const parsed = JSON.parse(savedGrid);
            if (Array.isArray(parsed) && parsed.length === GRID_HEIGHT && Array.isArray(parsed[0]) && parsed[0].length === GRID_WIDTH) {
                grid = parsed;
                return;
            }
        }
    } catch (e) {
        console.error("Erro ao carregar estado:", e);
    }
    // Fallback para grid limpo
    grid = Array.from({ length: GRID_HEIGHT }, () => Array(GRID_WIDTH).fill(null));
}

function saveGameState() {
    try {
        localStorage.setItem('cosmoblock-current-score', score);
        localStorage.setItem('cosmoblock-current-level', level);
        localStorage.setItem('cosmoblock-current-grid', JSON.stringify(grid));
        localStorage.setItem('cosmoblock-meteor-hp', meteorHp);
        localStorage.setItem('cosmoblock-meteor-y', meteorY);
    } catch (e) {
        console.error("Erro ao salvar estado:", e);
    }
}

// Meteor & Planet state
let meteorY = -150;
let meteorSpeed = 0.08;
let meteorMaxHp = 100;
let meteorHp = 100;
let meteorRotation = 0;
let earthRotation = 0;

const METEOR_TYPES = [
    { name: 'rocha', color: '#a0522d', aura: 'rgba(160, 82, 45, 0.4)', imagePath: 'meteoro-rocha01.png' },
    { name: 'metal', color: '#bdc3c7', aura: 'rgba(189, 195, 199, 0.4)', imagePath: 'meteoro-metal02.png' },
    { name: 'cristal', color: '#a5f2f3', aura: 'rgba(165, 242, 243, 0.4)', imagePath: 'meteoro-cristal03.png' },
    { name: 'lava', color: '#e74c3c', aura: 'rgba(231, 76, 60, 0.4)', imagePath: 'meteoro-lava04.png' },
    { name: 'plasma', color: '#9b59b6', aura: 'rgba(155, 89, 182, 0.5)', imagePath: 'meteoro-lava04.png' },
    { name: 'gelo', color: '#3498db', aura: 'rgba(52, 152, 219, 0.5)', imagePath: 'meteoro-cristal03.png' },
    { name: 'ouro', color: '#f1c40f', aura: 'rgba(241, 196, 15, 0.5)', imagePath: 'meteoro-metal02.png' },
    { name: 'vazio', color: '#2c3e50', aura: 'rgba(44, 62, 80, 0.6)', imagePath: 'meteoro-rocha01.png' }
];

const THEMES = [
    { name: 'Espaço Profundo', bg: '#0a0e27', grid: '#00ffff', stars: '#ffffff' },
    { name: 'Nebulosa de Fogo', bg: '#270a0a', grid: '#ff4d4d', stars: '#ff9999' },
    { name: 'Galáxia Esmeralda', bg: '#0a270f', grid: '#4dff88', stars: '#99ffbb' },
    { name: 'Vazio Púrpura', bg: '#1a0a27', grid: '#b366ff', stars: '#d9b3ff' },
    { name: 'Cinturão de Ouro', bg: '#27220a', grid: '#ffcc00', stars: '#fff0b3' },
    { name: 'Oceano Estelar', bg: '#0a1f27', grid: '#33ccff', stars: '#b3ecff' },
    { name: 'Supernova', bg: '#27140a', grid: '#ff8c1a', stars: '#ffd9b3' },
    { name: 'Dimensão X', bg: '#000000', grid: '#ffffff', stars: '#cccccc' },
    { name: 'Núcleo Galáctico', bg: '#1a1a1a', grid: '#ff00ff', stars: '#ffb3ff' },
    { name: 'Infinito', bg: '#050510', grid: '#00ffcc', stars: '#ccfff5' }
];

function getCurrentTheme() {
    const themeIndex = Math.min(Math.max(0, Math.floor((level - 1) / 10)), THEMES.length - 1);
    return THEMES[themeIndex];
}

const earthImage = new Image(); earthImage.src = 'terra.png';
const meteorImages = {};
METEOR_TYPES.forEach(type => { const img = new Image(); img.src = type.imagePath; meteorImages[type.name] = img; });

let particles = [];
let stars = [];
let shootingStars = [];

function createStars() {
    stars = [];
    for(let i = 0; i < 150; i++) {
        stars.push({ 
            x: Math.random() * canvas.width, 
            y: Math.random() * canvas.height, 
            size: Math.random() * 2 + 0.5, 
            opacity: Math.random(),
            speed: Math.random() * 0.2 + 0.05 // Velocidade de descida
        });
    }
}

function createShootingStar() {
    if (Math.random() > 0.98) { // Chance pequena de aparecer a cada frame
        shootingStars.push({
            x: Math.random() * canvas.width,
            y: -20,
            vx: (Math.random() - 0.5) * 15,
            vy: Math.random() * 10 + 5,
            length: Math.random() * 80 + 20,
            opacity: 1
        });
    }
}

function updateStars() {
    stars.forEach(star => {
        star.y += star.speed;
        if (star.y > canvas.height) {
            star.y = -5;
            star.x = Math.random() * canvas.width;
        }
    });

    createShootingStar();
    shootingStars = shootingStars.filter(s => s.opacity > 0);
    shootingStars.forEach(s => {
        s.x += s.vx;
        s.y += s.vy;
        s.opacity -= 0.01;
    });
}

function init(resetAll = false) {
    if (animationId) cancelAnimationFrame(animationId);
    
    // Resetar variáveis de jogo antes de carregar
    meteorY = -150;
    meteorHp = 100;
    meteorMaxHp = 100;
    meteorSpeed = 0.08;

    if (resetAll) {
        score = 0; level = 1;
        grid = Array.from({ length: GRID_HEIGHT }, () => Array(GRID_WIDTH).fill(null));
        localStorage.removeItem('cosmoblock-current-grid');
        localStorage.removeItem('cosmoblock-meteor-hp');
        localStorage.removeItem('cosmoblock-meteor-y');
        saveGameState();
    } else {
        loadPersistedState();
    }
    
    isGameOver = false;
    dropInterval = Math.max(100, 800 - (level * 20));
    
    // Ajustar hp máximo baseado no nível se não foi resetado
    meteorMaxHp = 100 + (level * 10);
    if (resetAll || !localStorage.getItem('cosmoblock-meteor-hp')) {
        meteorHp = meteorMaxHp;
        meteorSpeed = 0.05 + (level * 0.01);
    }
    
    bestScoreValue.innerText = bestScore;
    updateUI();
    
    nextPiece = createRandomPiece();
    spawnPiece();
    
    gameOverOverlay.classList.remove('active');
    lastTime = performance.now();
    animationId = requestAnimationFrame(gameLoop);
}

function spawnPiece() {
    currentPiece = nextPiece || createRandomPiece();
    nextPiece = createRandomPiece();
    drawNextPiece();
    if (checkCollision(currentPiece)) endGame();
}

function createRandomPiece() {
    const name = SHAPE_NAMES[Math.floor(Math.random() * SHAPE_NAMES.length)];
    const shape = SHAPES[name];
    return { name, shape, color: COLORS[name], x: Math.floor(GRID_WIDTH / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function drawNextPiece() {
    if (!nextPieceCtx || !nextPiece) return;
    
    // Ajustar o tamanho interno do canvas de visualização para alta resolução
    nextPieceCanvas.width = 80;
    nextPieceCanvas.height = 80;
    
    nextPieceCtx.clearRect(0, 0, nextPieceCanvas.width, nextPieceCanvas.height);
    const shape = nextPiece.shape;
    const size = 20; // Ajustado para o canvas de 80px
    
    const offsetX = (nextPieceCanvas.width - shape[0].length * size) / 2;
    const offsetY = (nextPieceCanvas.height - shape.length * size) / 2;
    
    shape.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value) {
                const px = offsetX + x * size;
                const py = offsetY + y * size;
                
                // Desenhar bloco principal
                nextPieceCtx.fillStyle = nextPiece.color;
                nextPieceCtx.fillRect(px, py, size - 2, size - 2);
                
                // Adicionar brilho superior
                nextPieceCtx.fillStyle = 'rgba(255, 255, 255, 0.4)';
                nextPieceCtx.fillRect(px, py, size - 2, (size - 2) / 3);
                
                // Bordas
                nextPieceCtx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                nextPieceCtx.lineWidth = 1;
                nextPieceCtx.strokeRect(px, py, size - 2, size - 2);
            }
        });
    });
}

function checkCollision(piece, moveX = 0, moveY = 0) {
    for (let y = 0; y < piece.shape.length; y++) {
        for (let x = 0; x < piece.shape[y].length; x++) {
            if (piece.shape[y][x]) {
                const newX = piece.x + x + moveX;
                const newY = piece.y + y + moveY;
                if (newX < 0 || newX >= GRID_WIDTH || newY >= GRID_HEIGHT || (newY >= 0 && grid[newY][newX])) return true;
            }
        }
    }
    return false;
}

function lockPiece() {
    currentPiece.shape.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value) {
                const gridY = currentPiece.y + y;
                if (gridY >= 0) grid[gridY][currentPiece.x + x] = currentPiece.color;
            }
        });
    });
    clearLines();
    saveGameState();
    spawnPiece();
}

function clearLines() {
    let linesCleared = 0;
    for (let y = GRID_HEIGHT - 1; y >= 0; y--) {
        if (grid[y].every(cell => cell !== null)) {
            const centerX = canvas.width / 2;
            const gridPixelHeight = GRID_HEIGHT * SQ;
            const startY = (canvas.height - gridPixelHeight) / 2;
            const clearY = startY + (y * SQ);
            grid.splice(y, 1);
            grid.unshift(Array(GRID_WIDTH).fill(null));
            linesCleared++;
            y++;
            createParticles(1, centerX, clearY, '#00ffff');
        }
    }
    if (linesCleared > 0) {
        score += linesCleared * 100 * level;
        meteorHp -= linesCleared * 25;
        meteorY -= linesCleared * 50;
        if (meteorY < -150) meteorY = -150;
        playSound('destroy');
        if (meteorHp <= 0) {
            level++;
            meteorMaxHp += 50;
            meteorHp = meteorMaxHp;
            meteorSpeed = 0.05 + (level * 0.05);
            meteorY = -150;
        }
        updateUI();
        saveGameState();
    }
}

function updateUI() { scoreValue.innerText = score; levelValue.innerText = level; }

function endGame() {
    isGameOver = true; finalScore.innerText = score; playSound('gameover');
    canvas.classList.add('shake'); setTimeout(() => canvas.classList.remove('shake'), 300);
    if (score > bestScore) {
        bestScore = score; localStorage.setItem('cosmoblock-best-score', bestScore);
        newRecordLabel.style.display = 'block';
    } else { newRecordLabel.style.display = 'none'; }
    gameOverBestScore.innerText = bestScore; gameOverOverlay.classList.add('active');
    score = 0; level = 1; grid = Array.from({ length: GRID_HEIGHT }, () => Array(GRID_WIDTH).fill(null));
    localStorage.removeItem('cosmoblock-current-grid'); saveGameState();
}

function drawBlock(x, y, color, isGhost = false) {
    if (isGhost) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)'; ctx.fillRect(x + 1, y + 1, SQ - 2, SQ - 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'; ctx.lineWidth = 1; ctx.strokeRect(x + 1, y + 1, SQ - 2, SQ - 2);
    } else {
        ctx.fillStyle = color; ctx.fillRect(x + 1, y + 1, SQ - 2, SQ - 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)'; ctx.fillRect(x + 1, y + 1, SQ - 2, (SQ - 2) / 3);
        ctx.strokeStyle = '#ffffff88'; ctx.lineWidth = 1; ctx.strokeRect(x + 1, y + 1, SQ - 2, SQ - 2);
    }
}

function drawSpaceBackground() {
    if (!ctx) return;
    const centerX = canvas.width / 2; const theme = getCurrentTheme();
    const earthRadius = Math.min(canvas.width * 0.45, 160); const earthY = canvas.height - earthRadius * 0.35;
    earthRotation += 0.005;
    const astralGrad = ctx.createRadialGradient(centerX, earthY, earthRadius * 0.8, centerX, earthY, earthRadius * 1.5);
    astralGrad.addColorStop(0, theme.grid + '88'); astralGrad.addColorStop(0.5, theme.grid + '33'); astralGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = astralGrad; ctx.beginPath(); ctx.arc(centerX, earthY, earthRadius * 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.translate(centerX, earthY); ctx.rotate(earthRotation);
    if (earthImage.complete && earthImage.naturalWidth !== 0) ctx.drawImage(earthImage, -earthRadius, -earthRadius, earthRadius * 2, earthRadius * 2);
    ctx.restore();
    meteorY += meteorSpeed; meteorRotation += 0.025;
    if (meteorY > earthY - earthRadius * 0.5) endGame();
    const meteorIndex = (level - 1) % METEOR_TYPES.length;
    const currentMeteorType = METEOR_TYPES[meteorIndex]; const currentMeteorImg = meteorImages[currentMeteorType.name];
    const mSize = 60 + (level * 0.5);
    const mGlow = ctx.createRadialGradient(centerX, meteorY, mSize * 0.5, centerX, meteorY, mSize * 1.8);
    mGlow.addColorStop(0, currentMeteorType.aura); mGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = mGlow; ctx.beginPath(); ctx.arc(centerX, meteorY, mSize * 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.translate(centerX, meteorY); ctx.rotate(meteorRotation);
    if (currentMeteorImg.complete && currentMeteorImg.naturalWidth !== 0) ctx.drawImage(currentMeteorImg, -mSize, -mSize, mSize * 2, mSize * 2);
    ctx.restore();
    // Barra de Vida Compacta e Vibrante (Amarelo -> Vermelho)
    const barWidth = 120; 
    const barHeight = 8; 
    const barX = centerX - barWidth / 2; 
    const barY = meteorY - mSize - 20;
    
    // 1. Fundo da barra (vazio)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.beginPath();
    ctx.roundRect(barX, barY, barWidth, barHeight, 4);
    ctx.fill();
    
    // Borda fina
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 2. Preenchimento da Vida
    const lifeRatio = meteorHp / meteorMaxHp;
    if (lifeRatio > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(barX, barY, barWidth * lifeRatio, barHeight, 4);
        ctx.clip();

        // Degradê horizontal de Amarelo para Vermelho
        const lifeGrad = ctx.createLinearGradient(barX, 0, barX + barWidth, 0);
        lifeGrad.addColorStop(0, '#ff0000'); // Vermelho no início (dano)
        lifeGrad.addColorStop(1, '#ffff00'); // Amarelo no final (vida cheia)
        
        ctx.fillStyle = lifeGrad;
        ctx.fillRect(barX, barY, barWidth * lifeRatio, barHeight);

        // Brilho suave
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.fillRect(barX, barY, barWidth * lifeRatio, barHeight / 2);

        ctx.restore();
    }
}

function createParticles(count, x, y, color = '#00ffff') {
    for (let i = 0; i < count * 10; i++) {
        particles.push({ x, y, vx: (Math.random() - 0.5) * 10, vy: (Math.random() - 0.5) * 10, life: 1.0, size: Math.random() * 3 + 1, color });
    }
}

function updateAndDrawParticles() {
    particles = particles.filter(p => p.life > 0);
    particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.life -= 0.02; ctx.globalAlpha = p.life; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); });
    ctx.globalAlpha = 1;
}

function draw() {
    if (!ctx) return;
    const theme = getCurrentTheme();
    updateStars(); // Atualiza movimento das estrelas

    // Fundo espacial com gradiente profundo
    const bgGrad = ctx.createRadialGradient(canvas.width/2, canvas.height/2, 0, canvas.width/2, canvas.height/2, canvas.width);
    bgGrad.addColorStop(0, theme.bg);
    bgGrad.addColorStop(1, '#000');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Estrelas em movimento
    stars.forEach(star => {
        ctx.globalAlpha = star.opacity * (0.6 + Math.random() * 0.4);
        ctx.fillStyle = theme.stars;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();
    });

    // Estrelas cadentes
    shootingStars.forEach(s => {
        ctx.globalAlpha = s.opacity;
        const grad = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * 2, s.y - s.vy * 2);
        grad.addColorStop(0, '#fff');
        grad.addColorStop(1, 'transparent');
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - s.vx * 2, s.y - s.vy * 2);
        ctx.stroke();
    });
    ctx.globalAlpha = 1;

    drawSpaceBackground();
    const gridPixelWidth = GRID_WIDTH * SQ; const gridPixelHeight = GRID_HEIGHT * SQ;
    const startX = (canvas.width - gridPixelWidth) / 2; const startY = (canvas.height - gridPixelHeight) / 2;
    ctx.fillStyle = 'rgba(10, 14, 39, 0.6)'; ctx.fillRect(startX, startY, gridPixelWidth, gridPixelHeight);
    ctx.strokeStyle = theme.grid; ctx.lineWidth = 2; ctx.strokeRect(startX, startY, gridPixelWidth, gridPixelHeight);
    grid.forEach((row, y) => { row.forEach((color, x) => { if (color) drawBlock(startX + x * SQ, startY + y * SQ, color); }); });
    if (currentPiece) {
        let ghostY = currentPiece.y;
        while (!checkCollision(currentPiece, 0, ghostY - currentPiece.y + 1)) ghostY++;
        currentPiece.shape.forEach((row, y) => { row.forEach((value, x) => { if (value) drawBlock(startX + (currentPiece.x + x) * SQ, startY + (ghostY + y) * SQ, 'rgba(255, 255, 255, 0.2)', true); }); });
        currentPiece.shape.forEach((row, y) => { row.forEach((value, x) => { if (value) drawBlock(startX + (currentPiece.x + x) * SQ, startY + (currentPiece.y + y) * SQ, currentPiece.color); }); });
    }
    updateAndDrawParticles();
}

function gameLoop(time = 0) {
    if (isGameOver) return;
    const deltaTime = time - lastTime;
    lastTime = time;
    dropCounter += deltaTime;
    if (dropCounter > dropInterval) {
        if (!checkCollision(currentPiece, 0, 1)) {
            currentPiece.y++;
        } else {
            lockPiece();
        }
        dropCounter = 0;
    }
    draw();
    animationId = requestAnimationFrame(gameLoop);
}

function movePiece(dx, dy) {
    if (!checkCollision(currentPiece, dx, dy)) { currentPiece.x += dx; currentPiece.y += dy; if (dx !== 0) playSound('move'); if (dy > 0) playSound('drop'); } else if (dy > 0) { lockPiece(); }
}

function rotate() {
    const rotated = currentPiece.shape[0].map((_, i) => currentPiece.shape.map(row => row[i]).reverse());
    const originalShape = currentPiece.shape; currentPiece.shape = rotated;
    if (checkCollision(currentPiece)) { currentPiece.shape = originalShape; } else { playSound('rotate'); }
}

function hardDrop() {
    if (isGameOver || !currentPiece) return;
    let ghostY = currentPiece.y; while (!checkCollision(currentPiece, 0, ghostY - currentPiece.y + 1)) ghostY++;
    currentPiece.y = ghostY; lockPiece(); playSound('drop');
}

window.addEventListener('keydown', e => {
    if (isGameOver) return;
    if (e.key === 'ArrowLeft') movePiece(-1, 0); if (e.key === 'ArrowRight') movePiece(1, 0);
    if (e.key === 'ArrowDown') movePiece(0, 1); if (e.key === 'ArrowUp') rotate(); if (e.key === ' ') hardDrop();
});

let touchStartX = 0;
let touchStartY = 0;
let touchMoveX = 0;
let touchMoveY = 0;
let touchMoved = false;

canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchMoved = false;
}, { passive: false });

canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    touchMoveX = e.touches[0].clientX;
    touchMoveY = e.touches[0].clientY;
    touchMoved = true;

    const deltaX = touchMoveX - touchStartX;
    const deltaY = touchMoveY - touchStartY;

    // Movimento horizontal mais sensível
    if (Math.abs(deltaX) > SQ * 0.6) { // Reduzido de 1.0 para 0.6 para maior sensibilidade
        movePiece(deltaX > 0 ? 1 : -1, 0);
        touchStartX = touchMoveX; 
    }

    // Soft drop mais responsivo
    if (deltaY > SQ * 0.5) { // Reduzido de 1.0 para 0.5
        movePiece(0, 1);
        touchStartY = touchMoveY;
    }
}, { passive: false });

canvas.addEventListener('touchend', e => {
    if (isGameOver) return;
    e.preventDefault();
    // Se não houve movimento significativo, foi um toque (tap)
    if (!touchMoved) {
        rotate(); // Qualquer toque fora do botão agora rotaciona
    }
}, { passive: false });

const hardDropBtn = document.getElementById('btn-hard-drop');
if (hardDropBtn) {
    // Usar touchstart e mousedown para garantir que funcione em tudo
    const handleHardDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isGameOver) hardDrop();
    };
    hardDropBtn.addEventListener('touchstart', handleHardDrop, { passive: false });
    hardDropBtn.addEventListener('mousedown', handleHardDrop);
}

restartButton.addEventListener('click', () => init(true));

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    // Garantir que a área de jogo caiba na tela
    const availableWidth = canvas.width - 20;
    const availableHeight = canvas.height - 220; // Espaço para controles touch
    
    SQ = Math.min(
        Math.floor(availableWidth / GRID_WIDTH),
        Math.floor(availableHeight / GRID_HEIGHT),
        30
    );
    
    // Mínimo para não desaparecer em telas muito pequenas
    SQ = Math.max(SQ, 15);
    
    // Recriar estrelas para o novo tamanho de tela
    createStars();
}
window.addEventListener('resize', resize); resize();

function unlockAudio() {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    window.removeEventListener('touchstart', unlockAudio); window.removeEventListener('click', unlockAudio);
}
window.addEventListener('touchstart', unlockAudio); window.addEventListener('click', unlockAudio);

// Salvar estado ao fechar ou atualizar (Desktop)
window.addEventListener('beforeunload', () => {
    saveGameState();
});

init();