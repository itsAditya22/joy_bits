frappe.pages['gun-game'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __('CQB Tactical Firearms Simulator'),
		single_column: true
	});

	new FrappeTacticalShooter(page);
};

class FrappeTacticalShooter {
	constructor(page) {
		this.page = page;
		this.wrapper = $(this.page.body);
		this.storageKey = `frappe_tactical_gun_${frappe.session.user || 'guest'}`;

		this.width = 640;
		this.height = 400;

		this.running = false;
		this.gameOver = false;
		this.score = 0;
		this.highScore = 0;
		this.ammo = 30;
		this.maxAmmo = 30;
		this.isReloading = false;
		this.fatigue = 0;
		this.breathing = 0;

		this.threats = [];
		this.impacts = [];
		this.muzzleFlashTimer = 0;
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
		this.page.set_primary_action(__('Deploy Range'), () => {
			this.playSound('bolt');
			this.startGame();
		}, 'shield');

		this.muteBtn = this.page.add_inner_button(this.muted ? __('🔇 Unmute Audio') : __('🔊 Mute Audio'), () => {
			this.muted = !this.muted;
			this.saveState();
			this.muteBtn.text(this.muted ? __('🔇 Unmute Audio') : __('🔊 Mute Audio'));
		});

		this.page.add_inner_button(__('Reset Record'), () => {
			frappe.confirm(__('Reset your personal tactical record?'), () => {
				this.highScore = 0;
				this.saveState();
				this.updateHud();
				frappe.show_alert({ message: __('Tactical record wiped!'), indicator: 'blue' });
			});
		});
	}

	injectStyles() {
		if ($('#frappe-tac-gun-styles').length) return;

		const styles = `
			<style id="frappe-tac-gun-styles">
				.tac-desk-wrap {
					background: radial-gradient(circle at top, #0f172a 0%, #020617 100%);
					border-radius: 16px;
					padding: 24px 16px;
					margin-top: 12px;
					color: #f8fafc;
					display: flex;
					flex-direction: column;
					align-items: center;
					box-shadow: 0 20px 50px rgba(0,0,0,0.6);
					user-select: none;
				}
				.tac-hud {
					width: 100%;
					max-width: 640px;
					display: grid;
					grid-template-columns: repeat(4, 1fr);
					gap: 10px;
					margin-bottom: 14px;
				}
				.tac-stat-box {
					background: rgba(15, 23, 42, 0.85);
					border: 1px solid rgba(255,255,255,0.08);
					border-radius: 12px;
					padding: 10px;
					text-align: center;
					border-top: 3px solid #3b82f6;
				}
				.tac-stat-label {
					font-size: 10px;
					text-transform: uppercase;
					letter-spacing: 0.8px;
					color: #94a3b8;
					display: block;
				}
				.tac-stat-val {
					font-size: 18px;
					font-weight: 800;
					color: #f8fafc;
					font-family: monospace;
				}
				.tac-canvas-wrap {
					position: relative;
					width: 640px;
					max-width: 100%;
					border-radius: 16px;
					overflow: hidden;
					border: 2px solid rgba(255,255,255,0.12);
					box-shadow: 0 20px 40px rgba(0,0,0,0.8);
					cursor: crosshair;
				}
				#tac-canvas {
					display: block;
					width: 100%;
					height: auto;
					background: #090d16;
				}
				.tac-overlay {
					position: absolute;
					inset: 0;
					background: rgba(2, 6, 23, 0.9);
					backdrop-filter: blur(8px);
					display: flex;
					flex-direction: column;
					align-items: center;
					justify-content: center;
					padding: 24px;
					text-align: center;
				}
				.tac-overlay.hidden {
					display: none;
				}
				.tac-title {
					font-size: 28px;
					font-weight: 900;
					letter-spacing: 1.5px;
					margin-bottom: 6px;
					color: #f8fafc;
					text-transform: uppercase;
					border-bottom: 2px solid #ef4444;
					padding-bottom: 4px;
				}
				.tac-sub {
					color: #94a3b8;
					font-size: 13px;
					line-height: 1.5;
					margin-bottom: 20px;
					max-width: 440px;
				}
				.tac-start-btn {
					background: linear-gradient(135deg, #1e293b, #0f172a);
					border: 1px solid #ef4444;
					color: #ef4444;
					padding: 12px 32px;
					border-radius: 8px;
					font-weight: 800;
					font-size: 13px;
					letter-spacing: 1px;
					cursor: pointer;
					box-shadow: 0 8px 20px rgba(239, 68, 68, 0.25);
					transition: all 0.2s ease;
					text-transform: uppercase;
				}
				.tac-start-btn:hover {
					background: #ef4444;
					color: #fff;
				}
				.tac-toolbar {
					display: flex;
					gap: 10px;
					margin-top: 14px;
					width: 100%;
					max-width: 640px;
				}
				.tac-action-btn {
					flex: 1;
					background: rgba(30, 41, 59, 0.85);
					border: 1px solid rgba(255,255,255,0.1);
					color: #e2e8f0;
					padding: 12px;
					border-radius: 12px;
					font-weight: 700;
					font-size: 13px;
					cursor: pointer;
					text-align: center;
				}
				.tac-action-btn:active {
					background: #334155;
				}
			</style>
		`;
		$('head').append(styles);
	}

	renderLayout() {
		this.wrapper.html(
			'<div class="tac-desk-wrap">' +
				'<div class="tac-hud">' +
					'<div class="tac-stat-box"><span class="tac-stat-label">Operator Score</span><span class="tac-stat-val" id="tac-score">0000</span></div>' +
					'<div class="tac-stat-box" style="border-top-color:#eab308;"><span class="tac-stat-label">Personal Best</span><span class="tac-stat-val" id="tac-high-score">' + this.highScore + '</span></div>' +
					'<div class="tac-stat-box" style="border-top-color:#ef4444;"><span class="tac-stat-label">Magazine (5.56mm)</span><span class="tac-stat-val" id="tac-ammo">30 / 30</span></div>' +
					'<div class="tac-stat-box" style="border-top-color:#22c55e;"><span class="tac-stat-label">Status</span><span class="tac-stat-val" id="tac-status" style="color:#22c55e;">GREEN</span></div>' +
				'</div>' +
				'<div class="tac-canvas-wrap">' +
					'<canvas id="tac-canvas" width="' + this.width + '" height="' + this.height + '"></canvas>' +
					'<div class="tac-overlay" id="tac-overlay">' +
						'<div class="tac-title">CQB Engagement Suite</div>' +
						'<div class="tac-sub">Simulated Live-Fire Tactical Range.<br>Engage armed combatants (Red Vests).<br><b>Hold Fire</b> on non-combatant civilian hostages.<br>Press <b>R</b> to reload your 30-round mag.</div>' +
						'<button class="tac-start-btn" id="tac-overlay-btn">COMMENCE SIMULATION</button>' +
					'</div>' +
				'</div>' +
				'<div class="tac-toolbar">' +
					'<button class="tac-action-btn" id="tac-btn-reload">🔄 TACTICAL RELOAD (R)</button>' +
				'</div>' +
			'</div>'
		);
	}

	initCanvas() {
		this.canvas = this.wrapper.find('#tac-canvas')[0];
		this.ctx = this.canvas.getContext('2d');
	}

	bindEvents() {
		const self = this;

		this.wrapper.on('click', '#tac-overlay-btn', () => {
			this.playSound('bolt');
			this.startGame();
		});

		this.wrapper.on('click', '#tac-canvas', (e) => {
			if (!this.running || this.gameOver || this.isReloading) return;
			const rect = this.canvas.getBoundingClientRect();
			const scaleX = this.width / rect.width;
			const scaleY = this.height / rect.height;
			const x = (e.clientX - rect.left) * scaleX;
			const y = (e.clientY - rect.top) * scaleY;
			this.fireWeapon(x, y);
		});

		this.wrapper.on('click', '#tac-btn-reload', () => {
			this.reloadMagazine();
		});

		this._keyHandler = (e) => {
			if (!this.wrapper.is(':visible')) return;
			if (e.code === 'KeyR') this.reloadMagazine();
		};
		$(window).on('keydown.frappeTacGun', this._keyHandler);
	}

	startGame() {
		if (this.rafId) cancelAnimationFrame(this.rafId);

		this.running = true;
		this.gameOver = false;
		this.score = 0;
		this.ammo = this.maxAmmo;
		this.fatigue = 0;
		this.threats = [];
		this.impacts = [];
		this.isReloading = false;

		this.wrapper.find('#tac-overlay').addClass('hidden');
		this.updateHud();
		this.loop();
	}

	loop() {
		if (!this.running) return;

		this.update();
		this.render();

		if (this.running) {
			this.rafId = requestAnimationFrame(() => this.loop());
		}
	}

	update() {
		this.breathing += 0.04;

		if (Math.random() < 0.025 + (this.score * 0.00012)) {
			this.spawnThreat();
		}

		for (let i = this.threats.length - 1; i >= 0; i--) {
			const t = this.threats[i];
			t.exposureTimer += 1;
			if (t.exposureTimer > t.maxExposure) {
				if (t.type === 'hostile') {
					this.endGame('KILLED IN ACTION (Hostile Unsuppressed)');
					return;
				}
				this.threats.splice(i, 1);
			}
		}

		this.updateHud();
	}

	spawnThreat() {
		const corridors = [70, 160, 250];
		const y = corridors[Math.floor(Math.random() * corridors.length)];
		const isHostage = Math.random() < 0.28;
		const type = isHostage ? 'hostage' : 'hostile';
		const w = 50;
		const h = 85;
		const x = Math.random() < 0.5 ? 40 : this.width - 90;

		this.threats.push({
			x,
			y,
			w,
			h,
			type,
			exposureTimer: 0,
			maxExposure: 110 + Math.random() * 50
		});
	}

	fireWeapon(targetX, targetY) {
		if (this.ammo <= 0) {
			this.playSound('dryfire');
			frappe.show_alert({ message: __('MAGAZINE EMPTY — RELOAD'), indicator: 'orange' });
			return;
		}

		this.ammo -= 1;
		this.muzzleFlashTimer = 3;
		this.playSound('gunshot');

		const swayX = (Math.random() - 0.5) * (4 + this.fatigue);
		const swayY = (Math.random() - 0.5) * (4 + this.fatigue);
		const actualX = targetX + swayX;
		const actualY = targetY + swayY;

		this.impacts.push({ x: actualX, y: actualY, timer: 60 });
		this.fatigue = Math.min(12, this.fatigue + 1.5);

		for (let i = this.threats.length - 1; i >= 0; i--) {
			const t = this.threats[i];
			if (
				actualX >= t.x &&
				actualX <= t.x + t.w &&
				actualY >= t.y &&
				actualY <= t.y + t.h
			) {
				if (t.type === 'hostile') {
					const isHeadshot = actualY <= t.y + 22;
					const pts = isHeadshot ? 150 : 75;
					this.score += pts;
					this.playSound('hit');
					frappe.show_alert({
						message: isHeadshot ? __('HEADSHOT +150') : __('COMM +75'),
						indicator: isHeadshot ? 'green' : 'blue'
					});
				} else {
					this.endGame('MISSION FAILURE: Civilian Hostage Eliminated');
					return;
				}
				this.threats.splice(i, 1);
				break;
			}
		}

		this.updateHud();
	}

	reloadMagazine() {
		if (this.isReloading || this.ammo === this.maxAmmo) return;
		this.isReloading = true;
		this.playSound('reload');
		frappe.show_alert({ message: __('Reloading 5.56mm Mag...'), indicator: 'blue' });

		setTimeout(() => {
			this.ammo = this.maxAmmo;
			this.isReloading = false;
			this.fatigue = 0;
			this.updateHud();
		}, 1100);
	}

	endGame(reason) {
		this.running = false;
		this.gameOver = true;
		this.playSound('kia');

		let isNewRecord = false;
		if (this.score > this.highScore) {
			this.highScore = this.score;
			isNewRecord = true;
			this.saveState();
		}
		this.updateHud();

		this.wrapper.find('#tac-overlay').html(
			'<div class="tac-title" style="color:#ef4444;">' + reason + '</div>' +
			'<div class="tac-sub">Final Tactical Score: <b>' + this.score + '</b><br>' + (isNewRecord ? '🏆 New Operator Personal Best Recorded.' : '') + '</div>' +
			'<button class="tac-start-btn" id="tac-overlay-btn">RE-ENGAGE RANGE</button>'
		).removeClass('hidden');

		this.wrapper.find('#tac-overlay-btn').off('click').on('click', () => {
			this.playSound('bolt');
			this.startGame();
		});
	}

	drawIdleScreen() {
		this.render();
	}

	render() {
		const ctx = this.ctx;
		ctx.clearRect(0, 0, this.width, this.height);

		ctx.fillStyle = '#0f172a';
		ctx.fillRect(0, 0, this.width, this.height);

		ctx.fillStyle = '#1e293b';
		ctx.fillRect(0, 60, this.width, 12);
		ctx.fillRect(0, 150, this.width, 12);
		ctx.fillRect(0, 240, this.width, 12);

		for (const t of this.threats) {
			ctx.save();
			if (t.type === 'hostile') {
				ctx.fillStyle = '#334155';
				ctx.fillRect(t.x, t.y + 22, t.w, t.h - 22);
				ctx.fillStyle = '#7f1d1d';
				ctx.fillRect(t.x + 4, t.y + 30, t.w - 8, t.h - 40);
				ctx.fillStyle = '#cbd5e1';
				ctx.beginPath();
				ctx.arc(t.x + t.w / 2, t.y + 12, 11, 0, Math.PI * 2);
				ctx.fill();
			} else {
				ctx.fillStyle = '#1e293b';
				ctx.fillRect(t.x, t.y + 22, t.w, t.h - 22);
				ctx.fillStyle = '#c2410c';
				ctx.fillRect(t.x + 4, t.y + 30, t.w - 8, t.h - 40);
				ctx.fillStyle = '#cbd5e1';
				ctx.beginPath();
				ctx.arc(t.x + t.w / 2, t.y + 12, 11, 0, Math.PI * 2);
				ctx.fill();
				ctx.fillStyle = '#facc15';
				ctx.font = 'bold 8px sans-serif';
				ctx.textAlign = 'center';
				ctx.fillText('HOSTAGE', t.x + t.w / 2, t.y + 55);
			}
			ctx.restore();
		}

		for (let i = this.impacts.length - 1; i >= 0; i--) {
			const imp = this.impacts[i];
			imp.timer -= 1;
			ctx.save();
			ctx.fillStyle = '#020617';
			ctx.beginPath();
			ctx.arc(imp.x, imp.y, 4, 0, Math.PI * 2);
			ctx.fill();
			ctx.strokeStyle = '#f59e0b';
			ctx.lineWidth = 1;
			ctx.stroke();
			ctx.restore();

			if (imp.timer <= 0) this.impacts.splice(i, 1);
		}

		if (this.muzzleFlashTimer > 0) {
			this.muzzleFlashTimer -= 1;
			ctx.save();
			ctx.fillStyle = 'rgba(250, 204, 21, 0.75)';
			ctx.beginPath();
			ctx.arc(this.width / 2, this.height - 40, 35, 0, Math.PI * 2);
			ctx.fill();
			ctx.restore();
		}

		const swayOffset = Math.sin(this.breathing) * (2 + this.fatigue);
		const cx = this.width / 2 + swayOffset;
		const cy = this.height / 2;

		ctx.save();
		ctx.strokeStyle = 'rgba(239, 68, 68, 0.85)';
		ctx.lineWidth = 1.5;
		ctx.beginPath();
		ctx.arc(cx, cy, 18, 0, Math.PI * 2);
		ctx.stroke();
		ctx.beginPath();
		ctx.moveTo(cx - 26, cy); ctx.lineTo(cx - 8, cy);
		ctx.moveTo(cx + 8, cy); ctx.lineTo(cx + 26, cy);
		ctx.moveTo(cx, cy - 26); ctx.lineTo(cx, cy - 8);
		ctx.moveTo(cx, cy + 8); ctx.lineTo(cx, cy + 26);
		ctx.stroke();
		ctx.restore();
	}

	updateHud() {
		this.wrapper.find('#tac-score').text(String(this.score).padStart(4, '0'));
		this.wrapper.find('#tac-high-score').text(this.highScore);
		this.wrapper.find('#tac-ammo').text(this.isReloading ? 'RELOADING' : `${this.ammo} / ${this.maxAmmo}`);
		
		const statusEl = this.wrapper.find('#tac-status');
		if (this.fatigue > 7) {
			statusEl.text('FATIGUED').css('color', '#ef4444');
		} else if (this.ammo <= 5) {
			statusEl.text('LOW AMMO').css('color', '#eab308');
		} else {
			statusEl.text('GREEN').css('color', '#22c55e');
		}
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

			if (type === 'gunshot') {
				tone(75, 'sawtooth', now, 0.18, 0.22);
				tone(45, 'square', now + 0.02, 0.25, 0.2);
			} else if (type === 'hit') {
				tone(880, 'sine', now, 0.06, 0.12);
			} else if (type === 'reload') {
				tone(320, 'triangle', now, 0.1, 0.1);
				tone(480, 'triangle', now + 0.15, 0.18, 0.12);
			} else if (type === 'bolt' || type === 'dryfire') {
				tone(180, 'square', now, 0.08, 0.08);
			} else if (type === 'kia') {
				tone(110, 'sawtooth', now, 0.5, 0.2);
				tone(65, 'sawtooth', now + 0.2, 0.6, 0.25);
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