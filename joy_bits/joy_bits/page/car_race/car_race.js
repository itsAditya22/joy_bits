frappe.pages['car-race'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __('Turbo Highway Racer'),
		single_column: true
	});

	new FrappeCarRacer(page);
};

class FrappeCarRacer {
	constructor(page) {
		this.page = page;
		this.wrapper = $(this.page.body);
		this.storageKey = `frappe_car_race_${frappe.session.user || 'guest'}`;

		this.width = 420;
		this.height = 600;
		this.roadLeft = 50;
		this.roadRight = 370;
		this.roadWidth = 320;
		this.laneCount = 4;
		this.laneWidth = this.roadWidth / this.laneCount;

		this.running = false;
		this.paused = false;
		this.gameOver = false;
		this.score = 0;
		this.highScore = 0;
		this.coins = 0;
		this.speed = 6;
		this.baseSpeed = 6;
		this.maxSpeed = 15;
		this.nitro = 100;
		this.isNitroActive = false;
		this.roadOffset = 0;
		this.muted = false;

		this.player = {
			x: 190,
			y: 470,
			w: 44,
			h: 82,
			vx: 0,
			maxVx: 6.5,
			color: '#38bdf8'
		};
		this.traffic = [];
		this.pickups = [];
		this.particles = [];
		this.keys = { left: false, right: false, up: false, down: false, nitro: false };

		this.audioCtx = null;
		this.rafId = null;

		this.loadState();
		this.setupPageActions();
		this.injectStyles();
		this.renderLayout();
		this.initCanvas();
		this.bindEvents();
		this.drawIdleScreen();
	}

	setupPageActions() {
		this.page.set_primary_action(__('Start / Restart Race'), () => {
			this.playSound('start');
			this.startGame();
		}, 'play');

		this.pauseBtn = this.page.add_inner_button(__('⏸ Pause'), () => {
			this.togglePause();
		});

		this.muteBtn = this.page.add_inner_button(this.muted ? __('🔇 Unmute') : __('🔊 Mute'), () => {
			this.muted = !this.muted;
			this.saveState();
			this.muteBtn.text(this.muted ? __('🔇 Unmute') : __('🔊 Mute'));
		});

		this.page.add_inner_button(__('Reset High Score'), () => {
			frappe.confirm(__('Reset your personal racing record?'), () => {
				this.highScore = 0;
				this.saveState();
				this.updateHud();
				frappe.show_alert({ message: __('High score reset!'), indicator: 'blue' });
			});
		});
	}

	injectStyles() {
		if ($('#frappe-car-race-styles').length) return;

		const styles = `
			<style id="frappe-car-race-styles">
				.cr-desk-container {
					background: radial-gradient(circle at top, #1e293b 0%, #090d16 100%);
					border-radius: 16px;
					padding: 24px 16px;
					margin-top: 12px;
					color: #f8fafc;
					display: flex;
					flex-direction: column;
					align-items: center;
					box-shadow: 0 20px 50px rgba(0,0,0,0.45);
					user-select: none;
				}
				.cr-hud {
					width: 100%;
					max-width: 420px;
					display: grid;
					grid-template-columns: repeat(4, 1fr);
					gap: 8px;
					margin-bottom: 14px;
				}
				.cr-stat-box {
					background: rgba(15, 23, 42, 0.8);
					border: 1px solid rgba(255,255,255,0.08);
					border-radius: 12px;
					padding: 8px 10px;
					text-align: center;
				}
				.cr-stat-label {
					font-size: 10px;
					text-transform: uppercase;
					letter-spacing: 0.7px;
					color: #94a3b8;
					display: block;
				}
				.cr-stat-val {
					font-size: 18px;
					font-weight: 800;
					color: #f8fafc;
				}
				.cr-nitro-bar-wrap {
					width: 100%;
					max-width: 420px;
					background: rgba(15, 23, 42, 0.85);
					border: 1px solid rgba(255,255,255,0.1);
					border-radius: 999px;
					height: 14px;
					padding: 2px;
					margin-bottom: 14px;
					display: flex;
					align-items: center;
				}
				.cr-nitro-fill {
					height: 100%;
					width: 100%;
					border-radius: 999px;
					background: linear-gradient(90deg, #06b6d4, #3b82f6, #8b5cf6);
					box-shadow: 0 0 12px rgba(59, 130, 246, 0.7);
					transition: width 0.08s linear;
				}
				.cr-canvas-wrap {
					position: relative;
					width: 420px;
					max-width: 100%;
					border-radius: 16px;
					overflow: hidden;
					border: 2px solid rgba(255,255,255,0.12);
					box-shadow: 0 15px 35px rgba(0,0,0,0.6);
				}
				#cr-canvas {
					display: block;
					width: 100%;
					height: auto;
					background: #111827;
				}
				.cr-overlay {
					position: absolute;
					inset: 0;
					background: rgba(9, 13, 22, 0.82);
					backdrop-filter: blur(6px);
					display: flex;
					flex-direction: column;
					align-items: center;
					justify-content: center;
					padding: 24px;
					text-align: center;
				}
				.cr-overlay.hidden {
					display: none;
				}
				.cr-title {
					font-size: 26px;
					font-weight: 900;
					margin-bottom: 6px;
					background: linear-gradient(90deg, #38bdf8, #818cf8);
					-webkit-background-clip: text;
					-webkit-text-fill-color: transparent;
				}
				.cr-sub {
					color: #94a3b8;
					font-size: 13px;
					margin-bottom: 20px;
				}
				.cr-start-btn {
					background: linear-gradient(135deg, #2563eb, #06b6d4);
					color: #fff;
					border: none;
					padding: 12px 28px;
					border-radius: 999px;
					font-weight: 700;
					font-size: 14px;
					cursor: pointer;
					box-shadow: 0 8px 20px rgba(37, 99, 235, 0.45);
					transition: transform 0.15s ease;
				}
				.cr-start-btn:hover {
					transform: translateY(-2px);
				}
				.cr-touch-controls {
					display: flex;
					gap: 10px;
					margin-top: 14px;
					width: 100%;
					max-width: 420px;
				}
				.cr-touch-btn {
					flex: 1;
					background: rgba(30, 41, 59, 0.85);
					border: 1px solid rgba(255,255,255,0.1);
					color: #e2e8f0;
					padding: 12px;
					border-radius: 12px;
					font-weight: 700;
					font-size: 14px;
					cursor: pointer;
					text-align: center;
				}
				.cr-touch-btn:active {
					background: #2563eb;
				}
			</style>
		`;
		$('head').append(styles);
	}

	renderLayout() {
		const driverName = (frappe.session.user_fullname || 'Driver').split(' ')[0];

		this.wrapper.html(`
			<div class="cr-desk-container">
				<div class="cr-hud">
					<div class="cr-stat-box">
						<span class="cr-stat-label">${frappe.utils.escape_html(driverName)}</span>
						<span class="cr-stat-val" id="cr-score">0</span>
					</div>
					<div class="cr-stat-box">
						<span class="cr-stat-label">Best</span>
						<span class="cr-stat-val" id="cr-high-score">${this.highScore}</span>
					</div>
					<div class="cr-stat-box">
						<span class="cr-stat-label">Speed</span>
						<span class="cr-stat-val" id="cr-speed">120 <small style="font-size:10px">km/h</small></span>
					</div>
					<div class="cr-stat-box">
						<span class="cr-stat-label">Coins</span>
						<span class="cr-stat-val" id="cr-coins" style="color:#facc15;">0</span>
					</div>
				</div>

				<div class="cr-nitro-bar-wrap" title="Nitro Boost (Hold Space or Shift)">
					<div class="cr-nitro-fill" id="cr-nitro-fill"></div>
				</div>

				<div class="cr-canvas-wrap">
					<canvas id="cr-canvas" width="${this.width}" height="${this.height}"></canvas>
					<div class="cr-overlay" id="cr-overlay">
						<div class="cr-title" id="cr-overlay-title">TURBO HIGHWAY</div>
						<div class="cr-sub" id="cr-overlay-sub">
							Use <b>Arrow Keys / WASD</b> to steer.<br>
							Hold <b>SPACE</b> or <b>SHIFT</b> for Nitro Boost!
						</div>
						<button class="cr-start-btn" id="cr-overlay-btn">🏁 Start Engine</button>
					</div>
				</div>

				<div class="cr-touch-controls">
					<button class="cr-touch-btn" id="cr-btn-left">◀ LEFT</button>
					<button class="cr-touch-btn" id="cr-btn-nitro">⚡ NITRO</button>
					<button class="cr-touch-btn" id="cr-btn-right">RIGHT ▶</button>
				</div>
			</div>
		`);
	}

	initCanvas() {
		this.canvas = this.wrapper.find('#cr-canvas')[0];
		this.ctx = this.canvas.getContext('2d');
	}

	bindEvents() {
		const self = this;

		this.wrapper.on('click', '#cr-overlay-btn', () => {
			this.playSound('start');
			this.startGame();
		});

		// Keyboard listeners
		this._keyDownHandler = (e) => {
			if (!this.wrapper.is(':visible')) return;
			if (['ArrowLeft', 'KeyA'].includes(e.code)) this.keys.left = true;
			if (['ArrowRight', 'KeyD'].includes(e.code)) this.keys.right = true;
			if (['ArrowUp', 'KeyW'].includes(e.code)) this.keys.up = true;
			if (['ArrowDown', 'KeyS'].includes(e.code)) this.keys.down = true;
			if (['Space', 'ShiftLeft', 'ShiftRight'].includes(e.code)) {
				this.keys.nitro = true;
				if (this.running) e.preventDefault();
			}
			if (e.code === 'KeyP' && this.running) this.togglePause();
		};

		this._keyUpHandler = (e) => {
			if (['ArrowLeft', 'KeyA'].includes(e.code)) this.keys.left = false;
			if (['ArrowRight', 'KeyD'].includes(e.code)) this.keys.right = false;
			if (['ArrowUp', 'KeyW'].includes(e.code)) this.keys.up = false;
			if (['ArrowDown', 'KeyS'].includes(e.code)) this.keys.down = false;
			if (['Space', 'ShiftLeft', 'ShiftRight'].includes(e.code)) this.keys.nitro = false;
		};

		$(window).on('keydown.frappeCarRace', this._keyDownHandler);$(window).on('keyup.frappeCarRace', this._keyUpHandler);

		// Touch / Mouse Hold Controls
		const bindHold = (selector, keyName) => {
			this.wrapper.on('mousedown touchstart', selector, (e) => {
				e.preventDefault();
				self.keys[keyName] = true;
			});
			this.wrapper.on('mouseup mouseleave touchend', selector, (e) => {
				e.preventDefault();
				self.keys[keyName] = false;
			});
		};

		bindHold('#cr-btn-left', 'left');
		bindHold('#cr-btn-right', 'right');
		bindHold('#cr-btn-nitro', 'nitro');
	}

	startGame() {
		if (this.rafId) cancelAnimationFrame(this.rafId);

		this.running = true;
		this.paused = false;
		this.gameOver = false;
		this.score = 0;
		this.coins = 0;
		this.speed = this.baseSpeed;
		this.nitro = 100;
		this.traffic = [];
		this.pickups = [];
		this.particles = [];

		this.player.x = this.width / 2 - this.player.w / 2;
		this.player.y = 470;

		this.wrapper.find('#cr-overlay').addClass('hidden');
		this.pauseBtn.text(__('⏸ Pause'));
		this.loop();
	}

	togglePause() {
		if (!this.running || this.gameOver) return;
		this.paused = !this.paused;
		this.pauseBtn.text(this.paused ? __('▶ Resume') : __('⏸ Pause'));

		if (this.paused) {
			this.wrapper.find('#cr-overlay-title').text('RACE PAUSED');
			this.wrapper.find('#cr-overlay-sub').html('Press <b>P</b> or click below to continue.');
			this.wrapper.find('#cr-overlay-btn').text('▶ Resume');
			this.wrapper.find('#cr-overlay').removeClass('hidden');
			// Override button click temporarily to resume
			this.wrapper.find('#cr-overlay-btn').off('click').on('click', () => {
				this.togglePause();
				this.bindOverlayStart();
			});
		} else {
			this.wrapper.find('#cr-overlay').addClass('hidden');
			this.loop();
		}
	}

	bindOverlayStart() {
		this.wrapper.find('#cr-overlay-btn').off('click').on('click', () => {
			this.playSound('start');
			this.startGame();
		});
	}

	loop() {
		if (!this.running || this.paused) return;

		this.update();
		this.render();

		if (this.running) {
			this.rafId = requestAnimationFrame(() => this.loop());
		}
	}

	update() {
		// Difficulty scaling
		const targetBase = Math.min(this.maxSpeed, this.baseSpeed + Math.floor(this.score / 400) * 0.6);

		// Nitro handling
		if (this.keys.nitro && this.nitro > 0) {
			this.isNitroActive = true;
			this.speed = targetBase * 1.65;
			this.nitro = Math.max(0, this.nitro - 0.65);
			this.spawnExhaust(true);
		} else {
			this.isNitroActive = false;
			this.speed = targetBase;
			this.nitro = Math.min(100, this.nitro + 0.18);
			if (Math.random() < 0.35) this.spawnExhaust(false);
		}

		// Steering
		if (this.keys.left) this.player.x -= this.player.maxVx;
		if (this.keys.right) this.player.x += this.player.maxVx;
		if (this.keys.up) this.player.y -= 3.5;
		if (this.keys.down) this.player.y += 3.5;

		// Clamp player inside road bounds
		this.player.x = Math.max(this.roadLeft + 8, Math.min(this.roadRight - this.player.w - 8, this.player.x));
		this.player.y = Math.max(120, Math.min(this.height - this.player.h - 16, this.player.y));

		// Scroll road lines
		this.roadOffset = (this.roadOffset + this.speed) % 60;

		// Score increment
		this.score += Math.round(this.speed * 0.25);

		// Spawn oncoming traffic
		if (Math.random() < 0.028 + (this.speed * 0.001)) {
			this.spawnTrafficCar();
		}

		// Spawn coins or nitro cells
		if (Math.random() < 0.018) {
			this.spawnPickup();
		}

		// Update traffic
		for (let i = this.traffic.length - 1; i >= 0; i--) {
			const car = this.traffic[i];
			car.y += this.speed - car.speed;

			if (this.checkCollision(this.player, car)) {
				this.handleCrash();
				return;
			}

			if (car.y > this.height + 100) {
				this.traffic.splice(i, 1);
				this.score += 25;
			}
		}

		// Update pickups
		for (let i = this.pickups.length - 1; i >= 0; i--) {
			const p = this.pickups[i];
			p.y += this.speed * 0.85;

			if (this.checkCollision(this.player, p)) {
				if (p.type === 'coin') {
					this.coins += 1;
					this.score += 100;
					this.playSound('coin');
				} else {
					this.nitro = Math.min(100, this.nitro + 35);
					this.playSound('nitro');
				}
				this.pickups.splice(i, 1);
				continue;
			}

			if (p.y > this.height + 50) {
				this.pickups.splice(i, 1);
			}
		}

		for (let i = this.particles.length - 1; i >= 0; i--) {
			const pt = this.particles[i];
			pt.x += pt.vx;
			pt.y += pt.vy;
			pt.alpha -= 0.035;
			if (pt.alpha <= 0) this.particles.splice(i, 1);
		}

		this.updateHud();
	}

	spawnTrafficCar() {
		const lane = Math.floor(Math.random() * this.laneCount);
		const laneCenterX = this.roadLeft + lane * this.laneWidth + this.laneWidth / 2;
		const w = 44;
		const h = 80;
		const x = laneCenterX - w / 2;

		// Prevent overlapping spawns
		const tooClose = this.traffic.some(c => Math.abs(c.y - (-100)) < 130 && Math.abs(c.x - x) < 50);
		if (tooClose) return;

		const palette = ['#ef4444', '#f97316', '#eab308', '#10b981', '#a855f7', '#ec4899'];
		this.traffic.push({
			x,
			y: -100,
			w,
			h,
			speed: 2 + Math.random() * 2.2,
			color: palette[Math.floor(Math.random() * palette.length)]
		});
	}

	spawnPickup() {
		const lane = Math.floor(Math.random() * this.laneCount);
		const x = this.roadLeft + lane * this.laneWidth + this.laneWidth / 2 - 14;
		const type = Math.random() < 0.72 ? 'coin' : 'nitro';
		this.pickups.push({ x, y: -40, w: 28, h: 28, type });
	}

	spawnExhaust(isNitro) {
		this.particles.push({
			x: this.player.x + this.player.w / 2 + (Math.random() * 10 - 5),
			y: this.player.y + this.player.h,
			vx: (Math.random() - 0.5) * 1.2,
			vy: 2 + Math.random() * 3,
			radius: isNitro ? 6 : 4,
			color: isNitro ? '#38bdf8' : '#94a3b8',
			alpha: 0.85
		});
	}

	checkCollision(a, b) {
		const pad = 5;
		return (
			a.x + pad < b.x + b.w - pad &&
			a.x + a.w - pad > b.x + pad &&
			a.y + pad < b.y + b.h - pad &&
			a.y + a.h - pad > b.y + pad
		);
	}

	handleCrash() {
		this.running = false;
		this.gameOver = true;
		this.playSound('crash');

		// Explosion particles
		for (let i = 0; i < 32; i++) {
			this.particles.push({
				x: this.player.x + this.player.w / 2,
				y: this.player.y + this.player.h / 2,
				vx: (Math.random() - 0.5) * 9,
				vy: (Math.random() - 0.5) * 9,
				radius: 4 + Math.random() * 5,
				color: i % 2 === 0 ? '#f43f5e' : '#facc15',
				alpha: 1
			});
		}
		this.render();

		let isNewRecord = false;
		if (this.score > this.highScore) {
			this.highScore = this.score;
			isNewRecord = true;
			this.saveState();
		}
		this.updateHud();

		this.bindOverlayStart();
		this.wrapper.find('#cr-overlay-title').text(isNewRecord ? '🏆 NEW HIGH SCORE!' : '💥 CRASHED!');
		this.wrapper.find('#cr-overlay-sub').html(
			`Final Score: <b>${this.score}</b> &bull; Coins: <b>${this.coins}</b>`
		);
		this.wrapper.find('#cr-overlay-btn').text('🔄 Race Again');
		this.wrapper.find('#cr-overlay').removeClass('hidden');

		frappe.show_alert({
			message: isNewRecord
				? __('New Personal Best: {0} pts!', [this.score])
				: __('Race Over! Score: {0}', [this.score]),
			indicator: isNewRecord ? 'green' : 'red'
		});
	}

	drawIdleScreen() {
		this.render();
	}

	render() {
		const ctx = this.ctx;
		ctx.clearRect(0, 0, this.width, this.height);

		// Grass / Shoulders
		ctx.fillStyle = '#064e3b';
		ctx.fillRect(0, 0, this.width, this.height);

		// Asphalt Road
		ctx.fillStyle = '#1e293b';
		ctx.fillRect(this.roadLeft, 0, this.roadWidth, this.height);

		// Red & White Curbs
		const curbW = 10;
		for (let y = -60; y < this.height + 60; y += 30) {
			const posY = y + (this.roadOffset % 30);
			const isAlt = Math.floor((y + this.roadOffset) / 30) % 2 === 0;
			ctx.fillStyle = isAlt ? '#ef4444' : '#f8fafc';
			ctx.fillRect(this.roadLeft - curbW, posY, curbW, 30);
			ctx.fillRect(this.roadRight, posY, curbW, 30);
		}

		// Lane Dividers
		ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
		ctx.lineWidth = 3;
		ctx.setLineDash([28, 32]);
		ctx.lineDashOffset = -this.roadOffset;

		for (let i = 1; i < this.laneCount; i++) {
			const lx = this.roadLeft + i * this.laneWidth;
			ctx.beginPath();
			ctx.moveTo(lx, 0);
			ctx.lineTo(lx, this.height);
			ctx.stroke();
		}
		ctx.setLineDash([]);

		// Draw Pickups
		for (const p of this.pickups) {
			ctx.save();
			if (p.type === 'coin') {
				ctx.fillStyle = '#facc15';
				ctx.shadowColor = '#facc15';
				ctx.shadowBlur = 12;
				ctx.beginPath();
				ctx.arc(p.x + 14, p.y + 14, 11, 0, Math.PI * 2);
				ctx.fill();
				ctx.fillStyle = '#713f12';
				ctx.font = 'bold 12px sans-serif';
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';
				ctx.fillText('$', p.x + 14, p.y + 15);
			} else {
				ctx.fillStyle = '#38bdf8';
				ctx.shadowColor = '#38bdf8';
				ctx.shadowBlur = 14;
				ctx.fillRect(p.x + 3, p.y + 3, 22, 22);
				ctx.fillStyle = '#0f172a';
				ctx.font = 'bold 13px sans-serif';
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';
				ctx.fillText('⚡', p.x + 14, p.y + 15);
			}
			ctx.restore();
		}

		// Draw Particles
		for (const pt of this.particles) {
			ctx.save();
			ctx.globalAlpha = Math.max(0, pt.alpha);
			ctx.fillStyle = pt.color;
			ctx.beginPath();
			ctx.arc(pt.x, pt.y, pt.radius, 0, Math.PI * 2);
			ctx.fill();
			ctx.restore();
		}

		// Draw Traffic Cars
		for (const car of this.traffic) {
			this.drawCar(car.x, car.y, car.w, car.h, car.color, false);
		}

		// Draw Player Car
		this.drawCar(this.player.x, this.player.y, this.player.w, this.player.h, this.player.color, true);
	}

	drawCar(x, y, w, h, color, isPlayer) {
		const ctx = this.ctx;
		ctx.save();

		// Glow for player
		if (isPlayer) {
			ctx.shadowColor = this.isNitroActive ? '#38bdf8' : 'rgba(0,0,0,0.6)';
			ctx.shadowBlur = this.isNitroActive ? 20 : 10;
		}

		// Tires
		ctx.fillStyle = '#090d16';
		ctx.fillRect(x - 3, y + 10, 5, 16);
		ctx.fillRect(x + w - 2, y + 10, 5, 16);
		ctx.fillRect(x - 3, y + h - 26, 5, 16);
		ctx.fillRect(x + w - 2, y + h - 26, 5, 16);

		// Chassis
		ctx.fillStyle = color;
		ctx.beginPath();
		ctx.roundRect(x, y, w, h, 10);
		ctx.fill();

		// Racing stripe for player
		if (isPlayer) {
			ctx.fillStyle = 'rgba(255,255,255,0.75)';
			ctx.fillRect(x + w / 2 - 3, y + 4, 6, h - 8);
		}

		// Windshield / Cabin
		ctx.fillStyle = '#0f172a';
		ctx.beginPath();
		ctx.roundRect(x + 6, y + 18, w - 12, h - 38, 6);
		ctx.fill();

		// Headlights
		ctx.fillStyle = '#fef08a';
		if (isPlayer) {
			ctx.fillRect(x + 5, y + 2, 8, 4);
			ctx.fillRect(x + w - 13, y + 2, 8, 4);
		} else {
			ctx.fillRect(x + 5, y + h - 6, 8, 4);
			ctx.fillRect(x + w - 13, y + h - 6, 8, 4);
		}

		ctx.restore();
	}

	updateHud() {
		this.wrapper.find('#cr-score').text(this.score);
		this.wrapper.find('#cr-high-score').text(this.highScore);
		this.wrapper.find('#cr-coins').text(this.coins);
		const kmh = Math.round(this.speed * 20);
		this.wrapper.find('#cr-speed').html(`${kmh} <small style="font-size:10px">km/h</small>`);
		this.wrapper.find('#cr-nitro-fill').css('width', `${this.nitro}%`);
	}

	playSound(type) {
		if (this.muted) return;
		try {
			const AudioContext = window.AudioContext || window.webkitAudioContext;
			if (!this.audioCtx) this.audioCtx = new AudioContext();
			if (this.audioCtx.state === 'suspended') this.audioCtx.resume();

			const now = this.audioCtx.currentTime;
			const tone = (freq, oscType, start, dur, gainVal = 0.1) => {
				const osc = this.audioCtx.createOscillator();
				const gain = this.audioCtx.createGain();
				osc.type = oscType;
				osc.frequency.setValueAtTime(freq, start);
				gain.gain.setValueAtTime(gainVal, start);
				gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
				osc.connect(gain);
				gain.connect(this.audioCtx.destination);
				osc.start(start);
				osc.stop(start + dur);
			};

			if (type === 'coin') {
				tone(880, 'sine', now, 0.08, 0.12);
				tone(1318.5, 'sine', now + 0.07, 0.15, 0.12);
			} else if (type === 'nitro') {
				tone(320, 'sawtooth', now, 0.1, 0.09);
				tone(640, 'sawtooth', now + 0.08, 0.18, 0.1);
			} else if (type === 'start') {
				tone(220, 'triangle', now, 0.12, 0.12);
				tone(440, 'triangle', now + 0.1, 0.2, 0.12);
			} else if (type === 'crash') {
				tone(110, 'sawtooth', now, 0.35, 0.18);
				tone(75, 'square', now + 0.05, 0.4, 0.15);
			}
		} catch (e) {}
	}

	loadState() {
		try {
			const raw = localStorage.getItem(this.storageKey);
			if (raw) {
				const parsed = JSON.parse(raw);
				this.highScore = parsed.highScore || 0;
				this.muted = Boolean(parsed.muted);
			}
		} catch (e) {}
	}

	saveState() {
		try {
			localStorage.setItem(this.storageKey, JSON.stringify({
				highScore: this.highScore,
				muted: this.muted
			}));
		} catch (e) {}
	}
}