import re

filepath = "/src/components/SimulatorCanvas.tsx"

with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# Normalize CRLF to LF
content = content.replace("\r\n", "\n")

# Modern stable initPhysicsFromBuilding implementation
new_init_physics = """    const initPhysicsFromBuilding = () => {
      // Clear residual visual debris
      physicalDebrisList.forEach(d => {
        scene.remove(d.mesh);
        d.mesh.geometry.dispose();
        if (Array.isArray(d.mesh.material)) {
          d.mesh.material.forEach(m => m.dispose());
        } else if (d.mesh.material) {
          d.mesh.material.dispose();
        }
      });
      physicalDebrisList.length = 0;

      Matter.Composite.clear(physicsWorld, false);
      Matter.Engine.clear(physicsEngine);
      bodyToElementMap.clear();
      elementToBodyMap.clear();
      constraintsList.length = 0;

      // Re-add static ground with high friction (top aligned exactly at y = 15)
      physicsGround = Matter.Bodies.rectangle(0, 500, 20000, 1000, { 
        isStatic: true,
        friction: 0.95,
        restitution: 0.15,
        collisionFilter: {
          category: GROUND_CATEGORY,
          mask: GROUND_MASK
        }
      });
      (physicsGround as any).initialX = physicsGround.position.x;
      (physicsGround as any).isGround = true;
      (physicsGround as any).initialY = physicsGround.position.y;

      Matter.Composite.add(physicsWorld, physicsGround);

      // We map the 3D frames onto a 2D vertical plane (X and Y coordinates)
      const joints = new Map<string, { body: Matter.Body; x: number; y: number; isGround: boolean }>();

      // First pass: identify unique nodes in the framework
      const nodes = new Set<string>();
      framesRef.current.forEach(f => {
        const startKey = `${f.start.x.toFixed(4)},${f.start.y.toFixed(4)}`;
        const endKey = `${f.end.x.toFixed(4)},${f.end.y.toFixed(4)}`;
        nodes.add(startKey);
        nodes.add(endKey);
      });

      // Place node bodies in Matter.js
      nodes.forEach(nodeKey => {
        const [xStr, yStr] = nodeKey.split(',');
        const nx = parseFloat(xStr);
        const ny = parseFloat(yStr);

        const isGround = ny <= 0.15; // Ground level anchors
        const body = Matter.Bodies.circle(nx * SCALE, -ny * SCALE, 8, {
          friction: 0.9,
          density: 0.1,
          inertia: isGround ? Infinity : 25000,
          collisionFilter: {
            category: INTACT_CATEGORY,
            mask: INTACT_MASK,
            group: -1 // Disable self-collisions between intact components to block initial overlap explosions
          }
        });
        Matter.Body.setStatic(body, true);
        Matter.Body.setMass(body, 10); // Maintain rigid balanced mass relative to bar bodies!

        (body as any).shouldBeStatic = isGround;
        (body as any).durability = 70;
        (body as any).isGround = isGround;

        // Store initial position on the body object to prevent arithmetic drift during earthquake shakes!
        (body as any).initialX = body.position.x;
        (body as any).initialY = body.position.y;

        Matter.Composite.add(physicsWorld, body);
        joints.set(nodeKey, { body, x: nx, y: ny, isGround });

        if (isGround) {
          // Create a rigid, breakable Ground Weld Constraint to securely mount the node to the foundation
          const groundWeld = Matter.Constraint.create({
            bodyA: physicsGround,
            bodyB: body,
            pointA: { x: body.position.x - physicsGround.position.x, y: body.position.y - physicsGround.position.y },
            pointB: { x: 0, y: 0 },
            stiffness: 1.0,
            length: 0
          });
          (groundWeld as any).durability = 150; // Strong base anchor foundation weld
          (groundWeld as any).isBroken = false;
          (groundWeld as any).isGroundWeld = true;
          Matter.Composite.add(physicsWorld, groundWeld);
          constraintsList.push(groundWeld);
        }
      });

      // Second pass: Create Matter.js line bodies (bars) for each frame element
      framesRef.current.forEach(f => {
        const startKey = `${f.start.x.toFixed(4)},${f.start.y.toFixed(4)}`;
        const endKey = `${f.end.x.toFixed(4)},${f.end.y.toFixed(4)}`;

        const startJoint = joints.get(startKey);
        const endJoint = joints.get(endKey);

        if (startJoint && endJoint) {
          const spec = FRAMEWORK_MATERIALS[f.material] || FRAMEWORK_MATERIALS.steel;

          // Compute length and center point for physical bar
          const len2D = Math.hypot(f.end.x - f.start.x, f.end.y - f.start.y);
          const len = Math.max(0.1, len2D);
          const angle = Math.atan2(f.end.y - f.start.y, f.end.x - f.start.x);

          const midX = (f.start.x + f.end.x) / 2;
          const midY = (f.start.y + f.end.y) / 2;

          const barBody = Matter.Bodies.rectangle(midX * SCALE, -midY * SCALE, len * SCALE, spec.thickness * SCALE * 2, {
            friction: 0.85,
            density: spec.density / 1000, // proportional density
            angle: -angle,
            collisionFilter: {
              category: INTACT_CATEGORY,
              mask: INTACT_MASK,
              group: -1 // Disable self-collisions inside intact components to avoid start explosions
            }
          });
          Matter.Body.setStatic(barBody, true);
          
          // Force stable mass proportional to physical materials but perfectly scaled to 5..15 units to prevent constraint stretching!
          const massRatio = spec.density / 78.5; // steel is 1.0, wood is 0.23, bamboo is 0.08, mud is 0.57
          const balancedMass = Math.max(5, Math.min(15, 12 * massRatio) * (len / 3.0)); // scaled by length ratio to reflect geometry
          Matter.Body.setMass(barBody, balancedMass);
          
          (barBody as any).shouldBeStatic = false;
          (barBody as any).durability = spec.durability;

          // Store initial position for stability
          (barBody as any).initialX = barBody.position.x;
          (barBody as any).initialY = barBody.position.y;
          (barBody as any).initialAngle = barBody.angle;

          Matter.Composite.add(physicsWorld, barBody);
          bodyToElementMap.set(barBody.id, { id: f.id, type: 'frame' });
          elementToBodyMap.set(f.id, barBody);

          // 1. Weld start of the bar to the startJoint with two stable constraints (Positional + Rotational)
          const weldStartPos = Matter.Constraint.create({
            bodyA: startJoint.body,
            bodyB: barBody,
            pointA: { x: 0, y: 0 },
            pointB: { x: - (len * SCALE) / 2, y: 0 },
            stiffness: 1.0,
            length: 0,
          });
          (weldStartPos as any).durability = spec.durability;
          (weldStartPos as any).isBroken = false;

          const leverDist = 15;
          const weldStartRot = Matter.Constraint.create({
            bodyA: startJoint.body,
            bodyB: barBody,
            pointA: { x: leverDist * Math.cos(-angle), y: leverDist * Math.sin(-angle) },
            pointB: { x: - (len * SCALE) / 2 + leverDist, y: 0 },
            stiffness: 0.9,
            length: 0,
          });
          (weldStartRot as any).durability = spec.durability;
          (weldStartRot as any).isBroken = false;

          // Link start welds as twins
          (weldStartPos as any).twin = weldStartRot;
          (weldStartRot as any).twin = weldStartPos;

          // 2. Weld end of the bar to the endJoint with two stable constraints (Positional + Rotational)
          const weldEndPos = Matter.Constraint.create({
            bodyA: endJoint.body,
            bodyB: barBody,
            pointA: { x: 0, y: 0 },
            pointB: { x: (len * SCALE) / 2, y: 0 },
            stiffness: 1.0,
            length: 0,
          });
          (weldEndPos as any).durability = spec.durability;
          (weldEndPos as any).isBroken = false;

          const weldEndRot = Matter.Constraint.create({
            bodyA: endJoint.body,
            bodyB: barBody,
            pointA: { x: -leverDist * Math.cos(-angle), y: -leverDist * Math.sin(-angle) },
            pointB: { x: (len * SCALE) / 2 - leverDist, y: 0 },
            stiffness: 0.9,
            length: 0,
          });
          (weldEndRot as any).durability = spec.durability;
          (weldEndRot as any).isBroken = false;

          // Link end welds as twins
          (weldEndPos as any).twin = weldEndRot;
          (weldEndRot as any).twin = weldEndPos;

          Matter.Composite.add(physicsWorld, weldStartPos);
          Matter.Composite.add(physicsWorld, weldStartRot);
          Matter.Composite.add(physicsWorld, weldEndPos);
          Matter.Composite.add(physicsWorld, weldEndRot);
          constraintsList.push(weldStartPos, weldStartRot, weldEndPos, weldEndRot);
        }
      });

      // Add wall elements as lighter rectangular constraints or physical plates attached to adjacent bars
      const worldToLocal = (body: Matter.Body, worldPt: { x: number; y: number }) => {
        const dx = worldPt.x - body.position.x;
        const dy = worldPt.y - body.position.y;
        const cosAngle = Math.cos(-body.angle);
        const sinAngle = Math.sin(-body.angle);
        return {
          x: dx * cosAngle - dy * sinAngle,
          y: dx * sinAngle + dy * cosAngle
        };
      };

      wallsRef.current.forEach(w => {
        const spec = WALL_MATERIALS[w.material];
        const len2D = Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y);
        const len = Math.max(0.1, len2D);
        const angle = Math.atan2(w.end.y - w.start.y, w.end.x - w.start.x);
        const midX = (w.start.x + w.end.x) / 2;
        const midY = (w.start.y + w.end.y) / 2;

        const wallBody = Matter.Bodies.rectangle(midX * SCALE, -midY * SCALE, len * SCALE, 15, {
          friction: 0.9,
          density: spec.weightPerSqm / 10000,
          angle: -angle,
          collisionFilter: {
            category: INTACT_CATEGORY,
            mask: INTACT_MASK,
            group: -1 // Disable self-collisions inside intact components to avoid start explosions
          }
        });
        Matter.Body.setStatic(wallBody, true);
        (wallBody as any).shouldBeStatic = false;
        (wallBody as any).durability = spec.durability;

        // Store initial position
        (wallBody as any).initialX = wallBody.position.x;
        (wallBody as any).initialY = wallBody.position.y;
        (wallBody as any).initialAngle = wallBody.angle;

        Matter.Composite.add(physicsWorld, wallBody);
        bodyToElementMap.set(wallBody.id, { id: w.id, type: 'wall' });
        elementToBodyMap.set(w.id, wallBody);

        // Connect walls rigidly to nearby joints or frame members
        const startKey = `${w.start.x.toFixed(4)},${w.start.y.toFixed(4)}`;
        const endKey = `${w.end.x.toFixed(4)},${w.end.y.toFixed(4)}`;
        let jointA = joints.get(startKey);
        let jointB = joints.get(endKey);

        // Fallback: search for closest joint within 15 pixels (0.3m)
        if (!jointA) {
          let bestDist = 15;
          joints.forEach((j) => {
            const dist = Math.hypot(j.body.position.x - w.start.x * SCALE, j.body.position.y - (-w.start.y * SCALE));
            if (dist < bestDist) {
              bestDist = dist;
              jointA = j;
            }
          });
        }
        if (!jointB) {
          let bestDist = 15;
          joints.forEach((j) => {
            const dist = Math.hypot(j.body.position.x - w.end.x * SCALE, j.body.position.y - (-w.end.y * SCALE));
            if (dist < bestDist) {
              bestDist = dist;
              jointB = j;
            }
          });
        }

        // Direct Weld to framing joints at wall's endpoints
        if (jointA) {
          const weldAPos = Matter.Constraint.create({
            bodyA: jointA.body,
            bodyB: wallBody,
            pointA: { x: 0, y: 0 },
            pointB: { x: -len * SCALE / 2, y: 0 },
            stiffness: 1.0,
            length: 0
          });
          (weldAPos as any).durability = spec.durability;
          (weldAPos as any).isBroken = false;

          const leverDist = 15;
          const weldARot = Matter.Constraint.create({
            bodyA: jointA.body,
            bodyB: wallBody,
            pointA: { x: leverDist * Math.cos(-angle), y: leverDist * Math.sin(-angle) },
            pointB: { x: -len * SCALE / 2 + leverDist, y: 0 },
            stiffness: 0.9,
            length: 0
          });
          (weldARot as any).durability = spec.durability;
          (weldARot as any).isBroken = false;

          (weldAPos as any).twin = weldARot;
          (weldARot as any).twin = weldAPos;

          Matter.Composite.add(physicsWorld, weldAPos);
          Matter.Composite.add(physicsWorld, weldARot);
          constraintsList.push(weldAPos, weldARot);
        }

        if (jointB) {
          const weldBPos = Matter.Constraint.create({
            bodyA: jointB.body,
            bodyB: wallBody,
            pointA: { x: 0, y: 0 },
            pointB: { x: len * SCALE / 2, y: 0 },
            stiffness: 1.0,
            length: 0
          });
          (weldBPos as any).durability = spec.durability;
          (weldBPos as any).isBroken = false;

          const leverDist = 15;
          const weldBRot = Matter.Constraint.create({
            bodyA: jointB.body,
            bodyB: wallBody,
            pointA: { x: -leverDist * Math.cos(-angle), y: -leverDist * Math.sin(-angle) },
            pointB: { x: len * SCALE / 2 - leverDist, y: 0 },
            stiffness: 0.9,
            length: 0
          });
          (weldBRot as any).durability = spec.durability;
          (weldBRot as any).isBroken = false;

          (weldBPos as any).twin = weldBRot;
          (weldBRot as any).twin = weldBPos;

          Matter.Composite.add(physicsWorld, weldBPos);
          Matter.Composite.add(physicsWorld, weldBRot);
          constraintsList.push(weldBPos, weldBRot);
        }

        // 2. Multi-point Moment-Resisting Weld to overlapping frame members (beams/columns)
        framesRef.current.forEach(f => {
          const bodyF = elementToBodyMap.get(f.id);
          if (bodyF) {
            const dist = Math.hypot(bodyF.position.x - wallBody.position.x, bodyF.position.y - wallBody.position.y);
            if (dist < 40) {
              const angleF = bodyF.angle;
              const w1 = { x: wallBody.position.x, y: wallBody.position.y };
              const w2 = {
                x: wallBody.position.x + 15 * Math.cos(angleF),
                y: wallBody.position.y + 15 * Math.sin(angleF)
              };

              const localF1 = worldToLocal(bodyF, w1);
              const localF2 = worldToLocal(bodyF, w2);
              const localW1 = worldToLocal(wallBody, w1);
              const localW2 = worldToLocal(wallBody, w2);

              const wallWeld1 = Matter.Constraint.create({
                bodyA: bodyF,
                bodyB: wallBody,
                pointA: localF1,
                pointB: localW1,
                stiffness: 0.85,
                length: 0
              });
              (wallWeld1 as any).durability = spec.durability;
              (wallWeld1 as any).isBroken = false;

              const wallWeld2 = Matter.Constraint.create({
                bodyA: bodyF,
                bodyB: wallBody,
                pointA: localF2,
                pointB: localW2,
                stiffness: 0.85,
                length: 0
              });
              (wallWeld2 as any).durability = spec.durability;
              (wallWeld2 as any).isBroken = false;

              (wallWeld1 as any).twin = wallWeld2;
              (wallWeld2 as any).twin = wallWeld1;

              Matter.Composite.add(physicsWorld, wallWeld1);
              Matter.Composite.add(physicsWorld, wallWeld2);
              constraintsList.push(wallWeld1, wallWeld2);
            }
          }
        });
      });

      // Add utility elements as physical bodies connected to nearest frames/joints
      utilitiesRef.current.forEach(u => {
        const spec = UTILITIES[u.type];
        if (!spec) return;

        const uBody = Matter.Bodies.rectangle(u.position.x * SCALE, -u.position.y * SCALE, 20, 20, {
          friction: 0.8,
          density: 0.01,
          collisionFilter: {
            category: INTACT_CATEGORY,
            mask: INTACT_MASK,
            group: -1 // Disable self-collisions inside intact components to avoid start explosions
          }
        });
        Matter.Body.setStatic(uBody, true);
        (uBody as any).shouldBeStatic = false;
        (uBody as any).durability = 85;

        // Store initial position
        (uBody as any).initialX = uBody.position.x;
        (uBody as any).initialY = uBody.position.y;
        (uBody as any).initialAngle = uBody.angle;

        Matter.Composite.add(physicsWorld, uBody);
        bodyToElementMap.set(uBody.id, { id: u.id, type: 'utility' });
        elementToBodyMap.set(u.id, uBody);

        // Find closest frame to attach the utility body to
        let closestBody: Matter.Body | null = null;
        let minDist = 99999;

        framesRef.current.forEach(f => {
          const fBody = elementToBodyMap.get(f.id);
          if (fBody) {
            const dist = Math.hypot(fBody.position.x - uBody.position.x, fBody.position.y - uBody.position.y);
            if (dist < minDist) {
              minDist = dist;
              closestBody = fBody;
            }
          }
        });

        if (closestBody && minDist < 60) {
          const w1 = { x: uBody.position.x, y: uBody.position.y };
          const angle = uBody.angle;
          const w2 = {
            x: uBody.position.x + 15 * Math.cos(angle),
            y: uBody.position.y + 15 * Math.sin(angle)
          };

          const localA1 = worldToLocal(closestBody, w1);
          const localA2 = worldToLocal(closestBody, w2);
          const localB1 = { x: 0, y: 0 };
          const localB2 = { x: 15, y: 0 };

          const weld1 = Matter.Constraint.create({
            bodyA: closestBody,
            bodyB: uBody,
            pointA: localA1,
            pointB: localB1,
            stiffness: 0.85,
            length: 0
          });
          (weld1 as any).durability = 85;
          (weld1 as any).isBroken = false;

          const weld2 = Matter.Constraint.create({
            bodyA: closestBody,
            bodyB: uBody,
            pointA: localA2,
            pointB: localB2,
            stiffness: 0.85,
            length: 0
          });
          (weld2 as any).durability = 85;
          (weld2 as any).isBroken = false;

          (weld1 as any).twin = weld2;
          (weld2 as any).twin = weld1;

          Matter.Composite.add(physicsWorld, weld1);
          Matter.Composite.add(physicsWorld, weld2);
          constraintsList.push(weld1, weld2);
        }
      });

      // No complex transition sleep timeouts needed anymore!
      const group = Matter.Body.nextGroup(true); 
      physicsWorld.bodies.forEach(body => {
        if (!(body as any).isGround) {
          body.collisionFilter.group = group;
        }
      });
    };"""

# Modern buildThreeMeshes implementation
new_build_meshes = """    const buildThreeMeshes = () => {
      // Clear old frame meshes
      frameMeshes.forEach(mesh => scene.remove(mesh));
      frameMeshes.clear();

      // Clear old wall meshes
      wallMeshes.forEach(mesh => scene.remove(mesh));
      wallMeshes.clear();

      // Clear old utility meshes
      utilityMeshes.forEach(mesh => scene.remove(mesh));
      utilityMeshes.clear();

      // Draw frames
      framesRef.current.forEach(f => {
        const spec = FRAMEWORK_MATERIALS[f.material] || FRAMEWORK_MATERIALS.steel;
        const colorVal = f.durability < 30 ? '#ef4444' : f.durability < 70 ? '#f59e0b' : spec.color;

        const startVec = new THREE.Vector3(f.start.x, f.start.y, f.start.z);
        const endVec = new THREE.Vector3(f.end.x, f.end.y, f.end.z);
        const distance = startVec.distanceTo(endVec);

        const group = new THREE.Group();

        // Use cylinders for columns and beams
        const radius = spec.thickness;
        const cylGeo = new THREE.CylinderGeometry(radius, radius, distance, qualitySettings.polygons === 'high' ? 16 : 8);
        cylGeo.rotateZ(-Math.PI / 2);

        const cylMat = new THREE.MeshStandardMaterial({
          color: colorVal,
          roughness: 0.4,
          metalness: 0.8,
        });
        const cylinder = new THREE.Mesh(cylGeo, cylMat);
        cylinder.castShadow = true;
        cylinder.receiveShadow = true;

        cylinder.position.set(0, 0, 0);
        const midVec = new THREE.Vector3().addVectors(startVec, endVec).multiplyScalar(0.5);
        group.position.copy(midVec);
        group.add(cylinder);

        let direction = new THREE.Vector3().subVectors(endVec, startVec); if (direction.lengthSq() < 0.0001) direction.set(1, 0, 0); else direction.normalize();
        const alignAxis = new THREE.Vector3(1, 0, 0);
        group.quaternion.setFromUnitVectors(alignAxis, direction);
        (group as any).initialQuaternion = group.quaternion.clone();

        const sphereGeo = new THREE.SphereGeometry(radius * 1.3, 8, 8);
        const sphereMat = new THREE.MeshStandardMaterial({ color: '#4b5563', metalness: 0.9 });
        const sphereStart = new THREE.Mesh(sphereGeo, sphereMat);
        const sphereEnd = new THREE.Mesh(sphereGeo, sphereMat);
        sphereStart.position.set(-distance / 2, 0, 0);
        sphereEnd.position.set(distance / 2, 0, 0);
        group.add(sphereStart, sphereEnd);

        scene.add(group);
        frameMeshes.set(f.id, group);
      });

      // Draw walls
      wallsRef.current.forEach(w => {
        const spec = WALL_MATERIALS[w.material] || WALL_MATERIALS.concrete;
        const startVec = new THREE.Vector3(w.start.x, w.start.y, w.start.z);
        const endVec = new THREE.Vector3(w.end.x, w.end.y, w.end.z);
        
        const width = startVec.distanceTo(endVec);
        const deltaY = Math.abs(endVec.y - startVec.y);
        const height = deltaY > 0.2 ? deltaY : 3.0;

        const wallGeo = new THREE.BoxGeometry(width, height, 0.18);
        const wallMat = new THREE.MeshStandardMaterial({
          color: spec.color,
          roughness: 0.9,
          metalness: 0.1,
          transparent: true,
          opacity: 0.95,
        });
        const wallMesh = new THREE.Mesh(wallGeo, wallMat);
        wallMesh.castShadow = true;
        wallMesh.receiveShadow = true;

        let dir = new THREE.Vector3().subVectors(endVec, startVec); if (dir.lengthSq() < 0.0001) dir.set(1, 0, 0); else dir.normalize();
        const globalUp = new THREE.Vector3(0, 1, 0);
        const localZ = new THREE.Vector3().crossVectors(dir, globalUp).normalize();
        if (localZ.lengthSq() < 0.001) {
          localZ.set(0, 0, 1);
        }
        const localY = new THREE.Vector3().crossVectors(localZ, dir).normalize();

        wallGeo.translate(0, height / 2, 0);

        const rotationMatrix = new THREE.Matrix4().makeBasis(dir, localY, localZ);
        wallMesh.quaternion.setFromRotationMatrix(rotationMatrix);
        (wallMesh as any).initialQuaternion = wallMesh.quaternion.clone();

        const center = new THREE.Vector3().addVectors(startVec, endVec).multiplyScalar(0.5);
        wallMesh.position.copy(center);

        scene.add(wallMesh);
        wallMeshes.set(w.id, wallMesh);
      });

      // Draw utilities
      utilitiesRef.current.forEach(u => {
        const spec = UTILITIES[u.type];
        const pos = new THREE.Vector3(u.position.x, u.position.y, u.position.z);

        const group = new THREE.Group();
        group.position.copy(pos);

        if (u.type === 'door') {
          const frameGeo = new THREE.BoxGeometry(1.2, 2.2, 0.2);
          const frameMat = new THREE.MeshStandardMaterial({ color: '#1e1e24', metalness: 0.5 });
          const frame = new THREE.Mesh(frameGeo, frameMat);
          group.add(frame);

          const plateGeo = new THREE.BoxGeometry(1.0, 2.0, 0.08);
          const plateMat = new THREE.MeshStandardMaterial({ color: spec.color, roughness: 0.3 });
          const plate = new THREE.Mesh(plateGeo, plateMat);
          plate.position.set(0, 0, 0.02);
          group.add(plate);
        } else if (u.type === 'drain_pipe') {
          const pipeGeo = new THREE.CylinderGeometry(0.12, 0.12, 4, 8);
          const pipeMat = new THREE.MeshStandardMaterial({ color: spec.color, metalness: 0.8, roughness: 0.2 });
          const pipe = new THREE.Mesh(pipeGeo, pipeMat);
          pipe.rotation.x = Math.PI / 2;
          group.add(pipe);
        } else if (u.type === 'electric') {
          const boxGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
          const boxMat = new THREE.MeshStandardMaterial({ color: '#27272a' });
          const box = new THREE.Mesh(boxGeo, boxMat);
          group.add(box);

          const bulbGeo = new THREE.SphereGeometry(0.15, 8, 8);
          const bulbMat = new THREE.MeshBasicMaterial({ color: '#fbbf24' });
          const bulb = new THREE.Mesh(bulbGeo, bulbMat);
          bulb.position.set(0, -0.25, 0);
          group.add(bulb);
        }

        (group as any).initialQuaternion = group.quaternion.clone();

        scene.add(group);
        utilityMeshes.set(u.id, group);
      });
    };"""

# Twin breaking logic for constraint monitor
old_breaker_block = \"\"\"          if (shouldBreak) {
            Matter.Composite.remove(physicsWorld, c);
            (c as any).isBroken = true;
            brokenConstraints++;

            // Visual explosion of structural debris particles
            spawnBreakParticles(pA_x / SCALE, pA_y / -SCALE);
          }\"\"\"

new_breaker_block = \"\"\"          if (shouldBreak) {
            Matter.Composite.remove(physicsWorld, c);
            (c as any).isBroken = true;
            brokenConstraints++;

            if ((c as any).twin && !(c as any).twin.isBroken) {
              Matter.Composite.remove(physicsWorld, (c as any).twin);
              (c as any).twin.isBroken = true;
              brokenConstraints++;
            }

            // Visual explosion of structural debris particles
            spawnBreakParticles(pA_x / SCALE, pA_y / -SCALE);
          }\"\"\"

# Replace initPhysicsFromBuilding
start_match = re.escape("    const initPhysicsFromBuilding = () => {")
end_match = re.escape("    // --- 7. Building Visual Components ---")
pattern = re.compile(rf"{start_match}.*?{end_match}", re.DOTALL)
if pattern.search(content):
    content = pattern.sub(f"{new_init_physics.strip()}\\n\\n    // --- 7. Building Visual Components ---", content)
    print("Surgically replaced initPhysicsFromBuilding!")
else:
    print("Could not find initPhysicsFromBuilding block!")

# Replace buildThreeMeshes
start_match_b = re.escape("    const buildThreeMeshes = () => {")
end_match_b = re.escape("    buildThreeMeshes();")
pattern_b = re.compile(rf"{start_match_b}.*?{end_match_b}", re.DOTALL)
if pattern_b.search(content):
    content = pattern_b.sub(f"{new_build_meshes.strip()}\\n\\n    buildThreeMeshes();", content)
    print("Surgically replaced buildThreeMeshes!")
else:
    print("Could not find buildThreeMeshes block!")

# Replace breaker logic
if old_breaker_block in content:
    content = content.replace(old_breaker_block, new_breaker_block)
    print("Surgically replaced breaker twin-breaking logic!")
else:
    print("Could not find breaker block!")

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)

print("Done patching SimulatorCanvas.tsx!")
