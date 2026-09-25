// p5.js port of animal-proc-anim (Processing) by argonaut, MIT License
// Must stay on p5 1.x: curveVertex was replaced by splineVertex in 2.x

let animals, animalSelect, speedInput, turnInput;

function setup() {
  createCanvas(windowWidth, windowHeight);
  const center = createVector(width / 2, height / 2);
  animals = [new Fish(center), new Snake(center), new Lizard(center)];
  animalSelect = document.getElementById('animal');
  speedInput = document.getElementById('speed');
  turnInput = document.getElementById('turn');

  for (const input of document.querySelectorAll('#menu input[type=range]')) {
    showValue(input);
    input.addEventListener('input', () => showValue(input));
  }

  // Turn per frame is speed / radius, so the minimum radius grows with speed to keep turns from snapping
  speedInput.addEventListener('input', () => {
    turnInput.min = Math.ceil(50 * max(1, speedInput.valueAsNumber) / 10) * 10;
    showValue(turnInput);
  });
}

function showValue(input) {
  input.nextElementSibling.value = input.value + input.dataset.unit;
}

function val(id) {
  return document.getElementById(id).valueAsNumber;
}

function draw() {
  background(40, 44, 52);
  const a = animals[animalSelect.value];
  a.resolve(speedInput.valueAsNumber, turnInput.valueAsNumber);

  // Ripples live independently of the target, so they keep spreading after the animal arrives
  if (a.target !== lastTarget) {
    ripples.push({ pos: a.target, time: millis() });
    lastTarget = a.target;
  }
  // Read live from the menu, so changes also affect ripples already on screen
  const cfg = { rings: val('rippleRings'), gap: val('rippleGap'), duration: val('rippleDuration'), size: val('rippleSize') };
  const life = cfg.duration + (cfg.rings - 1) * cfg.gap;
  ripples = ripples.filter(r => millis() - r.time < life);
  for (const r of ripples) drawRipple(r.pos, millis() - r.time, cfg);

  // Soft drop shadow so the animal floats above the background; push/pop saves and restores the canvas context
  push();
  drawingContext.shadowColor = 'rgba(0, 0, 0, 0.35)';
  drawingContext.shadowBlur = 25;
  drawingContext.shadowOffsetX = 10;
  drawingContext.shadowOffsetY = 20;

  a.display();
  pop();
}

let ripples = [], lastTarget;

// Staggered rings that grow and fade where a new target appears (gap/duration in ms, size in px)
function drawRipple(pos, elapsed, { rings, gap, duration, size }) {
  noFill();
  strokeWeight(3);
  for (let k = 0; k < rings; k++) {
    const t = (elapsed - k * gap) / duration;
    if (t < 0 || t > 1) continue;
    stroke(255, 255 * (1 - t));
    circle(pos.x, pos.y, size * t);
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

// === UTIL ===

// Margin keeps the body mostly on screen while turning at the target
function randomPoint(margin = 100) {
  return createVector(random(margin, width - margin), random(margin, height - margin));
}

// Constrain the vector to be at a certain range of the anchor
function constrainDistance(pos, anchor, constraint) {
  return p5.Vector.add(anchor, p5.Vector.sub(pos, anchor).setMag(constraint));
}

// Constrain the angle to be within a certain range of the anchor
function constrainAngle(angle, anchor, constraint) {
  const diff = relativeAngleDiff(angle, anchor);
  if (abs(diff) <= constraint) return simplifyAngle(angle);
  if (diff > constraint) return simplifyAngle(anchor - constraint);
  return simplifyAngle(anchor + constraint);
}

// i.e. How many radians do you need to turn the angle to match the anchor?
// Rotates the space so the anchor sits at PI, avoiding the 0/2pi seam.
function relativeAngleDiff(angle, anchor) {
  return PI - simplifyAngle(angle + PI - anchor);
}

// Simplify the angle to be in the range [0, 2pi)
function simplifyAngle(angle) {
  return ((angle % TWO_PI) + TWO_PI) % TWO_PI;
}

// === CHAIN ===

class Chain {
  // angleConstraint: max angle diff between adjacent joints, only used by resolve()
  constructor(origin, jointCount, linkSize, angleConstraint = TWO_PI) {
    this.linkSize = linkSize;
    this.angleConstraint = angleConstraint;
    this.joints = [origin.copy()];
    this.angles = [0];
    for (let i = 1; i < jointCount; i++) {
      this.joints.push(p5.Vector.add(this.joints[i - 1], createVector(0, linkSize)));
      this.angles.push(0);
    }
  }

  resolve(pos) {
    const j = this.joints, a = this.angles;
    a[0] = p5.Vector.sub(pos, j[0]).heading();
    j[0] = pos;
    for (let i = 1; i < j.length; i++) {
      const curAngle = p5.Vector.sub(j[i - 1], j[i]).heading();
      a[i] = constrainAngle(curAngle, a[i - 1], this.angleConstraint);
      j[i] = p5.Vector.sub(j[i - 1], p5.Vector.fromAngle(a[i], this.linkSize));
    }
  }

  fabrikResolve(pos, anchor) {
    const j = this.joints;
    // Forward pass
    j[0] = pos;
    for (let i = 1; i < j.length; i++) j[i] = constrainDistance(j[i], j[i - 1], this.linkSize);
    // Backward pass
    j[j.length - 1] = anchor;
    for (let i = j.length - 2; i >= 0; i--) j[i] = constrainDistance(j[i], j[i + 1], this.linkSize);
  }
}

// === ANIMALS ===

class Animal {
  constructor(spine, bodyWidth, speed) {
    this.spine = spine;
    this.bodyWidth = bodyWidth; // Width at each vertebra
    this.speed = speed;         // Head step per frame
    this.target = randomPoint();
    this.swum = 0;              // Total distance travelled, drives fin flapping
  }

  // turnRadius: px, tightest arc the head swims; lower = sharper turns
  resolve(speedScale = 1, turnRadius = 80) {
    const head = this.spine.joints[0];
    const speed = this.speed * speedScale;
    // Arrive within the turning diameter, otherwise a target inside the turning circle is orbited forever.
    // Retry so the new target isn't instantly "reached" (would flash a ripple); capped for small screens.
    for (let i = 0; i < 10 && p5.Vector.dist(head, this.target) < 2 * turnRadius; i++) this.target = randomPoint();

    // Steer instead of snapping: the head turns at most speed / turnRadius per frame, so paths are arcs
    const heading = this.spine.angles[0];
    const desired = p5.Vector.sub(this.target, head).heading();
    const maxTurn = speed / turnRadius;
    const dir = heading + constrain(relativeAngleDiff(heading, desired), -maxTurn, maxTurn);
    this.spine.resolve(p5.Vector.add(head, p5.Vector.fromAngle(dir, speed)));
    this.swum += speed;
  }

  posX(i, angleOffset, lengthOffset = 0) {
    return this.spine.joints[i].x + cos(this.spine.angles[i] + angleOffset) * (this.bodyWidth[i] + lengthOffset);
  }

  posY(i, angleOffset, lengthOffset = 0) {
    return this.spine.joints[i].y + sin(this.spine.angles[i] + angleOffset) * (this.bodyWidth[i] + lengthOffset);
  }

  v(i, angleOffset, lengthOffset = 0) {
    curveVertex(this.posX(i, angleOffset, lengthOffset), this.posY(i, angleOffset, lengthOffset));
  }

  // curveVertex needs extra, unrendered vertices to close the loop smoothly
  closeOutline() {
    this.v(0, PI / 2);
    this.v(1, PI / 2);
    this.v(2, PI / 2);
    endShape(CLOSE);
  }

  // Always drawn last in display(): turns off the drop shadow, which looks detached on eyes sitting on the body
  eyes(angle, offset) {
    drawingContext.shadowColor = 'transparent';
    for (const side of [angle, -angle]) {
      const eye = createVector(this.posX(0, side, offset), this.posY(0, side, offset));
      stroke(255);
      fill(255);
      circle(eye.x, eye.y, 24);
      // Pupil slides toward the target, so it glances at a new point before the body turns
      const look = p5.Vector.sub(this.target, eye).limit(5);
      noStroke();
      fill(20);
      circle(eye.x + look.x, eye.y + look.y, 11);
    }
  }
}

// Bloopy lil dude
class Fish extends Animal {
  constructor(origin) {
    // 12 segments, first 10 for body, last 2 for caudal fin
    super(new Chain(origin, 12, 64, PI / 8), [68, 81, 84, 83, 77, 64, 51, 38, 32, 19], 16);
    this.bodyColor = color(58, 124, 165);
    this.finColor = color(129, 195, 215);
  }

  fin(i, angleOffset, rotation, w, h) {
    push();
    translate(this.posX(i, angleOffset), this.posY(i, angleOffset));
    rotate(rotation);
    ellipse(0, 0, w, h);
    pop();
  }

  display() {
    const j = this.spine.joints, a = this.spine.angles;
    strokeWeight(4);
    stroke(255);
    fill(this.finColor);

    // Relative angle differences drive the dorsal and caudal fin shapes
    const headToMid1 = relativeAngleDiff(a[0], a[6]);
    const headToMid2 = relativeAngleDiff(a[0], a[7]);
    // Head-to-tail can exceed PI (11 * PI/8), which flips the sign, so sum it in two halves
    const headToTail = headToMid1 + relativeAngleDiff(a[6], a[11]);

    // Fins open/close together with distance swum (faster swim = faster strokes, ventral lags behind)
    // and lag behind turns, rotating toward the rear body's heading as if dragged by the water
    const flap = sin(this.swum * 0.015) * 0.3;
    const flapVentral = sin(this.swum * 0.015 - 1) * 0.2;
    const bend = relativeAngleDiff(a[0], a[4]) * 0.5;

    // Pectoral fins
    this.fin(3, PI / 3, a[2] - PI / 4 - flap + bend, 160, 64);
    this.fin(3, -PI / 3, a[2] + PI / 4 + flap + bend, 160, 64);
    // Ventral fins
    this.fin(7, PI / 2, a[6] - PI / 4 - flapVentral + bend, 96, 32);
    this.fin(7, -PI / 2, a[6] + PI / 4 + flapVentral + bend, 96, 32);

    // Caudal fin
    beginShape();
    for (let i = 8; i < 12; i++) {
      const w = 1.5 * headToTail * (i - 8) * (i - 8);
      curveVertex(j[i].x + cos(a[i] - PI / 2) * w, j[i].y + sin(a[i] - PI / 2) * w);
    }
    for (let i = 11; i >= 8; i--) {
      const w = constrain(headToTail * 6, -13, 13);
      curveVertex(j[i].x + cos(a[i] + PI / 2) * w, j[i].y + sin(a[i] + PI / 2) * w);
    }
    endShape(CLOSE);

    // Body
    fill(this.bodyColor);
    beginShape();
    for (let i = 0; i < 10; i++) this.v(i, PI / 2);
    this.v(9, PI);
    for (let i = 9; i >= 0; i--) this.v(i, -PI / 2);
    this.v(0, -PI / 6);
    this.v(0, 0, 4);
    this.v(0, PI / 6);
    this.closeOutline();

    // Dorsal fin
    fill(this.finColor);
    const side = (i, k) => [j[i].x + cos(a[i] + PI / 2) * k * 16, j[i].y + sin(a[i] + PI / 2) * k * 16];
    beginShape();
    vertex(j[4].x, j[4].y);
    bezierVertex(j[5].x, j[5].y, j[6].x, j[6].y, j[7].x, j[7].y);
    bezierVertex(...side(6, headToMid2), ...side(5, headToMid1), j[4].x, j[4].y);
    endShape();

    this.eyes(PI / 2, -18);
  }
}

// Wiggly lil dude
class Snake extends Animal {
  constructor(origin) {
    const widths = Array.from({ length: 48 }, (_, i) => i === 0 ? 76 : i === 1 ? 80 : 64 - i);
    super(new Chain(origin, 48, 64, PI / 8), widths, 8);
  }

  display() {
    const n = this.spine.joints.length;
    strokeWeight(4);
    stroke(255);
    fill(172, 57, 49);

    beginShape();
    for (let i = 0; i < n; i++) this.v(i, PI / 2);
    this.v(n - 1, PI);
    for (let i = n - 1; i >= 0; i--) this.v(i, -PI / 2);
    this.v(0, -PI / 6);
    this.v(0, 0);
    this.v(0, PI / 6);
    this.closeOutline();

    this.eyes(PI / 2, -18);
  }
}

// Glitchy lil dude
class Lizard extends Animal {
  constructor(origin) {
    super(new Chain(origin, 14, 64, PI / 8), [52, 58, 40, 60, 68, 71, 65, 50, 28, 15, 11, 9, 7, 7], 12);
    this.arms = [];
    this.armDesired = [];
    for (let i = 0; i < 4; i++) {
      this.arms.push(new Chain(origin, 3, i < 2 ? 52 : 36));
      this.armDesired.push(createVector(0, 0));
    }
  }

  resolve(speedScale, turnRadius) {
    super.resolve(speedScale, turnRadius);
    for (let i = 0; i < this.arms.length; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const bodyIndex = i < 2 ? 3 : 7;
      const angle = (i < 2 ? PI / 4 : PI / 3) * side;
      const desired = createVector(this.posX(bodyIndex, angle, 80), this.posY(bodyIndex, angle, 80));
      // Take a step only once the foot lags too far behind
      if (p5.Vector.dist(desired, this.armDesired[i]) > 200) this.armDesired[i] = desired;

      const foot = p5.Vector.lerp(this.arms[i].joints[0], this.armDesired[i], 0.4);
      const shoulder = createVector(this.posX(bodyIndex, PI / 2 * side, -20), this.posY(bodyIndex, PI / 2 * side, -20));
      this.arms[i].fabrikResolve(foot, shoulder);
    }
  }

  display() {
    // Arms
    noFill();
    for (let i = 0; i < this.arms.length; i++) {
      const [foot, joint, shoulder] = this.arms[i].joints;
      let elbow = joint;
      // Hacky correction so the back legs bend more like real ones
      const para = p5.Vector.sub(foot, shoulder);
      const perp = createVector(-para.y, para.x).setMag(30);
      if (i === 2) elbow = p5.Vector.sub(elbow, perp);
      else if (i === 3) elbow = p5.Vector.add(elbow, perp);

      strokeWeight(40);
      stroke(255);
      bezier(shoulder.x, shoulder.y, elbow.x, elbow.y, elbow.x, elbow.y, foot.x, foot.y);
      strokeWeight(32);
      stroke(82, 121, 111);
      bezier(shoulder.x, shoulder.y, elbow.x, elbow.y, elbow.x, elbow.y, foot.x, foot.y);
    }

    strokeWeight(4);
    stroke(255);
    fill(82, 121, 111);

    // Body
    const n = this.spine.joints.length;
    beginShape();
    for (let i = 0; i < n; i++) this.v(i, PI / 2);
    for (let i = n - 1; i >= 0; i--) this.v(i, -PI / 2);
    // Head tip: X and Y offsets differ in the original too, kept as-is
    curveVertex(this.posX(0, -PI / 6, -8), this.posY(0, -PI / 6, -10));
    curveVertex(this.posX(0, 0, -6), this.posY(0, 0, -4));
    curveVertex(this.posX(0, PI / 6, -8), this.posY(0, PI / 6, -10));
    this.closeOutline();

    this.eyes(3 * PI / 5, -7);
  }
}
