frappe.pages['snake-game'].on_page_load = function(wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __('Snake Pro'),
		single_column: true
	});

	page.set_primary_action(__('New Game'), () => {
		if (window.frappeSnake) window.frappeSnake.startOrRestart();
	}, 'refresh');

	page.add_inner_button(__('Reset High Score'), () => {
		frappe.confirm(__('Are you sure you want to reset your High Score?'), () => {
			if (window.frappeSnake) window.frappeSnake.resetHighScore();
			frappe.show_alert({ message: __('High Score Reset!'), indicator: 'orange' });
		});
	});

	$(page.body).html(`
		<style>
			.frappe-snake-wrapper {
				--bg-dark: #0B0F17;
				--panel-bg: #151C28;
				--emerald: #00F59B;
				--cyan: #00D2FF;
				--crimson: #FF2A85;
				--gold: #FFB800;
				--text-main: #F8FAFC;
				--text-muted: #94A3B8;
				background: radial-gradient(circle at center, #111827 0%, #0B0F17 100%);
				color: var(--text-main);
				border-radius: 14px;
				padding: 20px;
				margin: 10px auto;
				max-width: 900px;
				box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
				border: 1px solid rgba(255, 255, 255, 0.08);
				user-select: none;
			}
			.snk-top-bar {
				display: flex;
				flex-wrap: wrap;
				justify-content: space-between;
				align-items: center;
				gap: 12px;
				margin-bottom: 16px;
			}
			.snk-stats {
				display: flex;
				gap: 12px;
				flex-wrap: wrap;
			}
			.snk-stat-card {
				background: rgba(21, 28, 40, 0.85);
				border: 1px solid rgba(255, 255, 255, 0.1);
				border-radius: 10px;
				padding: 8px 16px;
				min-width: 105px;
				text-align: center;
			}
			.snk-stat-label {
				font-size: 11px;
				text-transform: uppercase;
				letter-spacing: 0.08em;
				color: var(--text-muted);
				display: block;
			}
			.snk-stat-value {
				font-size: 20px;
				font-weight: 700;
				font-family: monospace;
				color: var(--emerald);
			}
			.snk-stat-value.gold { color: var(--gold); }
			.snk-stat-value.cyan { color: var(--cyan); }
			.snk-controls-bar {
				display: flex;
				flex-wrap: wrap;
				gap: 8px;
				align-items: center;
			}
			.snk-pill-group {
				display: inline-flex;
				background: #151C28;
				padding: 3px;
				border-radius: 8px;
				border: 1px solid rgba(255,255,255,0.1);
			}
			.snk-pill-btn {
				background: transparent;
				border: none;
				color: var(--text-muted);
				font-size: 12px;
				font-weight: 600;
				padding: 5px 10px;
				border-radius: 6px;
				cursor: pointer;
				transition: all 0.15s;
			}
			.snk-pill-btn.active {
				background: var(--emerald);
				color: #062115;
			}
			.snk-arena-wrap {
				position: relative;
				width: 100%;
				max-width: 520px;
				aspect-ratio: 1 / 1;
				margin: 0 auto;
				border-radius: 12px;
				overflow: hidden;
				background: #0B0F17;
				transition: box-shadow 0.25s, border-color 0.25s;
			}
			.snk-arena-wrap.wall-classic {
				border: 2px solid var(--crimson);
				box-shadow: 0 0 20px rgba(255, 42, 133, 0.25);
			}
			.snk-arena-wrap.wall-portal {
				border: 2px dashed var(--cyan);
				box-shadow: 0 0 20px rgba(0, 210, 255, 0.25);
			}
			#frappe-snake-canvas {
				width: 100%;
				height: 100%;
				display: block;
			}
			.snk-overlay {
				position: absolute;
				inset: 0;
				background: rgba(11, 15, 23, 0.86);
				backdrop-filter: blur(6px);
				display: flex;
				flex-direction: column;
				align-items: center;
				justify-content: center;
				text-align: center;
				padding: 24px;
				z-index: 10;
			}
			.snk-overlay.hidden { display: none; }
			.snk-overlay h2 {
				color: #fff;
				font-weight: 800;
				font-size: 28px;
				margin-bottom: 6px;
			}
			.snk-overlay p {
				color: var(--text-muted);
				font-size: 14px;
				margin-bottom: 18px;
			}
			.snk-btn-main {
				background: linear-gradient(135deg, var(--emerald), var(--cyan));
				color: #051B14;
				font-weight: 700;
				border: none;
				padding: 10px 26px;
				border-radius: 999px;
				font-size: 14px;
				cursor: pointer;
				box-shadow: 0 4px 15px rgba(0, 245, 155, 0.35);
			}
			.snk-dpad {
				display: grid;
				grid-template-columns: repeat(3, 52px);
				grid-template-rows: repeat(2, 46px);
				gap: 6px;
				justify-content: center;
				margin-top: 16px;
			}
			.snk-dpad-btn {
				background: #151C28;
				border: 1px solid rgba(255,255,255,0.12);
				color: #fff;
				border-radius: 8px;
				font-size: 16px;
				cursor: pointer;
			}
			.snk-dpad-btn:active {
				background: var(--emerald);
				color: #000;
			}
		</style>

		<div class="frappe-snake-wrapper">
			<div class="snk-top-bar">
				<div class="snk-stats">
					<div class="snk-stat-card">
						<span class="snk-stat-label">Score</span>
						<span class="snk-stat-value" id="snk-score">0</span>
					</div>
					<div class="snk-stat-card">
						<span class="snk-stat-label">Best</span>
						<span class="snk-stat-value gold" id="snk-best">0</span>
					</div>
					<div class="snk-stat-card">
						<span class="snk-stat-label">Length</span>
						<span class="snk-stat-value cyan" id="snk-length">3</span>
					</div>
				</div>

				<div class="snk-controls-bar">
					<div class="snk-pill-group" id="snk-mode-group">
						<button class="snk-pill-btn active" data-mode="classic">Classic Walls</button>
						<button class="snk-pill-btn" data-mode="portal">Portal Walls</button>
					</div>
					<div class="snk-pill-group" id="snk-speed-group">
						<button class="snk-pill-btn" data-speed="135">Slow</button>
						<button class="snk-pill-btn active" data-speed="95">Norm</button>
						<button class="snk-pill-btn" data-speed="65">Fast</button>
					</div>
					<button class="snk-pill-btn" id="snk-pause-btn" style="background:#151C28;border:1px solid rgba(255,255,255,0.12);">Pause</button>
				</div>
			</div>

			<div class="snk-arena-wrap wall-classic" id="snk-arena">
				<canvas id="frappe-snake-canvas" width="520" height="520"></canvas>
				<div class="snk-overlay" id="snk-overlay">
					<h2 id="snk-ov-title">NEON SNAKE PRO</h2>
					<p id="snk-ov-desc">Use Arrow Keys, WASD, or On-Screen Controls to Steer</p>
					<button class="snk-btn-main" id="snk-start-btn">START GAME</button>
				</div>
			</div>

			<div class="snk-dpad">
				<div></div>
				<button class="snk-dpad-btn" data-dir="UP">▲</button>
				<div></div>
				<button class="snk-dpad-btn" data-dir="LEFT">◀</button>
				<button class="snk-dpad-btn" data-dir="DOWN">▼</button>
				<button class="snk-dpad-btn" data-dir="RIGHT">▶</button>
			</div>
		</div>
	`);

	initFrappeSnakeGame(wrapper);
};

function initFrappeSnakeGame(wrapper) {
	const GRID = 20;
	const canvas = wrapper.querySelector('#frappe-snake-canvas');
	const ctx = canvas.getContext('2d');
	const CELL = canvas.width / GRID;

	const scoreEl = wrapper.querySelector('#snk-score');
	const bestEl = wrapper.querySelector('#snk-best');
	const lengthEl = wrapper.querySelector('#snk-length');
	const overlay = wrapper.querySelector('#snk-overlay');
	const ovTitle = wrapper.querySelector('#snk-ov-title');
	const ovDesc = wrapper.querySelector('#snk-ov-desc');
	const startBtn = wrapper.querySelector('#snk-start-btn');
	const pauseBtn = wrapper.querySelector('#snk-pause-btn');
	const arena = wrapper.querySelector('#snk-arena');

	const STORAGE_KEY = 'frappe_neon_snake_best_v1';
	let bestScore = parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10);
	bestEl.textContent = bestScore;

	let snake = [];
	let dir = { x: 1, y: 0 };
	let queue = [];
	let food = { x: 10, y: 10 };
	let score = 0;
	let speed = 95;
	let wallMode = 'classic';
	let state = 'IDLE'; // IDLE, RUNNING, PAUSED, OVER
	let timer = null;

	function spawnFood() {
		let pos;
		do {
			pos = {
				x: Math.floor(Math.random() * GRID),
				y: Math.floor(Math.random() * GRID)
			};
		} while (snake.some(seg => seg.x === pos.x && seg.y === pos.y));
		food = pos;
	}

	function resetGame() {
		clearInterval(timer);
		snake = [
			{ x: 9, y: 10 },
			{ x: 8, y: 10 },
			{ x: 7, y: 10 }
		];
		dir = { x: 1, y: 0 };
		queue = [];
		score = 0;
		scoreEl.textContent = '0';
		lengthEl.textContent = '3';
		spawnFood();
		state = 'RUNNING';
		overlay.classList.add('hidden');
		pauseBtn.textContent = 'Pause';
		timer = setInterval(tick, speed);
		draw();
	}

	function tick() {
		if (state !== 'RUNNING') return;

		if (queue.length > 0) {
			dir = queue.shift();
		}

		let head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

		if (wallMode === 'portal') {
			head.x = (head.x + GRID) % GRID;
			head.y = (head.y + GRID) % GRID;
		} else {
			if (head.x < 0 || head.x >= GRID || head.y < 0 || head.y >= GRID) {
				return gameOver('Crashed into the perimeter wall!');
			}
		}

		if (snake.some(seg => seg.x === head.x && seg.y === head.y)) {
			return gameOver('Collided with your own tail!');
		}

		snake.unshift(head);

		if (head.x === food.x && head.y === food.y) {
			score += 10;
			scoreEl.textContent = score;
			lengthEl.textContent = snake.length;
			if (score > bestScore) {
				bestScore = score;
				bestEl.textContent = bestScore;
				localStorage.setItem(STORAGE_KEY, String(bestScore));
			}
			spawnFood();
		} else {
			snake.pop();
		}

		draw();
	}

	function gameOver(reason) {
		clearInterval(timer);
		state = 'OVER';
		ovTitle.textContent = 'GAME OVER';
		ovDesc.textContent = `${reason} • Final Score: ${score}`;
		startBtn.textContent = 'PLAY AGAIN';
		overlay.classList.remove('hidden');
		frappe.show_alert({ message: `Game Over! Score: ${score}`, indicator: 'red' });
	}

	function draw() {
		ctx.fillStyle = '#0B0F17';
		ctx.fillRect(0, 0, canvas.width, canvas.height);

		// Subtle Grid
		ctx.strokeStyle = 'rgba(255,255,255,0.03)';
		for (let i = 0; i <= GRID; i++) {
			ctx.beginPath();
			ctx.moveTo(i * CELL, 0);
			ctx.lineTo(i * CELL, canvas.height);
			ctx.stroke();
			ctx.beginPath();
			ctx.moveTo(0, i * CELL);
			ctx.lineTo(canvas.width, i * CELL);
			ctx.stroke();
		}

		// Food
		ctx.fillStyle = '#FF2A85';
		ctx.beginPath();
		ctx.arc((food.x + 0.5) * CELL, (food.y + 0.5) * CELL, CELL * 0.38, 0, Math.PI * 2);
		ctx.fill();

		// Snake
		snake.forEach((seg, idx) => {
			ctx.fillStyle = idx === 0 ? '#00F59B' : '#00D2FF';
			ctx.fillRect(seg.x * CELL + 2, seg.y * CELL + 2, CELL - 4, CELL - 4);
		});
	}

	function queueDirection(newDir) {
		const last = queue.length > 0 ? queue[queue.length - 1] : dir;
		if (last.x + newDir.x === 0 && last.y + newDir.y === 0) return;
		if (queue.length < 2) queue.push(newDir);
	}

	// Keyboard Handler (Only active when on snake-game route)
	$(document).on('keydown.frappe_snake', (e) => {
		if (frappe.get_route()[0] !== 'snake-game') return;
		const map = {
			ArrowUp: { x: 0, y: -1 }, KeyW: { x: 0, y: -1 },
			ArrowDown: { x: 0, y: 1 }, KeyS: { x: 0, y: 1 },
			ArrowLeft: { x: -1, y: 0 }, KeyA: { x: -1, y: 0 },
			ArrowRight: { x: 1, y: 0 }, KeyD: { x: 1, y: 0 }
		};
		if (map[e.code]) {
			e.preventDefault();
			queueDirection(map[e.code]);
		}
	});

	startBtn.addEventListener('click', resetGame);

	pauseBtn.addEventListener('click', () => {
		if (state === 'RUNNING') {
			state = 'PAUSED';
			pauseBtn.textContent = 'Resume';
			ovTitle.textContent = 'PAUSED';
			ovDesc.textContent = 'Press Resume to continue';
			startBtn.textContent = 'RESUME';
			overlay.classList.remove('hidden');
		} else if (state === 'PAUSED') {
			state = 'RUNNING';
			pauseBtn.textContent = 'Pause';
			overlay.classList.add('hidden');
		}
	});

	// Wall Mode Toggle
	wrapper.querySelectorAll('#snk-mode-group .snk-pill-btn').forEach(btn => {
		btn.addEventListener('click', () => {
			wrapper.querySelectorAll('#snk-mode-group .snk-pill-btn').forEach(b => b.classList.remove('active'));
			btn.classList.add('active');
			wallMode = btn.dataset.mode;
			arena.className = `snk-arena-wrap wall-${wallMode}`;
		});
	});

	// Speed Toggle
	wrapper.querySelectorAll('#snk-speed-group .snk-pill-btn').forEach(btn => {
		btn.addEventListener('click', () => {
			wrapper.querySelectorAll('#snk-speed-group .snk-pill-btn').forEach(b => b.classList.remove('active'));
			btn.classList.add('active');
			speed = parseInt(btn.dataset.speed, 10);
			if (state === 'RUNNING') {
				clearInterval(timer);
				timer = setInterval(tick, speed);
			}
		});
	});

	// On-Screen D-Pad
	wrapper.querySelectorAll('.snk-dpad-btn').forEach(btn => {
		btn.addEventListener('click', () => {
			const d = btn.dataset.dir;
			if (d === 'UP') queueDirection({ x: 0, y: -1 });
			if (d === 'DOWN') queueDirection({ x: 0, y: 1 });
			if (d === 'LEFT') queueDirection({ x: -1, y: 0 });
			if (d === 'RIGHT') queueDirection({ x: 1, y: 0 });
		});
	});

	draw();

	// Expose helper methods for Frappe Page Header Buttons
	window.frappeSnake = {
		startOrRestart: resetGame,
		resetHighScore: () => {
			bestScore = 0;
			bestEl.textContent = '0';
			localStorage.removeItem(STORAGE_KEY);
		}
	};
}