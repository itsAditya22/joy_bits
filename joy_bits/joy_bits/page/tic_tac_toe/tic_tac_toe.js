frappe.pages['tic-tac-toe'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __('Tic-Tac-Toe Arena'),
		single_column: true
	});

	new FrappeTicTacToe(page);
};

class FrappeTicTacToe {
	constructor(page) {
		this.page = page;
		this.wrapper = $(this.page.body);
		this.storageKey = `frappe_ttt_${frappe.session.user || 'guest'}`;

		this.board = Array(9).fill(null);
		this.currentPlayer = 'X';
		this.gameActive = true;
		this.isAiThinking = false;
		this.mode = 'ai'; // 'ai' | 'pvp'
		this.difficulty = 'hard'; // 'easy' | 'medium' | 'hard'
		this.muted = false;
		this.scores = { X: 0, O: 0, ties: 0 };

		this.winPatterns = [
			{ indices: [0, 1, 2], coords: [15, 50, 285, 50] },
			{ indices: [3, 4, 5], coords: [15, 150, 285, 150] },
			{ indices: [6, 7, 8], coords: [15, 250, 285, 250] },
			{ indices: [0, 3, 6], coords: [50, 15, 50, 285] },
			{ indices: [1, 4, 7], coords: [150, 15, 150, 285] },
			{ indices: [2, 5, 8], coords: [250, 15, 250, 285] },
			{ indices: [0, 4, 8], coords: [20, 20, 280, 280] },
			{ indices: [2, 4, 6], coords: [280, 20, 20, 280] }
		];

		this.audioCtx = null;

		this.loadState();
		this.setupPageActions();
		this.injectStyles();
		this.renderLayout();
		this.bindEvents();
		this.updateScoreboardUI();
	}

	setupPageActions() {
		this.page.set_primary_action(__('New Round'), () => {
			this.playSound('click');
			this.resetRound();
		}, 'refresh');

		this.page.add_inner_button(__('Reset Scores'), () => {
			frappe.confirm(__('Are you sure you want to reset your win/loss history?'), () => {
				this.scores = { X: 0, O: 0, ties: 0 };
				this.saveState();
				this.updateScoreboardUI();
				this.resetRound();
				frappe.show_alert({ message: __('Scoreboard cleared!'), indicator: 'blue' });
			});
		});

		this.muteBtn = this.page.add_inner_button(this.muted ? __('🔇 Unmute Audio') : __('🔊 Mute Audio'), () => {
			this.muted = !this.muted;
			this.saveState();
			this.muteBtn.text(this.muted ? __('🔇 Unmute Audio') : __('🔊 Mute Audio'));
			if (!this.muted) this.playSound('click');
		});
	}

	injectStyles() {
		if ($('#frappe-ttt-styles').length) return;

		const styles = `
			<style id="frappe-ttt-styles">
				.ttt-desk-wrapper {
					background: radial-gradient(circle at top, #1e293b 0%, #0f172a 100%);
					border-radius: 16px;
					padding: 32px 20px;
					margin-top: 15px;
					color: #f8fafc;
					font-family: var(--font-stack, 'Inter', sans-serif);
					box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
					display: flex;
					flex-direction: column;
					align-items: center;
					min-height: 640px;
				}
				.ttt-card {
					width: 100%;
					max-width: 440px;
					background: rgba(30, 41, 59, 0.7);
					backdrop-filter: blur(12px);
					border: 1px solid rgba(255, 255, 255, 0.1);
					border-radius: 20px;
					padding: 24px;
					box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
				}
				.ttt-controls {
					display: flex;
					gap: 8px;
					margin-bottom: 14px;
					background: rgba(15, 23, 42, 0.75);
					padding: 6px;
					border-radius: 12px;
				}
				.ttt-seg-btn {
					flex: 1;
					background: transparent;
					border: none;
					color: #94a3b8;
					padding: 8px 10px;
					border-radius: 8px;
					font-size: 13px;
					font-weight: 600;
					cursor: pointer;
					transition: all 0.2s ease;
				}
				.ttt-seg-btn.active {
					background: #3b82f6;
					color: #ffffff;
					box-shadow: 0 2px 10px rgba(59, 130, 246, 0.4);
				}
				.ttt-difficulty-bar {
					display: flex;
					gap: 6px;
					margin-bottom: 18px;
					justify-content: center;
				}
				.ttt-diff-pill {
					background: rgba(15, 23, 42, 0.6);
					border: 1px solid rgba(255, 255, 255, 0.08);
					color: #94a3b8;
					padding: 4px 14px;
					border-radius: 999px;
					font-size: 12px;
					font-weight: 600;
					cursor: pointer;
					transition: all 0.2s ease;
				}
				.ttt-diff-pill.active {
					border-color: #38bdf8;
					color: #38bdf8;
					background: rgba(56, 189, 248, 0.12);
				}
				.ttt-scoreboard {
					display: grid;
					grid-template-columns: repeat(3, 1fr);
					gap: 10px;
					margin-bottom: 18px;
				}
				.ttt-score-box {
					background: rgba(15, 23, 42, 0.65);
					border: 1px solid rgba(255, 255, 255, 0.07);
					border-radius: 12px;
					padding: 10px;
					text-align: center;
				}
				.ttt-score-box.x-score { border-bottom: 3px solid #38bdf8; }
				.ttt-score-box.tie-score { border-bottom: 3px solid #94a3b8; }
				.ttt-score-box.o-score { border-bottom: 3px solid #f43f5e; }
				.ttt-score-label {
					font-size: 11px;
					text-transform: uppercase;
					letter-spacing: 0.6px;
					color: #94a3b8;
					display: block;
				}
				.ttt-score-val {
					font-size: 22px;
					font-weight: 800;
					color: #f8fafc;
				}
				.ttt-status {
					text-align: center;
					font-size: 15px;
					font-weight: 600;
					margin-bottom: 16px;
					min-height: 24px;
					color: #e2e8f0;
				}
				.ttt-board-container {
					position: relative;
					width: 300px;
					height: 300px;
					margin: 0 auto;
				}
				.ttt-grid {
					display: grid;
					grid-template-columns: repeat(3, 1fr);
					grid-template-rows: repeat(3, 1fr);
					gap: 10px;
					width: 100%;
					height: 100%;
				}
				.ttt-cell {
					background: rgba(15, 23, 42, 0.85);
					border: 1px solid rgba(255, 255, 255, 0.08);
					border-radius: 14px;
					display: flex;
					align-items: center;
					justify-content: center;
					cursor: pointer;
					transition: transform 0.15s ease, background 0.2s ease, border-color 0.2s ease;
					padding: 0;
				}
				.ttt-cell:hover:not(.taken) {
					background: rgba(30, 41, 59, 0.95);
					border-color: rgba(255, 255, 255, 0.2);
					transform: translateY(-2px);
				}
				.ttt-cell.taken {
					cursor: default;
				}
				.ttt-cell.win-cell {
					background: rgba(56, 189, 248, 0.12);
					border-color: rgba(56, 189, 248, 0.4);
				}
				.ttt-mark-svg {
					width: 54px;
					height: 54px;
				}
				.ttt-path-x {
					stroke: #38bdf8;
					stroke-width: 10;
					stroke-linecap: round;
					fill: none;
					filter: drop-shadow(0 0 8px rgba(56, 189, 248, 0.6));
					stroke-dasharray: 100;
					stroke-dashoffset: 100;
					animation: tttDraw 0.25s ease-out forwards;
				}
				.ttt-path-o {
					stroke: #f43f5e;
					stroke-width: 10;
					stroke-linecap: round;
					fill: none;
					filter: drop-shadow(0 0 8px rgba(244, 63, 94, 0.6));
					stroke-dasharray: 220;
					stroke-dashoffset: 220;
					animation: tttDraw 0.3s ease-out forwards;
				}
				.ttt-strike-svg {
					position: absolute;
					top: 0;
					left: 0;
					width: 300px;
					height: 300px;
					pointer-events: none;
					z-index: 10;
				}
				.ttt-strike-line {
					stroke: #eab308;
					stroke-width: 8;
					stroke-linecap: round;
					filter: drop-shadow(0 0 10px rgba(234, 179, 8, 0.8));
					stroke-dasharray: 400;
					stroke-dashoffset: 400;
					animation: tttDraw 0.35s ease-in-out forwards;
				}
				@keyframes tttDraw {
					to { stroke-dashoffset: 0; }
				}
			</style>
		`;
		$('head').append(styles);
	}

	renderLayout() {
		const userFirstName = (frappe.session.user_fullname || 'Player X').split(' ')[0];

		this.wrapper.html(`
			<div class="ttt-desk-wrapper">
				<div class="ttt-card">
					<div class="ttt-controls">
						<button class="ttt-seg-btn ${this.mode === 'ai' ? 'active' : ''}" data-mode="ai">🤖 vs AI Bot</button>
						<button class="ttt-seg-btn ${this.mode === 'pvp' ? 'active' : ''}" data-mode="pvp">👥 Local 2P</button>
					</div>

					<div class="ttt-difficulty-bar" style="${this.mode === 'pvp' ? 'display:none;' : ''}">
						<button class="ttt-diff-pill ${this.difficulty === 'easy' ? 'active' : ''}" data-diff="easy">Easy</button>
						<button class="ttt-diff-pill ${this.difficulty === 'medium' ? 'active' : ''}" data-diff="medium">Medium</button>
						<button class="ttt-diff-pill ${this.difficulty === 'hard' ? 'active' : ''}" data-diff="hard">Unbeatable</button>
					</div>

					<div class="ttt-scoreboard">
						<div class="ttt-score-box x-score">
							<span class="ttt-score-label">${frappe.utils.escape_html(userFirstName)} (X)</span>
							<span class="ttt-score-val" id="ttt-score-x">0</span>
						</div>
						<div class="ttt-score-box tie-score">
							<span class="ttt-score-label">Ties</span>
							<span class="ttt-score-val" id="ttt-score-ties">0</span>
						</div>
						<div class="ttt-score-box o-score">
							<span class="ttt-score-label" id="ttt-label-o">${this.mode === 'ai' ? 'AI Bot (O)' : 'Player 2 (O)'}</span>
							<span class="ttt-score-val" id="ttt-score-o">0</span>
						</div>
					</div>

					<div class="ttt-status" id="ttt-status">Your Turn (X)</div>

					<div class="ttt-board-container">
						<div class="ttt-grid" id="ttt-grid">
							${Array.from({ length: 9 }, (_, i) => `<button class="ttt-cell" data-idx="${i}" aria-label="Cell ${i}"></button>`).join('')}
						</div>
						<svg class="ttt-strike-svg" id="ttt-strike-svg" viewBox="0 0 300 300"></svg>
					</div>
				</div>
			</div>
		`);
	}

	bindEvents() {
		const self = this;

		this.wrapper.on('click', '.ttt-cell', function() {
			const idx = parseInt($(this).attr('data-idx'), 10);
			self.handleMove(idx);
		});

		// Mode switch
		this.wrapper.on('click', '.ttt-seg-btn', function() {
			const selectedMode = $(this).attr('data-mode');
			if (selectedMode === self.mode) return;
			self.mode = selectedMode;
			self.playSound('click');
			self.wrapper.find('.ttt-seg-btn').removeClass('active');
			$(this).addClass('active');

			if (self.mode === 'ai') {
				self.wrapper.find('.ttt-difficulty-bar').slideDown(150);
				self.wrapper.find('#ttt-label-o').text('AI Bot (O)');
			} else {
				self.wrapper.find('.ttt-difficulty-bar').slideUp(150);
				self.wrapper.find('#ttt-label-o').text('Player 2 (O)');
			}
			self.saveState();
			self.resetRound();
		});

		this.wrapper.on('click', '.ttt-diff-pill', function() {
			const selectedDiff = $(this).attr('data-diff');
			if (selectedDiff === self.difficulty) return;
			self.difficulty = selectedDiff;
			self.playSound('click');
			self.wrapper.find('.ttt-diff-pill').removeClass('active');
			$(this).addClass('active');
			self.saveState();
			self.resetRound();
		});
	}

	handleMove(idx) {
		if (!this.gameActive || this.isAiThinking || this.board[idx]) return;

		this.executeMove(idx, this.currentPlayer);

		const outcome = this.evaluateBoard(this.board);
		if (outcome) {
			this.finishGame(outcome);
			return;
		}

		this.currentPlayer = this.currentPlayer === 'X' ? 'O' : 'X';
		this.updateStatusText();

		if (this.mode === 'ai' && this.currentPlayer === 'O' && this.gameActive) {
			this.isAiThinking = true;
			this.wrapper.find('#ttt-status').text('AI Bot is thinking...');
			setTimeout(() => {
				const aiIdx = this.computeAiMove();
				this.isAiThinking = false;
				if (aiIdx !== null && this.gameActive) {
					this.executeMove(aiIdx, 'O');
					const aiOutcome = this.evaluateBoard(this.board);
					if (aiOutcome) {
						this.finishGame(aiOutcome);
					} else {
						this.currentPlayer = 'X';
						this.updateStatusText();
					}
				}
			}, 360);
		}
	}

	executeMove(idx, player) {
		this.board[idx] = player;
		const $cell = this.wrapper.find(`.ttt-cell[data-idx="${idx}"]`);
		$cell.addClass('taken').html(this.getMarkSVG(player));
		this.playSound(player === 'X' ? 'x' : 'o');
	}

	getMarkSVG(player) {
		if (player === 'X') {
			return `
				<svg class="ttt-mark-svg" viewBox="0 0 100 100">
					<line class="ttt-path-x" x1="20" y1="20" x2="80" y2="80" />
					<line class="ttt-path-x" x1="80" y1="20" x2="20" y2="80" style="animation-delay: 0.1s" />
				</svg>
			`;
		}
		return `
			<svg class="ttt-mark-svg" viewBox="0 0 100 100">
				<circle class="ttt-path-o" cx="50" cy="50" r="32" />
			</svg>
		`;
	}

	evaluateBoard(bd) {
		for (const pattern of this.winPatterns) {
			const [a, b, c] = pattern.indices;
			if (bd[a] && bd[a] === bd[b] && bd[a] === bd[c]) {
				return { winner: bd[a], pattern };
			}
		}
		if (bd.every(cell => cell !== null)) {
			return { winner: 'tie' };
		}
		return null;
	}

	finishGame(outcome) {
		this.gameActive = false;

		if (outcome.winner === 'tie') {
			this.scores.ties += 1;
			this.wrapper.find('#ttt-status').text("It's a Draw! 🤝");
			this.playSound('tie');
		} else {
			this.scores[outcome.winner] += 1;
			outcome.pattern.indices.forEach(i => {
				this.wrapper.find(`.ttt-cell[data-idx="${i}"]`).addClass('win-cell');
			});

			const [x1, y1, x2, y2] = outcome.pattern.coords;
			this.wrapper.find('#ttt-strike-svg').html(
				`<line class="ttt-strike-line" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />`
			);

			const winnerLabel = outcome.winner === 'X'
				? 'Player X Wins! 🎉'
				: (this.mode === 'ai' ? 'AI Bot Wins! 🤖' : 'Player O Wins! 🎉');

			this.wrapper.find('#ttt-status').text(winnerLabel);
			this.playSound('win');

			// Native Frappe toast notification
			frappe.show_alert({
				message: __(winnerLabel),
				indicator: outcome.winner === 'X' ? 'green' : 'orange'
			});
		}

		this.saveState();
		this.updateScoreboardUI();
	}

	computeAiMove() {
		const emptyIndices = this.board
			.map((val, idx) => (val === null ? idx : null))
			.filter(v => v !== null);

		if (!emptyIndices.length) return null;

		if (this.difficulty === 'easy') {
			return emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
		}

		if (this.difficulty === 'medium' && Math.random() < 0.4) {
			return emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
		}

		return this.minimax(this.board.slice(), 'O', -Infinity, Infinity).index;
	}

	minimax(bd, player, alpha, beta) {
		const empty = bd.map((v, i) => (v === null ? i : null)).filter(v => v !== null);
		const res = this.evaluateBoard(bd);

		if (res) {
			if (res.winner === 'O') return { score: 10 + empty.length };
			if (res.winner === 'X') return { score: -10 - empty.length };
			return { score: 0 };
		}

		let bestMove = {
			score: player === 'O' ? -Infinity : Infinity,
			index: empty[0]
		};

		for (const idx of empty) {
			bd[idx] = player;
			const sim = this.minimax(bd, player === 'O' ? 'X' : 'O', alpha, beta);
			bd[idx] = null;

			if (player === 'O') {
				if (sim.score > bestMove.score) {
					bestMove = { score: sim.score, index: idx };
				}
				alpha = Math.max(alpha, sim.score);
			} else {
				if (sim.score < bestMove.score) {
					bestMove = { score: sim.score, index: idx };
				}
				beta = Math.min(beta, sim.score);
			}
			if (beta <= alpha) break;
		}
		return bestMove;
	}

	resetRound() {
		this.board = Array(9).fill(null);
		this.currentPlayer = 'X';
		this.gameActive = true;
		this.isAiThinking = false;
		this.wrapper.find('.ttt-cell').removeClass('taken win-cell').empty();
		this.wrapper.find('#ttt-strike-svg').empty();
		this.updateStatusText();
	}

	updateStatusText() {
		if (this.mode === 'ai') {
			this.wrapper.find('#ttt-status').text(this.currentPlayer === 'X' ? 'Your Turn (X)' : 'AI Turn (O)');
		} else {
			this.wrapper.find('#ttt-status').text(`Player ${this.currentPlayer}'s Turn`);
		}
	}

	updateScoreboardUI() {
		this.wrapper.find('#ttt-score-x').text(this.scores.X);
		this.wrapper.find('#ttt-score-ties').text(this.scores.ties);
		this.wrapper.find('#ttt-score-o').text(this.scores.O);
	}

	playSound(type) {
		if (this.muted) return;
		try {
			const AudioContext = window.AudioContext || window.webkitAudioContext;
			if (!this.audioCtx) this.audioCtx = new AudioContext();
			if (this.audioCtx.state === 'suspended') this.audioCtx.resume();

			const now = this.audioCtx.currentTime;
			const playTone = (freq, oscType, start, dur, gainVal = 0.12) => {
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

			if (type === 'x') playTone(520, 'sine', now, 0.12);
			else if (type === 'o') playTone(340, 'triangle', now, 0.14);
			else if (type === 'click') playTone(700, 'sine', now, 0.05, 0.06);
			else if (type === 'tie') {
				playTone(300, 'sawtooth', now, 0.15, 0.08);
				playTone(240, 'sawtooth', now + 0.15, 0.25, 0.08);
			} else if (type === 'win') {
				[523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
					playTone(f, 'triangle', now + i * 0.09, 0.22, 0.14);
				});
			}
		} catch (e) {
			// Ignore audio context locks
		}
	}

	loadState() {
		try {
			const raw = localStorage.getItem(this.storageKey);
			if (raw) {
				const parsed = JSON.parse(raw);
				this.scores = parsed.scores || this.scores;
				this.mode = parsed.mode || this.mode;
				this.difficulty = parsed.difficulty || this.difficulty;
				this.muted = Boolean(parsed.muted);
			}
		} catch (e) {}
	}

	saveState() {
		try {
			localStorage.setItem(this.storageKey, JSON.stringify({
				scores: this.scores,
				mode: this.mode,
				difficulty: this.difficulty,
				muted: this.muted
			}));
		} catch (e) {}
	}
}