// Coral Bay — keyboard and mouse input.
// Keys are tracked by KeyboardEvent.code so layouts do not matter; a key
// counts as "pressed" only on the frame it went down, which is what menus,
// doors and the horn want.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keysDown = new Set();
    this.keysPressed = new Set();
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseDown = false;
    this.clicked = false;
    this.clickX = 0;
    this.clickY = 0;

    window.addEventListener('keydown', (event) => {
      if (!event.repeat) this.keysPressed.add(event.code);
      this.keysDown.add(event.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
        event.preventDefault();
      }
    });
    window.addEventListener('keyup', (event) => {
      this.keysDown.delete(event.code);
    });
    window.addEventListener('blur', () => {
      this.keysDown.clear();
      this.mouseDown = false;
    });
    canvas.addEventListener('mousemove', (event) => {
      const point = this.toLogical(event);
      this.mouseX = point.x;
      this.mouseY = point.y;
    });
    canvas.addEventListener('mousedown', (event) => {
      const point = this.toLogical(event);
      this.mouseX = point.x;
      this.mouseY = point.y;
      this.mouseDown = true;
      this.clicked = true;
      this.clickX = point.x;
      this.clickY = point.y;
    });
    window.addEventListener('mouseup', () => {
      this.mouseDown = false;
    });
  }

  /** Convert a mouse event into the game's fixed 1280x720 logical space. */
  toLogical(event) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * 1280,
      y: ((event.clientY - rect.top) / rect.height) * 720,
    };
  }

  down(...codes) {
    return codes.some((code) => this.keysDown.has(code));
  }

  pressed(...codes) {
    return codes.some((code) => this.keysPressed.has(code));
  }

  /** The on-foot movement vector, normalised, from WASD or the arrow keys. */
  moveVector() {
    let x = 0;
    let y = 0;
    if (this.down('KeyA', 'ArrowLeft')) x -= 1;
    if (this.down('KeyD', 'ArrowRight')) x += 1;
    if (this.down('KeyW', 'ArrowUp')) y -= 1;
    if (this.down('KeyS', 'ArrowDown')) y += 1;
    if (x !== 0 && y !== 0) {
      const inv = 1 / Math.sqrt(2);
      x *= inv;
      y *= inv;
    }
    return { x, y };
  }

  /** Clear the per-frame edges once the frame has read them. */
  endFrame() {
    this.keysPressed.clear();
    this.clicked = false;
  }
}
