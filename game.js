// ── Constants ──
const ROWS = 9;
const COLS = 9;
const NUM_COLORS = 7;

// ── Game State ──
const board = [];        // 9x9 array: null = empty, 0–6 = color id
let selectedCell = null; // { row, col } or null
let score = 0;
let comboCount = 0;
let nextColors = [];     // array of 3 color ids for the next spawn
let animating = false;   // lock input during move animation

// ── Initialise board array ──
function initBoard() {
  for (let r = 0; r < ROWS; r++) {
    board[r] = [];
    for (let c = 0; c < COLS; c++) {
      board[r][c] = null;
    }
  }
}

// ── Render the grid to the DOM ──
// Full rebuild — used on init and after bulk changes (spawn, line clear).
function renderBoard() {
  const gridEl = document.getElementById('grid');
  gridEl.innerHTML = '';

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = document.createElement('div');
      cell.classList.add('cell');
      cell.dataset.row = r;
      cell.dataset.col = c;

      if (selectedCell && selectedCell.row === r && selectedCell.col === c) {
        cell.classList.add('selected');
      }

      if (board[r][c] !== null) {
        const ball = document.createElement('div');
        ball.classList.add('ball', `color-${board[r][c]}`);
        cell.appendChild(ball);
      }

      gridEl.appendChild(cell);
    }
  }
}

// ── Update a single cell without rebuilding the whole grid ──
function updateCell(row, col) {
  const gridEl = document.getElementById('grid');
  const index = row * COLS + col;
  const cell = gridEl.children[index];
  if (!cell) return;

  // Update selected state
  cell.classList.toggle('selected',
    selectedCell && selectedCell.row === row && selectedCell.col === col);

  // Update ball content
  const existing = cell.querySelector('.ball');
  if (board[row][col] !== null) {
    if (existing) {
      // Update color class
      existing.className = `ball color-${board[row][col]}`;
    } else {
      const ball = document.createElement('div');
      ball.classList.add('ball', `color-${board[row][col]}`);
      cell.appendChild(ball);
    }
  } else if (existing) {
    existing.remove();
  }
}

// ── Render the Next preview balls ──
function renderNextPreview() {
  for (let i = 0; i < 3; i++) {
    const el = document.getElementById(`next-${i}`);
    // Reset classes
    el.className = 'preview-ball';
    if (nextColors[i] !== undefined) {
      el.classList.add(`ball`, `color-${nextColors[i]}`);
    }
  }
}

// ── Render score ──
function renderScore() {
  document.getElementById('score').textContent = score;
}

// ── Render combo indicator ──
function renderCombo() {
  const el = document.getElementById('combo-text');
  if (comboCount >= 2) {
    el.textContent = `Combo x${comboCount}`;
    el.classList.add('visible');
  } else {
    el.classList.remove('visible');
  }
}

// ── Bootstrap ──
function init() {
  initBoard();
  score = 0;
  comboCount = 0;
  selectedCell = null;
  animating = false;

  // Hide game over overlay
  document.getElementById('game-over').style.display = 'none';

  // Spawn initial 3 balls
  nextColors = [randomColor(), randomColor(), randomColor()];
  spawnBalls();

  renderBoard();
  renderScore();
  renderCombo();
}

// ── Generate next 3 ball colors for preview ──
function generateNextBalls() {
  nextColors = [randomColor(), randomColor(), randomColor()];
  renderNextPreview();
}

// ── Spawn balls onto the board ──
// Places the 3 balls from nextColors onto random empty cells.
// Returns an array of { row, col } where balls were placed (for later line-check).
// If fewer than 3 empty cells remain, fills what it can.
function spawnBalls() {
  const emptyCells = getEmptyCells();
  const placed = [];

  for (let i = 0; i < 3 && emptyCells.length > 0; i++) {
    const idx = Math.floor(Math.random() * emptyCells.length);
    const { row, col } = emptyCells.splice(idx, 1)[0];
    board[row][col] = nextColors[i];
    placed.push({ row, col });
  }

  generateNextBalls();
  renderBoard();
  return placed;
}

// ── BFS Pathfinding ──
// Returns the shortest path as an array of { row, col } (including start & end),
// or null if no path exists.
function findPath(startRow, startCol, endRow, endCol) {
  if (startRow === endRow && startCol === endCol) {
    return [{ row: startRow, col: startCol }];
  }

  const visited = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  const parent = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  const queue = [{ row: startRow, col: startCol }];
  visited[startRow][startCol] = true;

  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  while (queue.length > 0) {
    const { row, col } = queue.shift();

    for (const [dr, dc] of dirs) {
      const nr = row + dr;
      const nc = col + dc;

      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
      if (visited[nr][nc]) continue;

      parent[nr][nc] = { row, col };

      if (nr === endRow && nc === endCol) {
        // Reconstruct path
        const path = [];
        let cur = { row: nr, col: nc };
        while (cur) {
          path.unshift(cur);
          cur = parent[cur.row][cur.col];
        }
        return path;
      }

      if (board[nr][nc] !== null) continue;

      visited[nr][nc] = true;
      queue.push({ row: nr, col: nc });
    }
  }

  return null;
}

// ── Animate ball along a path ──
function animateMove(path, colorId) {
  return new Promise((resolve) => {
    let step = 0;

    const STEP_DELAY = 50; // ms per grid cell

    function tick() {
      if (step > 0) {
        const prev = path[step - 1];
        board[prev.row][prev.col] = null;
        updateCell(prev.row, prev.col);
      }

      const cur = path[step];
      board[cur.row][cur.col] = colorId;
      updateCell(cur.row, cur.col);

      step++;
      if (step < path.length) {
        setTimeout(tick, STEP_DELAY);
      } else {
        resolve();
      }
    }

    // Clear the start cell visually on first frame
    tick();
  });
}

// ── Click handler ──
function onGridClick(e) {
  if (animating) return;

  const cell = e.target.closest('.cell');
  if (!cell) return;

  const row = parseInt(cell.dataset.row);
  const col = parseInt(cell.dataset.col);

  if (board[row][col] !== null) {
    // Clicked on a ball → select it (or switch selection)
    selectedCell = { row, col };
    renderBoard();
  } else if (selectedCell) {
    // Clicked on an empty cell with a ball selected → try to move
    const path = findPath(selectedCell.row, selectedCell.col, row, col);
    if (path) {
      const colorId = board[selectedCell.row][selectedCell.col];
      selectedCell = null;
      animating = true;

      animateMove(path, colorId).then(() => {
        animating = false;

        // Check lines after player move
        const removed = detectLines();
        if (removed.size > 0) {
          removeLines(removed);
          // Player cleared lines → bonus turn, no new balls
        } else {
          // No clear → combo breaks
          comboCount = 0;
          renderCombo();

          // Spawn 3 new balls
          spawnBalls();

          // Check if spawned balls form lines
          const spawnRemoved = detectLines();
          if (spawnRemoved.size > 0) {
            removeLines(spawnRemoved);
          }

          // Check game over
          checkGameOver();
        }
      });
    }
    // If no path, do nothing (selection stays)
  }
}

// ── Bind events ──
document.getElementById('grid').addEventListener('click', onGridClick);
document.getElementById('restart-btn').addEventListener('click', init);

// ── Line Detection ──
// Check all four directions from every cell on the board.
// Returns a Set of "row,col" strings for all balls that should be removed.
function detectLines() {
  const toRemove = new Set();

  const directions = [
    [0, 1],  // horizontal →
    [1, 0],  // vertical ↓
    [1, 1],  // diagonal ↘
    [1, -1], // diagonal ↙
  ];

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] === null) continue;
      const color = board[r][c];

      for (const [dr, dc] of directions) {
        const line = [{ row: r, col: c }];

        // Extend in the positive direction
        let nr = r + dr;
        let nc = c + dc;
        while (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && board[nr][nc] === color) {
          line.push({ row: nr, col: nc });
          nr += dr;
          nc += dc;
        }

        // Extend in the negative direction
        nr = r - dr;
        nc = c - dc;
        while (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && board[nr][nc] === color) {
          line.push({ row: nr, col: nc });
          nr -= dr;
          nc -= dc;
        }

        if (line.length >= 5) {
          for (const pos of line) {
            toRemove.add(`${pos.row},${pos.col}`);
          }
        }
      }
    }
  }

  return toRemove;
}

// ── Remove balls and award score ──
// Returns the number of balls removed.
function removeLines(toRemove) {
  const count = toRemove.size;
  for (const key of toRemove) {
    const [r, c] = key.split(',').map(Number);
    board[r][c] = null;
  }

  // Scoring: 10 pts for first 5, +5 for each extra ball
  const baseScore = 10 + Math.max(0, count - 5) * 5;
  // Combo: 1st clear = x1, 2nd consecutive = x2, 3rd = x3, ...
  comboCount++;
  score += baseScore * comboCount;
  renderScore();
  renderCombo();
  renderBoard();
  return count;
}

// ── Check Game Over ──
function checkGameOver() {
  if (getEmptyCells().length === 0) {
    document.getElementById('game-over').style.display = 'flex';
    document.getElementById('final-score').textContent = score;
    return true;
  }
  return false;
}

// ── Helpers ──
function randomColor() {
  return Math.floor(Math.random() * NUM_COLORS);
}

function getEmptyCells() {
  const cells = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] === null) cells.push({ row: r, col: c });
    }
  }
  return cells;
}

// ── Start ──
init();
