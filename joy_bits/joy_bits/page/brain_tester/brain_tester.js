frappe.pages['brain-tester'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __('Brain Tester Arena'),
		single_column: true
	});

	new FrappeBrainTester(page);
};

class FrappeBrainTester {
	constructor(page) {
		this.page = page;
		this.wrapper = $(this.page.body);
		this.storageKey = `frappe_brain_tester_${frappe.session.user || 'guest'}`;

		// Active Mode: 'matrix' | 'stroop' | 'math'
		this.mode = 'matrix';
		this.muted = false;
		this.audioCtx = null;
		this.timerInterval = null;

		// Persistent High Scores
		this.bestScores = {
			matrix: 0,
			stroop: 0,
			math: 0
		};

		// Current Session State
		this.score = 0;
		this.level = 1;
		this.lives = 3;
		this.timeLeft = 0;
		this.isPlaying = false;

		// Matrix State
		this.gridSize = 3;
		this.targetTiles = [];
		this.selectedTiles = [];
		this.matrixLocked = true;

		// Stroop State
		this.colors = [
			{ name: 'RED', hex: '#ef4444' },
			{ name: 'BLUE', hex: '#38bdf8' },
			{ name: 'GREEN', hex: '#22c55e' },
			{ name: 'YELLOW', hex: '#eab308' },
			{ name: 'PURPLE', hex: '#a855f7' }
		];
		this.currentStroopMatch = false;

		// Math State
		this.currentMathAnswer = null;

		this.loadState();
		this.setupPageActions();
		this.injectStyles();
		this.renderLayout();
		this.bindEvents();
		this.renderModePreview();
	}

	setupPageActions() {
		this.page.set_primary_action(__('Start Test'), () => {
			this.playSound('start');
			this.startGame();
		}, 'play');

		this.muteBtn = this.page.add_inner_button(this.muted ? __('🔇 Unmute') : __('🔊 Mute'), () => {
			this.muted = !this.muted;
			this.saveState();
			this.muteBtn.text(this.muted ? __('🔇 Unmute') : __('🔊 Mute'));
		});

		this.page.add_inner_button(__('Reset Brain Records'), () => {
			frappe.confirm(__('Reset all your personal Brain Tester records?'), () => {
				this.bestScores = { matrix: 0, stroop: 0, math: 0 };
				this.saveState();
				this.updateHud();
				frappe.show_alert({ message: __('Brain records cleared!'), indicator: 'blue' });
			});
		});
	}

	injectStyles() {
		if ($('#frappe-brain-tester-styles').length) return;

		const styles = `
			<style id="frappe-brain-tester-styles">
				.bt-desk-wrap {
					background: radial-gradient(circle at top, #1e293b 0%, #090d16 100%);
					border-radius: 16px;
					padding: 28px 18px;
					margin-top: 12px;
					color: #f8fafc;
					display: flex;
					flex-direction: column;
					align-items: center;
					min-height: 640px;
					box-shadow: 0 20px 50px rgba(0,0,0,0.45);
					user-select: none;
				}
				.bt-card {
					width: 100%;
					max-width: 480px;
					background: rgba(30, 41, 59, 0.72);
					backdrop-filter: blur(12px);
					border: 1px solid rgba(255,255,255,0.1);
					border-radius: 20px;
					padding: 22px;
					box-shadow: 0 12px 32px rgba(0,0,0,0.35);
				}
				.bt-tabs {
					display: grid;
					grid-template-columns: repeat(3, 1fr);
					gap: 8px;
					background: rgba(15, 23, 42, 0.8);
					padding: 6px;
					border-radius: 12px;
					margin-bottom: 18px;
				}
				.bt-tab {
					background: transparent;
					border: none;
					color: #94a3b8;
					padding: 9px 6px;
					border-radius: 8px;
					font-size: 12px;
					font-weight: 700;
					cursor: pointer;
					transition: all 0.2s ease;
				}
				.bt-tab.active {
					background: linear-gradient(135deg, #6366f1, #3b82f6);
					color: #fff;
					box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
				}
				.bt-hud {
					display: grid;
					grid-template-columns: repeat(4, 1fr);
					gap: 8px;
					margin-bottom: 16px;
				}
				.bt-stat {
					background: rgba(15, 23, 42, 0.7);
					border: 1px solid rgba(255,255,255,0.07);
					border-radius: 12px;
					padding: 8px;
					text-align: center;
				}
				.bt-stat-label {
					font-size: 10px;
					text-transform: uppercase;
					letter-spacing: 0.6px;
					color: #94a3b8;
					display: block;
				}
				.bt-stat-val {
					font-size: 18px;
					font-weight: 800;
					color: #f8fafc;
				}
				.bt-stage {
					background: rgba(15, 23, 42, 0.85);
					border: 1px solid rgba(255,255,255,0.08);
					border-radius: 16px;
					min-height: 330px;
					padding: 20px;
					display: flex;
					flex-direction: column;
					align-items: center;
					justify-content: center;
					position: relative;
					text-align: center;
				}
				.bt-prompt {
					font-size: 14px;
					font-weight: 600;
					color: #cbd5e1;
					margin-bottom: 16px;
					min-height: 22px;
				}
				/* Matrix Grid */
				.bt-matrix-grid {
					display: grid;
					gap: 8px;
					width: 260px;
					height: 260px;
					margin: 0 auto;
				}
				.bt-tile {
					background: #1e293b;
					border: 1px solid rgba(255,255,255,0.1);
					border-radius: 10px;
					cursor: pointer;
					transition: transform 0.15s ease, background 0.2s ease;
				}
				.bt-tile:hover {
					border-color: rgba(255,255,255,0.28);
				}
				.bt-tile.memorize {
					background: #38bdf8;
					box-shadow: 0 0 15px rgba(56, 189, 248, 0.7);
					transform: scale(0.96);
				}
				.bt-tile.correct {
					background: #22c55e;
					box-shadow: 0 0 12px rgba(34, 197, 94, 0.6);
				}
				.bt-tile.wrong {
					background: #ef4444;
					box-shadow: 0 0 12px rgba(239, 68, 68, 0.7);
				}
				/* Stroop Cards */
				.bt-stroop-box {
					width: 100%;
					max-width: 280px;
					background: #1e293b;
					border: 1px solid rgba(255,255,255,0.1);
					border-radius: 14px;
					padding: 16px;
					margin-bottom: 12px;
				}
				.bt-stroop-sub {
					font-size: 11px;
					text-transform: uppercase;
					color: #94a3b8;
					margin-bottom: 4px;
				}
				.bt-stroop-word {
					font-size: 32px;
					font-weight: 900;
					letter-spacing: 1px;
				}
				.bt-btn-row {
					display: flex;
					gap: 12px;
					width: 100%;
					max-width: 280px;
					margin-top: 8px;
				}
				.bt-action-btn {
					flex: 1;
					padding: 12px;
					border-radius: 12px;
					border: none;
					font-weight: 800;
					font-size: 14px;
					cursor: pointer;
					color: #fff;
					transition: transform 0.12s ease;
				}
				.bt-action-btn:active {
					transform: scale(0.96);
				}
				.bt-btn-yes { background: #22c55e; box-shadow: 0 6px 16px rgba(34,197,94,0.35); }
				.bt-btn-no { background: #ef4444; box-shadow: 0 6px 16px rgba(239,68,68,0.35); }
				/* Speed Math */
				.bt-math-eq {
					font-size: 38px;
					font-weight: 900;
					color: #38bdf8;
					margin-bottom: 20px;
					letter-spacing: 1px;
				}
				.bt-math-options {
					display: grid;
					grid-template-columns: repeat(2, 1fr);
					gap: 10px;
					width: 100%;
					max-width: 280px;
				}
				.bt-math-opt {
					background: #1e293b;
					border: 1px solid rgba(255,255,255,0.14);
					color: #f8fafc;
					padding: 14px;
					border-radius: 12px;
					font-size: 20px;
					font-weight: 800;
					cursor: pointer;
					transition: all 0.15s ease;
				}
				.bt-math-opt:hover {
					background: #3b82f6;
					border-color: #60a5fa;
				}
				.bt-start-cta {
					background: linear-gradient(135deg, #6366f1, #06b6d4);
					border: none;
					color: #fff;
					padding: 12px 28px;
					border-radius: 999px;
					font-weight: 800;
					font-size: 14px;
					cursor: pointer;
					margin-top: 14px;
					box-shadow: 0 8px 20px rgba(99, 102, 241, 0.4);
				}
			</style>
		`;
		$('head').append(styles);
	}

	renderLayout() {
		this.wrapper.html(`
			<div class="bt-desk-wrap">
				<div class="bt-card">
					<div class="bt-tabs">
						<button class="bt-tab active" data-mode="matrix">🧩 Memory Matrix</button>
						<button class="bt-tab" data-mode="stroop">⚡ Stroop Reflex</button>
						<button class="bt-tab" data-mode="math">🔢 Speed Math</button>
					</div>

					<div class="bt-hud">
						<div class="bt-stat">
							<span class="bt-stat-label">Score</span>
							<span class="bt-stat-val" id="bt-score">0</span>
						</div>
						<div class="bt-stat">
							<span class="bt-stat-label">Best</span>
							<span class="bt-stat-val" id="bt-best">0</span>
						</div>
						<div class="bt-stat">
							<span class="bt-stat-label" id="bt-meta-label">Level</span>
							<span class="bt-stat-val" id="bt-meta-val">1</span>
						</div>
						<div class="bt-stat">
							<span class="bt-stat-label">Lives</span>
							<span class="bt-stat-val" id="bt-lives">❤️❤️❤️</span>
						</div>
					</div>

					<div class="bt-stage" id="bt-stage"></div>
				</div>
			</div>
		`);
		this.updateHud();
	}

	bindEvents() {
		const self = this;

		// Switch Mode Tabs
		this.wrapper.on('click', '.bt-tab', function() {
			const newMode = $(this).attr('data-mode');
			if (newMode === self.mode) return;
			self.stopTimer();
			self.isPlaying = false;
			self.mode = newMode;
			self.playSound('click');

			self.wrapper.find('.bt-tab').removeClass('active');
			$(this).addClass('active');
			self.updateHud();
			self.renderModePreview();
		});

		// Start button inside stage
		this.wrapper.on('click', '#bt-stage-start', () => {
			this.playSound('start');
			this.startGame();
		});

		// Matrix tile click
		this.wrapper.on('click', '.bt-tile', function() {
			if (!self.isPlaying || self.matrixLocked) return;
			const idx = parseInt($(this).attr('data-idx'), 10);
			self.handleMatrixClick(idx, $(this));
		});

		// Stroop match buttons
		this.wrapper.on('click', '.bt-stroop-btn', function() {
			if (!self.isPlaying) return;
			const userSaysMatch = $(this).attr('data-match') === 'true';
			self.handleStroopAnswer(userSaysMatch);
		});

		// Speed Math option click
		this.wrapper.on('click', '.bt-math-opt', function() {
			if (!self.isPlaying) return;
			const val = parseInt($(this).attr('data-val'), 10);
			self.handleMathAnswer(val);
		});
	}

	renderModePreview() {
		const descriptions = {
			matrix: {
				title: '🧩 Spatial Memory Matrix',
				desc: 'Memorize the glowing blue tiles on the grid, then tap them all after they hide.'
			},
			stroop: {
				title: '⚡ Stroop Color-Word Reflex',
				desc: 'Does the MEANING of the top word match the INK COLOR of the bottom word? You have 25 seconds!'
			},
			math: {
				title: '🔢 Mental Speed Math',
				desc: 'Solve as many rapid-fire arithmetic challenges as you can in 30 seconds!'
			}
		};

		const info = descriptions[this.mode];
		this.wrapper.find('#bt-stage').html(`
			<h3 style="margin:0 0 8px;color:#f8fafc;font-weight:800;">${info.title}</h3>
			<p style="color:#94a3b8;font-size:13px;max-width:320px;margin-bottom:10px;">${info.desc}</p>
			<button class="bt-start-cta" id="bt-stage-start">🚀 Launch Challenge</button>
		`);
	}

	startGame() {
		this.stopTimer();
		this.isPlaying = true;
		this.score = 0;
		this.level = 1;
		this.lives = 3;

		if (this.mode === 'matrix') {
			this.gridSize = 3;
			this.updateHud();
			this.startMatrixRound();
		} else if (this.mode === 'stroop') {
			this.timeLeft = 25;
			this.updateHud();
			this.startCountdownTimer();
			this.nextStroopQuestion();
		} else if (this.mode === 'math') {
			this.timeLeft = 30;
			this.updateHud();
			this.startCountdownTimer();
			this.nextMathQuestion();
		}
	}

	/* ---------------- 1. MEMORY MATRIX ---------------- */
	startMatrixRound() {
		if (!this.isPlaying) return;
		this.matrixLocked = true;
		this.selectedTiles = [];

		// Scale grid from 3x3 up to 5x5
		this.gridSize = this.level < 3 ? 3 : (this.level < 6 ? 4 : 5);
		const totalCells = this.gridSize * this.gridSize;
		const numTargets = Math.min(totalCells - 2, 2 + this.level);

		// Pick unique random tiles
		const indices = Array.from({ length: totalCells }, (_, i) => i);
		this.targetTiles = [];
		while (this.targetTiles.length < numTargets) {
			const randIdx = Math.floor(Math.random() * indices.length);
			this.targetTiles.push(indices.splice(randIdx, 1)[0]);
		}

		const cellsHtml = Array.from({ length: totalCells }, (_, i) =>
			`<div class="bt-tile" data-idx="${i}"></div>`
		).join('');

		this.wrapper.find('#bt-stage').html(`
			<div class="bt-prompt" id="bt-prompt">👀 Memorize the glowing tiles...</div>
			<div class="bt-matrix-grid" style="grid-template-columns: repeat(${this.gridSize}, 1fr);">
				${cellsHtml}
			</div>
		`);

		// Highlight target tiles briefly
		setTimeout(() => {
			this.targetTiles.forEach(idx => {
				this.wrapper.find(`.bt-tile[data-idx="${idx}"]`).addClass('memorize');
			});
			this.playSound('click');
		}, 200);

		const revealDuration = Math.max(650, 1300 - this.level * 60);
		setTimeout(() => {
			if (!this.isPlaying) return;
			this.wrapper.find('.bt-tile').removeClass('memorize');
			this.wrapper.find('#bt-prompt').text(`Tap the ${numTargets} hidden tiles!`);
			this.matrixLocked = false;
		}, revealDuration);
	}

	handleMatrixClick(idx, $tile) {
		if (this.selectedTiles.includes(idx) || $tile.hasClass('wrong')) return;

		if (this.targetTiles.includes(idx)) {
			this.selectedTiles.push(idx);
			$tile.addClass('correct');
			this.playSound('good');

			if (this.selectedTiles.length === this.targetTiles.length) {
				this.matrixLocked = true;
				this.score += this.level * 25;
				this.level += 1;
				this.updateHud();
				this.wrapper.find('#bt-prompt').text('✨ Perfect Recall! Next level...');
				setTimeout(() => this.startMatrixRound(), 800);
			}
		} else {
			$tile.addClass('wrong');
			this.playSound('bad');
			this.loseLife();

			if (this.isPlaying) {
				this.matrixLocked = true;
				// Reveal missed tiles briefly then retry level
				this.targetTiles.forEach(t => {
					this.wrapper.find(`.bt-tile[data-idx="${t}"]`).addClass('memorize');
				});
				setTimeout(() => this.startMatrixRound(), 1000);
			}
		}
	}

	/* ---------------- 2. STROOP REFLEX ---------------- */
	nextStroopQuestion() {
		if (!this.isPlaying) return;

		const meaningColor = this.colors[Math.floor(Math.random() * this.colors.length)];
		const topDistractorColor = this.colors[Math.floor(Math.random() * this.colors.length)];
		const bottomWordText = this.colors[Math.floor(Math.random() * this.colors.length)];

		// 50% chance that ink color matches meaning
		const isMatch = Math.random() < 0.5;
		let bottomInkColor = meaningColor;
		if (!isMatch) {
			const others = this.colors.filter(c => c.name !== meaningColor.name);
			bottomInkColor = others[Math.floor(Math.random() * others.length)];
		}

		this.currentStroopMatch = isMatch;

		this.wrapper.find('#bt-stage').html(`
			<div class="bt-prompt">Does top <b>MEANING</b> match bottom <b>INK COLOR</b>?</div>
			<div class="bt-stroop-box">
				<div class="bt-stroop-sub">Word Meaning</div>
				<div class="bt-stroop-word" style="color:${topDistractorColor.hex};">${meaningColor.name}</div>
			</div>
			<div class="bt-stroop-box">
				<div class="bt-stroop-sub">Font Color</div>
				<div class="bt-stroop-word" style="color:${bottomInkColor.hex};">${bottomWordText.name}</div>
			</div>
			<div class="bt-btn-row">
				<button class="bt-action-btn bt-btn-no bt-stroop-btn" data-match="false">✖ NO</button>
				<button class="bt-action-btn bt-btn-yes bt-stroop-btn" data-match="true">✔ MATCH</button>
			</div>
		`);
	}

	handleStroopAnswer(userSaysMatch) {
		if (userSaysMatch === this.currentStroopMatch) {
			this.score += 20;
			this.level += 1;
			this.playSound('good');
			this.updateHud();
			this.nextStroopQuestion();
		} else {
			this.playSound('bad');
			this.loseLife();
			if (this.isPlaying) this.nextStroopQuestion();
		}
	}

	/* ---------------- 3. SPEED MATH ---------------- */
	nextMathQuestion() {
		if (!this.isPlaying) return;

		const ops = ['+', '-', '×'];
		const op = ops[Math.floor(Math.random() * ops.length)];
		let a, b, answer;

		const scale = Math.min(25, 6 + this.level * 2);
		if (op === '+') {
			a = Math.floor(Math.random() * scale) + 2;
			b = Math.floor(Math.random() * scale) + 2;
			answer = a + b;
		} else if (op === '-') {
			a = Math.floor(Math.random() * scale) + 10;
			b = Math.floor(Math.random() * a) + 1;
			answer = a - b;
		} else {
			a = Math.floor(Math.random() * 11) + 2;
			b = Math.floor(Math.random() * 10) + 2;
			answer = a * b;
		}

		this.currentMathAnswer = answer;

		// Generate 3 believable wrong options
		const options = new Set([answer]);
		while (options.size < 4) {
			const offset = (Math.floor(Math.random() * 7) + 1) * (Math.random() < 0.5 ? 1 : -1);
			const candidate = answer + offset;
			if (candidate >= 0) options.add(candidate);
		}
		const shuffled = Array.from(options).sort(() => Math.random() - 0.5);

		this.wrapper.find('#bt-stage').html(`
			<div class="bt-prompt">Solve as fast as you can!</div>
			<div class="bt-math-eq">${a} ${op} ${b} = ?</div>
			<div class="bt-math-options">
				${shuffled.map(v => `<button class="bt-math-opt" data-val="${v}">${v}</button>`).join('')}
			</div>
		`);
	}

	handleMathAnswer(val) {
		if (val === this.currentMathAnswer) {
			this.score += 15 + (this.level * 2);
			this.level += 1;
			this.playSound('good');
			this.updateHud();
			this.nextMathQuestion();
		} else {
			this.playSound('bad');
			this.loseLife();
			if (this.isPlaying) this.nextMathQuestion();
		}
	}

	/* ---------------- TIMERS & LIFECYCLE ---------------- */
	startCountdownTimer() {
		this.stopTimer();
		this.timerInterval = setInterval(() => {
			this.timeLeft -= 1;
			this.updateHud();
			if (this.timeLeft <= 0) {
				this.endGame("⏰ Time's Up!");
			}
		}, 1000);
	}

	stopTimer() {
		if (this.timerInterval) {
			clearInterval(this.timerInterval);
			this.timerInterval = null;
		}
	}

	loseLife() {
		this.lives -= 1;
		this.updateHud();
		if (this.lives <= 0) {
			this.endGame('💔 Out of Lives!');
		}
	}

	endGame(reasonTitle) {
		this.stopTimer();
		this.isPlaying = false;

		let isNewBest = false;
		if (this.score > (this.bestScores[this.mode] || 0)) {
			this.bestScores[this.mode] = this.score;
			isNewBest = true;
			this.saveState();
		}
		this.updateHud();

		// Calculate Brain Rank
		const rank = this.score >= 250 ? '🧠 Grandmaster' : (this.score >= 140 ? '⚡ Sharp Thinker' : '🌱 Warm-Up');

		this.wrapper.find('#bt-stage').html(`
			<h3 style="margin:0 0 6px;color:#f8fafc;font-weight:900;">
				${isNewBest ? '🏆 NEW BRAIN RECORD!' : reasonTitle}
			</h3>
			<p style="color:#38bdf8;font-size:18px;font-weight:800;margin:4px 0;">
				Score: ${this.score} &bull; ${rank}
			</p>
			<p style="color:#94a3b8;font-size:12px;margin-bottom:12px;">
				Personal Best in this Mode: <b>${this.bestScores[this.mode]}</b>
			</p>
			<button class="bt-start-cta" id="bt-stage-start">🔄 Play Again</button>
		`);

		frappe.show_alert({
			message: isNewBest
				? __('New {0} Record: {1} pts!', [this.mode.toUpperCase(), this.score])
				: __('Session Complete! Score: {0}', [this.score]),
			indicator: isNewBest ? 'green' : 'blue'
		});
	}

	updateHud() {
		this.wrapper.find('#bt-score').text(this.score);
		this.wrapper.find('#bt-best').text(this.bestScores[this.mode] || 0);

		if (this.mode === 'matrix') {
			this.wrapper.find('#bt-meta-label').text('Level');
			this.wrapper.find('#bt-meta-val').text(this.level);
		} else {
			this.wrapper.find('#bt-meta-label').text('Timer');
			this.wrapper.find('#bt-meta-val').text(`${this.timeLeft}s`);
		}

		this.wrapper.find('#bt-lives').text(this.lives > 0 ? '❤️'.repeat(this.lives) : '💀');
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

			if (type === 'good') {
				tone(587.33, 'sine', now, 0.09, 0.12);
				tone(880, 'sine', now + 0.07, 0.15, 0.12);
			} else if (type === 'bad') {
				tone(160, 'sawtooth', now, 0.22, 0.14);
			} else if (type === 'click') {
				tone(660, 'triangle', now, 0.06, 0.08);
			} else if (type === 'start') {
				tone(440, 'sine', now, 0.09, 0.1);
				tone(659.25, 'sine', now + 0.08, 0.16, 0.12);
			}
		} catch (e) {}
	}

	loadState() {
		try {
			const raw = localStorage.getItem(this.storageKey);
			if (raw) {
				const parsed = JSON.parse(raw);
				this.bestScores = Object.assign(this.bestScores, parsed.bestScores || {});
				this.muted = Boolean(parsed.muted);
			}
		} catch (e) {}
	}

	saveState() {
		try {
			localStorage.setItem(this.storageKey, JSON.stringify({
				bestScores: this.bestScores,
				muted: this.muted
			}));
		} catch (e) {}
	}
}