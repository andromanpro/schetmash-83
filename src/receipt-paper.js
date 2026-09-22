import {
  BufferGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Mesh,
  MeshStandardMaterial,
} from 'three';

const SUBSTEP = 1 / 120;
const MAX_SUBSTEPS = 6;
const GRAVITY = -11.2;
const EPSILON = 1e-6;
const AIR_DAMPING_PER_FRAME = .86;
const OUTFEED_LENGTH = .04;
const OUTFEED_BEND_RADIUS = .36;
const ROLLER_GUIDE_LENGTH = .06;
const FLOOR_LEAD = .10;
const BEND_RADIUS = .12;
const COIL_RADIUS = .09;
const COIL_GROWTH = .012;
// The roll axis stays parallel to the printer slot. A previous diagonal yaw
// twisted the entire ribbon cross-section by ~41° as soon as it touched down.
const COIL_YAW = 0;
const HANGING_ROLL_RADIUS = .075;
const HANGING_ROLL_GROWTH = .008;
const DRAPE_BOW = .065;
const HANGING_ROLL_LENGTH = HANGING_ROLL_RADIUS * Math.PI
  + .5 * HANGING_ROLL_GROWTH * Math.PI ** 2;
// The airborne curl is allowed to reach the floor before it settles. Starting
// the blend earlier visibly straightened the hook during the sixth receipt.
const GROUNDING_START_LENGTH = 1.50;
const GROUNDING_END_LENGTH = 1.74;
const FLOOR_VELOCITY_RETENTION = .06;

/**
 * A narrow, continuously-fed Verlet ribbon.
 *
 * Rows are stored in material order: row zero is the oldest/free end and the
 * last row is the freshly emitted edge held by the printer rollers. Whenever
 * the feed crosses a segment boundary, the old roller row is released and a
 * new pinned row is created at the slot. Existing material therefore moves
 * away from the printer instead of the mesh stretching at its free end.
 */
export class ReceiptPaper {
  constructor(texture, {
    width = .48,
    columns = 9,
    segmentLength = .025,
    floorY = -1.12,
    textureHeight = 4096,
    pixelsPerUnit = 920,
  } = {}) {
    this.texture = texture;
    this.width = width;
    this.columns = columns;
    this.segmentLength = segmentLength;
    this.floorY = floorY;
    this.textureHeight = textureHeight;
    this.pixelsPerUnit = pixelsPerUnit;
    this.maxLength = textureHeight / pixelsPerUnit;
    this.maxRows = Math.ceil(this.maxLength / segmentLength) + 2;
    this.length = 0;
    this.targetLength = 0;
    this.activeRows = 2;
    this.accumulator = 0;
    this.shapeScratch = { x: 0, y: 0, z: 0, angle: 0, radius: 0, yaw: 0 };
    this.airShapeScratch = { x: 0, y: 0, z: 0, angle: 0, radius: 0, yaw: 0 };
    this.groundShapeScratch = { x: 0, y: 0, z: 0, angle: 0, radius: 0, yaw: 0 };

    const vertexCount = this.maxRows * columns;
    this.positions = new Float32Array(vertexCount * 3);
    this.previous = new Float32Array(vertexCount * 3);
    this.uvs = new Float32Array(vertexCount * 2);
    this.rowMaterial = new Float32Array(this.maxRows);

    const indices = [];
    for (let row = 0; row < this.maxRows - 1; row += 1) {
      for (let column = 0; column < columns - 1; column += 1) {
        const a = row * columns + column;
        const b = a + 1;
        const c = a + columns;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    const geometry = new BufferGeometry();
    geometry.setIndex(indices);
    geometry.setAttribute('position', new Float32BufferAttribute(this.positions, 3).setUsage(DynamicDrawUsage));
    geometry.setAttribute('uv', new Float32BufferAttribute(this.uvs, 2).setUsage(DynamicDrawUsage));
    geometry.setDrawRange(0, 0);
    // Float32BufferAttribute normalizes its input into a new typed array. Keep
    // the GPU-facing arrays as the simulation's canonical storage so updates
    // cannot accidentally land in the discarded constructor buffers.
    this.positions = geometry.attributes.position.array;
    this.uvs = geometry.attributes.uv.array;

    this.mesh = new Mesh(geometry, new MeshStandardMaterial({
      map: texture,
      side: DoubleSide,
      // Bright workshop spots used to push the near-white receipt into bloom,
      // washing the print out completely. Real uncoated thermal stock is a
      // muted warm grey with almost no specular response.
      color: 0xb2a681,
      roughness: 1,
      metalness: 0,
      envMapIntensity: .12,
    }));
    this.mesh.visible = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    // The ribbon can extend well beyond its initially collapsed bounds.
    this.mesh.frustumCulled = false;
    this.reset();
  }

  reset() {
    this.length = 0;
    this.targetLength = 0;
    this.activeRows = 2;
    this.accumulator = 0;
    this.positions.fill(0);
    this.previous.fill(0);
    this.uvs.fill(0);
    this.rowMaterial.fill(0);

    // A microscopic outward bias gives the first length constraint a
    // deterministic direction when the two initial rows separate.
    this.#placeRow(0, 0, 0.0003, true);
    this.#placeRow(1, 0, 0, true);
    this.#updateMaterialCoordinates();
    this.#updateGeometry();
    this.mesh.visible = false;
  }

  update(now, dt, reducedMotion = false) {
    if (reducedMotion) {
      if (this.length !== this.targetLength) {
        this.length = this.targetLength;
        this.#ensureRows();
        this.#layoutStatic();
      }
      this.mesh.visible = this.length > .006;
      this.#updateMaterialCoordinates();
      this.#updateGeometry();
      return;
    }

    if (this.length < this.targetLength) {
      const feedPulse = .82 + Math.max(0, Math.sin(now * .052)) * .34;
      this.length = Math.min(this.targetLength, this.length + dt * .31 * feedPulse);
      this.#ensureRows();
    }

    this.mesh.visible = this.length > .006;
    if (!this.mesh.visible) return;

    this.accumulator += Math.min(dt, .05);
    let steps = 0;
    while (this.accumulator >= SUBSTEP && steps < MAX_SUBSTEPS) {
      this.#substep(now);
      this.accumulator -= SUBSTEP;
      steps += 1;
    }
    if (steps === MAX_SUBSTEPS) this.accumulator = 0;

    this.#updateMaterialCoordinates();
    this.#updateGeometry();
  }

  debug() {
    const middle = Math.floor(this.columns / 2);
    const freeIndex = middle * 3;
    const slotIndex = ((this.activeRows - 1) * this.columns + middle) * 3;
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    for (let index = 0; index < this.activeRows * this.columns * 3; index += 3) {
      minX = Math.min(minX, this.positions[index]);
      minY = Math.min(minY, this.positions[index + 1]);
      minZ = Math.min(minZ, this.positions[index + 2]);
      maxX = Math.max(maxX, this.positions[index]);
      maxY = Math.max(maxY, this.positions[index + 1]);
      maxZ = Math.max(maxZ, this.positions[index + 2]);
    }
    return {
      model: 'verlet-feed',
      restShape: 'receipt-spiral',
      growthOrigin: 'slot',
      visible: this.mesh.visible,
      drawCount: this.mesh.geometry.drawRange.count,
      activeRows: this.activeRows,
      segmentLength: this.segmentLength,
      bounds: { minX, minY, minZ, maxX, maxY, maxZ },
      freeEnd: {
        x: this.positions[freeIndex],
        y: this.positions[freeIndex + 1],
        z: this.positions[freeIndex + 2],
      },
      slotEnd: {
        x: this.positions[slotIndex],
        y: this.positions[slotIndex + 1],
        z: this.positions[slotIndex + 2],
      },
      freeMaterial: this.rowMaterial[0],
      slotMaterial: this.rowMaterial[this.activeRows - 1],
      coil: this.#coilDebug(),
      feed: {
        direction: 'perpendicular-from-cabinet',
        straightLength: ROLLER_GUIDE_LENGTH,
        motion: 'gravity-and-bending-constraints',
      },
    };
  }

  #coilDebug() {
    const shape = this.#receiptShape(this.length, { x: 0, y: 0, z: 0, angle: 0, radius: 0, yaw: 0 });
    const grounding = this.#groundingProgress();
    return {
      active: shape.angle > 0,
      phase: shape.angle <= 0 ? 'feeding' : grounding <= 0 ? 'hanging' : grounding >= 1 ? 'grounded' : 'settling',
      grounding,
      direction: 'toward-cabinet',
      axis: 'parallel-to-slot',
      yaw: COIL_YAW,
      turns: shape.angle / (Math.PI * 2),
      radius: shape.radius,
      supportRadius: this.#groundCoilSupportRadius(),
      startsAt: this.#coilStartDistance(),
      hangingStartsAt: this.#hangingRollStartDistance(),
    };
  }

  #floorContactDistance() {
    const verticalDrop = Math.max(0, -this.floorY - BEND_RADIUS - OUTFEED_BEND_RADIUS);
    return OUTFEED_LENGTH
      + OUTFEED_BEND_RADIUS * Math.PI / 2
      + verticalDrop
      + BEND_RADIUS * Math.PI / 2;
  }

  #coilStartDistance() {
    return this.#floorContactDistance() + FLOOR_LEAD;
  }

  #coilAngle(arcLength) {
    if (arcLength <= 0) return 0;
    return (-COIL_RADIUS + Math.sqrt(COIL_RADIUS ** 2 + 2 * COIL_GROWTH * arcLength))
      / COIL_GROWTH;
  }

  #groundCoilSupportRadius() {
    const maxAngle = this.#coilAngle(Math.max(0, this.length - this.#coilStartDistance()));
    let support = COIL_RADIUS;
    const endRadius = COIL_RADIUS + COIL_GROWTH * maxAngle;
    support = Math.max(support, endRadius * Math.cos(maxAngle));

    // Maximise r*cos(angle) at the bottom of every completed revolution. The
    // exact stationary point lies just after 2πk; this approximation is well
    // within a paper thickness and is biased upward by the final safety pad.
    const turns = Math.floor(maxAngle / (Math.PI * 2));
    for (let turn = 0; turn <= turns; turn += 1) {
      const baseAngle = turn * Math.PI * 2;
      const baseRadius = COIL_RADIUS + COIL_GROWTH * baseAngle;
      const candidate = baseAngle + Math.atan(COIL_GROWTH / baseRadius);
      if (candidate > maxAngle) continue;
      const radius = COIL_RADIUS + COIL_GROWTH * candidate;
      support = Math.max(support, radius * Math.cos(candidate));
    }
    return support + .001;
  }

  #groundingProgress() {
    const linear = Math.max(0, Math.min(1,
      (this.length - GROUNDING_START_LENGTH) / (GROUNDING_END_LENGTH - GROUNDING_START_LENGTH),
    ));
    return linear * linear * (3 - 2 * linear);
  }

  #hangingRollStartDistance() {
    const topBendEnd = OUTFEED_LENGTH + OUTFEED_BEND_RADIUS * Math.PI / 2;
    const availableLength = Math.max(0, this.length - topBendEnd);
    const rollLength = Math.min(HANGING_ROLL_LENGTH, availableLength);
    return topBendEnd + Math.max(0, availableLength - rollLength);
  }

  #drapeOffset(span, progress) {
    // A fixed bow on a newly formed short span creates a sharp S-kink around
    // the fourth receipt. Thermal paper only develops the full broad belly
    // after enough unsupported length has left the rollers.
    const amplitude = Math.min(DRAPE_BOW, Math.max(0, span) * .16);
    return amplitude * Math.sin(Math.PI * progress) ** 2;
  }

  #placeRow(row, y, z, syncPrevious = false) {
    for (let column = 0; column < this.columns; column += 1) {
      const across = column / (this.columns - 1) - .5;
      const index = (row * this.columns + column) * 3;
      this.positions[index] = across * this.width;
      this.positions[index + 1] = y;
      this.positions[index + 2] = z + Math.cos(across * Math.PI) * .00015;
      if (syncPrevious) {
        this.previous[index] = this.positions[index];
        this.previous[index + 1] = this.positions[index + 1];
        this.previous[index + 2] = this.positions[index + 2];
      }
    }
  }

  #ensureRows() {
    const fullSegments = Math.floor((this.length + EPSILON) / this.segmentLength);
    const desiredRows = Math.min(this.maxRows, fullSegments + 2);

    while (this.activeRows < desiredRows) {
      const releasedRow = this.activeRows - 1;
      for (let column = 0; column < this.columns; column += 1) {
        const across = column / (this.columns - 1) - .5;
        const index = (releasedRow * this.columns + column) * 3;
        this.positions[index + 1] = 0;
        this.positions[index + 2] = 0.0005 + Math.abs(across) * .0002;
        // The rollers push the thermal paper perpendicular to the faceplate.
        // A restrained impulse avoids the lateral flutter that reads as silk.
        this.previous[index] = this.positions[index];
        this.previous[index + 1] = this.positions[index + 1];
        this.previous[index + 2] = this.positions[index + 2] - .0015;
      }
      this.#placeRow(this.activeRows, 0, 0, true);
      this.activeRows += 1;
    }
  }

  #substep(now) {
    const lastRow = this.activeRows - 1;
    const damping = Math.pow(AIR_DAMPING_PER_FRAME, SUBSTEP * 60);
    const gravityStep = GRAVITY * SUBSTEP * SUBSTEP;

    for (let row = 0; row < lastRow; row += 1) {
      for (let column = 0; column < this.columns; column += 1) {
        const index = (row * this.columns + column) * 3;
        const x = this.positions[index];
        const y = this.positions[index + 1];
        const z = this.positions[index + 2];
        const vx = (x - this.previous[index]) * damping;
        const vy = (y - this.previous[index + 1]) * damping;
        const vz = (z - this.previous[index + 2]) * damping;
        this.previous[index] = x;
        this.previous[index + 1] = y;
        this.previous[index + 2] = z;
        this.positions[index] = x + vx;
        this.positions[index + 1] = y + vy + gravityStep;
        this.positions[index + 2] = z + vz;
      }
    }

    for (let iteration = 0; iteration < 9; iteration += 1) {
      // Minimise discrete curvature before restoring segment lengths. The
      // following constraints then project the smoothed centreline back to an
      // inextensible ribbon without leaving compressed links behind.
      for (let row = 1; row < lastRow; row += 1) {
        const distanceFromSlot = this.length - Math.min(row * this.segmentLength, this.length);
        const flexuralStiffness = distanceFromSlot > this.#coilStartDistance() ? .035 : .12;
        this.#smoothBend(row, flexuralStiffness);
      }

      // Longitudinal and width constraints keep the thermal paper inextensible.
      for (let row = 0; row < lastRow; row += 1) {
        const verticalRest = this.#rowRest(row);
        for (let column = 0; column < this.columns; column += 1) {
          this.#satisfy(
            row * this.columns + column,
            (row + 1) * this.columns + column,
            verticalRest,
            1,
          );
        }
      }

      const acrossRest = this.width / (this.columns - 1);
      for (let row = 0; row <= lastRow; row += 1) {
        for (let column = 0; column < this.columns - 1; column += 1) {
          this.#satisfy(
            row * this.columns + column,
            row * this.columns + column + 1,
            acrossRest,
            .98,
          );
        }
      }

      // Diagonals stop the ribbon shearing; two-row links give paper its bend
      // stiffness while still allowing broad curls and floor folds.
      for (let row = 0; row < lastRow; row += 1) {
        const diagonalRest = Math.hypot(acrossRest, this.#rowRest(row));
        for (let column = 0; column < this.columns - 1; column += 1) {
          const a = row * this.columns + column;
          const b = a + 1;
          const c = a + this.columns;
          const d = c + 1;
          this.#satisfy(a, d, diagonalRest, .82);
          this.#satisfy(b, c, diagonalRest, .82);
        }
      }
      for (let row = 0; row < lastRow - 1; row += 1) {
        const bendRest = this.#rowRest(row) + this.#rowRest(row + 1);
        const distanceFromSlot = this.length - Math.min(row * this.segmentLength, this.length);
        const bendStiffness = distanceFromSlot > this.#coilStartDistance() - .05
          ? .10
          : distanceFromSlot <= ROLLER_GUIDE_LENGTH ? .90 : .52;
        for (let column = 0; column < this.columns; column += 1) {
          this.#satisfy(
            row * this.columns + column,
            (row + 2) * this.columns + column,
            bendRest,
            bendStiffness,
          );
        }
      }

      this.#guideReceiptShape();
      this.#pinSlotRow();
      this.#collide();
    }

    // Shape and collision guides run after the main constraint projection and
    // can leave the last frame a few percent compressed. Finish with two pure
    // inextensibility passes so the roll cannot accordion when it meets floor.
    for (let projection = 0; projection < 20; projection += 1) {
      for (let row = 0; row < lastRow; row += 1) {
        const verticalRest = this.#rowRest(row);
        for (let column = 0; column < this.columns; column += 1) {
          this.#satisfy(
            row * this.columns + column,
            (row + 1) * this.columns + column,
            verticalRest,
            1,
          );
        }
      }
      const acrossRest = this.width / (this.columns - 1);
      for (let row = 0; row <= lastRow; row += 1) {
        for (let column = 0; column < this.columns - 1; column += 1) {
          this.#satisfy(
            row * this.columns + column,
            row * this.columns + column + 1,
            acrossRest,
            1,
          );
        }
      }
      this.#pinSlotRow();
      this.#collide();
    }
  }

  #groundedReceiptShape(distanceFromSlot, out) {
    const topBendEnd = OUTFEED_LENGTH + OUTFEED_BEND_RADIUS * Math.PI / 2;
    const verticalDrop = Math.max(0, -this.floorY - BEND_RADIUS - OUTFEED_BEND_RADIUS);
    const bottomBendStart = topBendEnd + verticalDrop;
    const floorContact = this.#floorContactDistance();
    out.x = 0;
    out.yaw = 0;
    if (distanceFromSlot <= OUTFEED_LENGTH) {
      out.y = 0;
      out.z = .003 + distanceFromSlot;
      out.angle = 0;
      out.radius = 0;
      return out;
    }

    if (distanceFromSlot <= topBendEnd) {
      const angle = (distanceFromSlot - OUTFEED_LENGTH) / OUTFEED_BEND_RADIUS;
      out.y = -OUTFEED_BEND_RADIUS * (1 - Math.cos(angle));
      out.z = .003 + OUTFEED_LENGTH + OUTFEED_BEND_RADIUS * Math.sin(angle);
      out.angle = 0;
      out.radius = 0;
      return out;
    }

    const outfeedDepth = .003 + OUTFEED_LENGTH + OUTFEED_BEND_RADIUS;
    if (distanceFromSlot <= bottomBendStart) {
      const progress = verticalDrop > EPSILON
        ? (distanceFromSlot - topBendEnd) / verticalDrop
        : 1;
      out.y = -OUTFEED_BEND_RADIUS - (distanceFromSlot - topBendEnd);
      out.z = outfeedDepth + this.#drapeOffset(verticalDrop, progress);
      out.angle = 0;
      out.radius = 0;
      return out;
    }

    if (distanceFromSlot <= floorContact) {
      const angle = (distanceFromSlot - bottomBendStart) / BEND_RADIUS;
      out.y = this.floorY + BEND_RADIUS - BEND_RADIUS * Math.sin(angle);
      out.z = outfeedDepth - BEND_RADIUS * (1 - Math.cos(angle));
      out.angle = 0;
      out.radius = 0;
      return out;
    }

    const floorDistance = distanceFromSlot - floorContact;
    const floorStartZ = outfeedDepth - BEND_RADIUS;
    const supportRadius = this.#groundCoilSupportRadius();
    const rollLift = supportRadius - COIL_RADIUS;
    const coilCenterZ = floorStartZ - FLOOR_LEAD + rollLift;
    if (floorDistance <= FLOOR_LEAD) {
      const progress = floorDistance / FLOOR_LEAD;
      const eased = progress * progress * (3 - 2 * progress);
      const yaw = eased * COIL_YAW;
      out.x = Math.sin(yaw) * floorDistance;
      out.y = this.floorY + rollLift * eased;
      out.z = floorStartZ + (coilCenterZ - floorStartZ) * eased;
      out.yaw = yaw;
      out.angle = 0;
      out.radius = 0;
      return out;
    }

    // Archimedean spiral with arc-length approximation. The lead gives the
    // strip room to turn forward before it rolls, while the growing radius
    // keeps later winnings visible instead of stacking on the same pixels.
    const coilLength = floorDistance - FLOOR_LEAD;
    const angle = this.#coilAngle(coilLength);
    const radius = COIL_RADIUS + COIL_GROWTH * angle;
    // The printed face rolls back towards the cabinet, matching the natural
    // curl imparted by the printer rollers rather than turning inside-out.
    const coilStartX = Math.sin(COIL_YAW) * FLOOR_LEAD;
    const radialZ = -radius * Math.sin(angle);
    out.x = coilStartX - Math.sin(COIL_YAW) * radialZ;
    // A true Archimedean spiral has one fixed centre and cannot intersect
    // itself. Its support radius raises and advances that centre as the outer
    // layer grows, keeping every point above the floor and clear of the case.
    out.y = this.floorY + supportRadius - radius * Math.cos(angle);
    out.z = coilCenterZ + Math.cos(COIL_YAW) * radialZ;
    out.yaw = COIL_YAW;
    out.angle = angle;
    out.radius = radius;
    return out;
  }

  #hangingReceiptShape(distanceFromSlot, out) {
    const topBendEnd = OUTFEED_LENGTH + OUTFEED_BEND_RADIUS * Math.PI / 2;
    out.x = 0;
    out.yaw = 0;
    if (distanceFromSlot <= topBendEnd) {
      return this.#groundedReceiptShape(distanceFromSlot, out);
    }

    const outfeedDepth = .003 + OUTFEED_LENGTH + OUTFEED_BEND_RADIUS;
    const hangingRollStart = this.#hangingRollStartDistance();
    const verticalLength = hangingRollStart - topBendEnd;
    if (distanceFromSlot <= hangingRollStart) {
      const progress = verticalLength > EPSILON
        ? (distanceFromSlot - topBendEnd) / verticalLength
        : 1;
      out.y = -OUTFEED_BEND_RADIUS - (distanceFromSlot - topBendEnd);
      out.z = outfeedDepth + this.#drapeOffset(verticalLength, progress);
      out.angle = 0;
      out.radius = 0;
      return out;
    }

    // Thermal paper retains a gentle roller-set curl. Its free end therefore
    // starts forming a half-roll while still airborne instead of hanging like
    // a perfectly straight fabric strip until the first floor collision.
    const rollLength = distanceFromSlot - hangingRollStart;
    const angle = (-HANGING_ROLL_RADIUS
      + Math.sqrt(HANGING_ROLL_RADIUS ** 2 + 2 * HANGING_ROLL_GROWTH * rollLength))
      / HANGING_ROLL_GROWTH;
    const radius = HANGING_ROLL_RADIUS + HANGING_ROLL_GROWTH * angle;
    const entryY = -OUTFEED_BEND_RADIUS - verticalLength;
    const centerZ = outfeedDepth - HANGING_ROLL_RADIUS;
    out.y = entryY - radius * Math.sin(angle);
    out.z = centerZ + radius * Math.cos(angle);
    out.angle = angle;
    out.radius = radius;
    return out;
  }

  #receiptShape(distanceFromSlot, out = this.shapeScratch) {
    const grounding = this.#groundingProgress();
    if (grounding <= 0) return this.#hangingReceiptShape(distanceFromSlot, out);
    if (grounding >= 1) return this.#groundedReceiptShape(distanceFromSlot, out);

    const air = this.#hangingReceiptShape(distanceFromSlot, this.airShapeScratch);
    const ground = this.#groundedReceiptShape(distanceFromSlot, this.groundShapeScratch);
    const inverse = 1 - grounding;
    out.x = air.x * inverse + ground.x * grounding;
    out.y = air.y * inverse + ground.y * grounding;
    out.z = air.z * inverse + ground.z * grounding;
    out.angle = air.angle * inverse + ground.angle * grounding;
    out.radius = air.radius * inverse + ground.radius * grounding;
    out.yaw = air.yaw * inverse + ground.yaw * grounding;
    return out;
  }

  #guideReceiptShape() {
    const lastRow = this.activeRows - 1;
    const coilStart = this.#coilStartDistance();
    const floorContact = this.#floorContactDistance();
    const hangingRollStart = this.#hangingRollStartDistance();
    const grounding = this.#groundingProgress();
    const elasticBendEnd = OUTFEED_LENGTH + OUTFEED_BEND_RADIUS * Math.PI / 2;
    for (let row = 0; row < lastRow; row += 1) {
      const material = Math.min(row * this.segmentLength, this.length);
      const distanceFromSlot = this.length - material;
      const shape = this.#receiptShape(distanceFromSlot);
      const inHangingRoll = grounding < 1 && distanceFromSlot > hangingRollStart;
      const onGroundPath = grounding > 0 && distanceFromSlot > floorContact;
      const onFloor = grounding > .5 && distanceFromSlot > floorContact;
      const inElasticBend = distanceFromSlot <= elasticBendEnd;
      const inDrape = distanceFromSlot > elasticBendEnd
        && distanceFromSlot <= Math.max(hangingRollStart, floorContact);
      const bendProgress = Math.min(1, distanceFromSlot / elasticBendEnd);
      const elasticWeight = inElasticBend ? .28 + .62 * (1 - bendProgress) ** 2 : 0;
      const centerIndex = (row * this.columns + Math.floor(this.columns / 2)) * 3;
      const centerY = this.positions[centerIndex + 1];
      const centerZ = this.positions[centerIndex + 2];
      for (let column = 0; column < this.columns; column += 1) {
        const across = column / (this.columns - 1) - .5;
        const index = (row * this.columns + column) * 3;
        if (inElasticBend || inDrape || inHangingRoll || onGroundPath) {
          const targetX = shape.x + across * this.width * Math.cos(shape.yaw);
          const targetZ = shape.z + across * this.width * Math.sin(shape.yaw);
          const strength = onGroundPath
            ? (distanceFromSlot > coilStart ? .56 : .60)
            : inHangingRoll ? .48 : inDrape ? .24 : elasticWeight;
          const lateralStrength = onGroundPath
            ? .62 : inHangingRoll ? .42 : inDrape ? .20 : .54 * elasticWeight;
          this.positions[index] += (targetX - this.positions[index]) * lateralStrength;
          this.positions[index + 1] += (shape.y - this.positions[index + 1]) * strength;
          this.positions[index + 2] += (targetZ - this.positions[index + 2]) * strength;
        } else {
          // Outside the rollers the centreline is not attached to an authored
          // curve. Gravity and the distance/bending constraints determine the
          // drape; only each cross-section is kept flat like real receipt paper.
          const targetX = across * this.width;
          this.positions[index] += (targetX - this.positions[index]) * .34;
          this.positions[index + 1] += (centerY - this.positions[index + 1]) * .18;
          this.positions[index + 2] += (centerZ - this.positions[index + 2]) * .18;
        }
        if (onFloor) {
          // Paper on a rough floor does not retain tangential velocity. Killing
          // it here prevents rows from sliding into one another and crumpling.
          this.previous[index] += (this.positions[index] - this.previous[index]) * .72;
          this.previous[index + 1] += (this.positions[index + 1] - this.previous[index + 1]) * .72;
          this.previous[index + 2] += (this.positions[index + 2] - this.previous[index + 2]) * .72;
        }
      }
    }
  }

  #rowRest(row) {
    if (row < this.activeRows - 2) return this.segmentLength;
    return Math.max(0, this.length - row * this.segmentLength);
  }

  #satisfy(pointA, pointB, restLength, stiffness) {
    const indexA = pointA * 3;
    const indexB = pointB * 3;
    const dx = this.positions[indexB] - this.positions[indexA];
    const dy = this.positions[indexB + 1] - this.positions[indexA + 1];
    const dz = this.positions[indexB + 2] - this.positions[indexA + 2];
    const distance = Math.hypot(dx, dy, dz);
    if (distance < EPSILON) return;

    const pinnedRow = this.activeRows - 1;
    const invA = Math.floor(pointA / this.columns) === pinnedRow ? 0 : 1;
    const invB = Math.floor(pointB / this.columns) === pinnedRow ? 0 : 1;
    const invTotal = invA + invB;
    if (invTotal === 0) return;

    const correction = ((distance - restLength) / distance) * stiffness;
    const moveA = correction * invA / invTotal;
    const moveB = correction * invB / invTotal;
    this.positions[indexA] += dx * moveA;
    this.positions[indexA + 1] += dy * moveA;
    this.positions[indexA + 2] += dz * moveA;
    this.positions[indexB] -= dx * moveB;
    this.positions[indexB + 1] -= dy * moveB;
    this.positions[indexB + 2] -= dz * moveB;
  }

  #smoothBend(row, stiffness) {
    for (let column = 0; column < this.columns; column += 1) {
      const before = ((row - 1) * this.columns + column) * 3;
      const middle = (row * this.columns + column) * 3;
      const after = ((row + 1) * this.columns + column) * 3;
      for (let axis = 0; axis < 3; axis += 1) {
        const midpoint = (this.positions[before + axis] + this.positions[after + axis]) * .5;
        this.positions[middle + axis] += (midpoint - this.positions[middle + axis]) * stiffness;
      }
    }
  }

  #pinSlotRow() {
    const row = this.activeRows - 1;
    this.#placeRow(row, 0, 0, false);
    for (let column = 0; column < this.columns; column += 1) {
      const index = (row * this.columns + column) * 3;
      this.previous[index] = this.positions[index];
      this.previous[index + 1] = this.positions[index + 1];
      this.previous[index + 2] = this.positions[index + 2];
    }
  }

  #collide() {
    const lastRow = this.activeRows - 1;
    for (let row = 0; row < lastRow; row += 1) {
      for (let column = 0; column < this.columns; column += 1) {
        const index = (row * this.columns + column) * 3;

        // The tape cannot pass back through the cabinet. Its front plane also
        // acts as a guide after the strip reaches the floor, so continued feed
        // is resolved towards the player instead of disappearing under it.
        const guideZ = .001 + Math.min(.032, Math.max(0, -this.positions[index + 1]) * .09);
        if (this.positions[index + 2] < guideZ) {
          this.positions[index + 2] = guideZ;
          this.previous[index + 2] = Math.min(this.previous[index + 2], guideZ);
        }

        if (this.positions[index + 1] >= this.floorY) continue;
        const vx = this.positions[index] - this.previous[index];
        const vz = this.positions[index + 2] - this.previous[index + 2];
        this.positions[index + 1] = this.floorY;
        this.previous[index + 1] = this.floorY;
        this.previous[index] = this.positions[index] - vx * FLOOR_VELOCITY_RETENTION;
        this.previous[index + 2] = this.positions[index + 2] - vz * FLOOR_VELOCITY_RETENTION;
      }
    }
  }

  #layoutStatic() {
    for (let row = 0; row < this.activeRows; row += 1) {
      const material = Math.min(row * this.segmentLength, this.length);
      const distanceFromSlot = this.length - material;
      const shape = this.#receiptShape(distanceFromSlot);
      for (let column = 0; column < this.columns; column += 1) {
        const across = column / (this.columns - 1) - .5;
        const index = (row * this.columns + column) * 3;
        this.positions[index] = shape.x + across * this.width * Math.cos(shape.yaw);
        this.positions[index + 1] = shape.y;
        this.positions[index + 2] = shape.z + across * this.width * Math.sin(shape.yaw);
        this.previous[index] = this.positions[index];
        this.previous[index + 1] = this.positions[index + 1];
        this.previous[index + 2] = this.positions[index + 2];
      }
    }
  }

  #updateMaterialCoordinates() {
    for (let row = 0; row < this.activeRows; row += 1) {
      const material = Math.min(row * this.segmentLength, this.length);
      this.rowMaterial[row] = material;
      const v = Math.max(0, 1 - material * this.pixelsPerUnit / this.textureHeight);
      for (let column = 0; column < this.columns; column += 1) {
        const uvIndex = (row * this.columns + column) * 2;
        this.uvs[uvIndex] = column / (this.columns - 1);
        this.uvs[uvIndex + 1] = v;
      }
    }
  }

  #updateGeometry() {
    const geometry = this.mesh.geometry;
    geometry.setDrawRange(0, Math.max(0, this.activeRows - 1) * (this.columns - 1) * 6);
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.uv.needsUpdate = true;
    geometry.computeVertexNormals();
  }
}
