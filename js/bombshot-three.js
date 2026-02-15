// =============================================
// BOMB SHOT BLUFF — Three.js 3D Scene
// Glass, Liquid, White Gloves, Card Animations
// =============================================
(function() {
  'use strict';

  var scene, camera, renderer, clock, rafId;
  var isInitialized = false;

  // Objects
  var glassGroup, liquidMesh, gloveL, gloveR;
  var barTop;
  var cardMeshes = []; // flying card animations

  // State
  var liquidLevel = 0;       // 0~1
  var targetLiquidLevel = 0;
  var drinkColor = new THREE.Color(0xf5a623); // beer default
  var gloveState = 'idle';   // idle, mixing, celebrating
  var gloveTimer = null;
  var mixCallback = null;

  // Constants
  var GLASS_RADIUS = 0.55;
  var GLASS_HEIGHT = 1.6;
  var GLASS_Y = 0.8; // glass bottom Y
  var LIQUID_MAX_H = GLASS_HEIGHT * 0.85;

  var DRINK_COLORS = {
    beer:   0xf5a623,
    soju:   0xd4f5e9,
    liquor: 0xc0792a
  };

  // ========== GLASS ==========
  function createGlass() {
    glassGroup = new THREE.Group();

    // Outer cylinder (transparent glass)
    var glassGeo = new THREE.CylinderGeometry(GLASS_RADIUS, GLASS_RADIUS * 0.85, GLASS_HEIGHT, 24, 1, true);
    var glassMat = new THREE.MeshPhongMaterial({
      color: 0xccddee,
      transparent: true,
      opacity: 0.18,
      shininess: 120,
      specular: 0x88aacc,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    var glassMesh = new THREE.Mesh(glassGeo, glassMat);
    glassMesh.position.y = GLASS_HEIGHT / 2;
    glassGroup.add(glassMesh);

    // Bottom disc
    var bottomGeo = new THREE.CircleGeometry(GLASS_RADIUS * 0.85, 24);
    var bottomMat = new THREE.MeshPhongMaterial({
      color: 0xaabbcc,
      transparent: true,
      opacity: 0.25,
      shininess: 80,
      side: THREE.DoubleSide
    });
    var bottomMesh = new THREE.Mesh(bottomGeo, bottomMat);
    bottomMesh.rotation.x = -Math.PI / 2;
    bottomMesh.position.y = 0.01;
    glassGroup.add(bottomMesh);

    // Rim ring (top edge highlight)
    var rimGeo = new THREE.TorusGeometry(GLASS_RADIUS, 0.025, 8, 24);
    var rimMat = new THREE.MeshPhongMaterial({
      color: 0xeeffff,
      transparent: true,
      opacity: 0.5,
      shininess: 150,
      specular: 0xffffff
    });
    var rim = new THREE.Mesh(rimGeo, rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = GLASS_HEIGHT;
    glassGroup.add(rim);

    glassGroup.position.y = GLASS_Y;
    scene.add(glassGroup);
  }

  // ========== LIQUID ==========
  function createLiquid() {
    var liqGeo = new THREE.CylinderGeometry(GLASS_RADIUS * 0.82, GLASS_RADIUS * 0.78, 0.01, 24);
    var liqMat = new THREE.MeshPhongMaterial({
      color: drinkColor,
      transparent: true,
      opacity: 0.7,
      shininess: 60
    });
    liquidMesh = new THREE.Mesh(liqGeo, liqMat);
    liquidMesh.position.y = GLASS_Y + 0.01;
    liquidMesh.visible = false;
    scene.add(liquidMesh);
  }

  function updateLiquid(dt) {
    // Smooth interpolation
    liquidLevel += (targetLiquidLevel - liquidLevel) * Math.min(dt * 3, 1);
    if (liquidLevel < 0.005) {
      liquidMesh.visible = false;
      return;
    }
    liquidMesh.visible = true;
    var h = Math.max(0.02, liquidLevel * LIQUID_MAX_H);
    liquidMesh.scale.set(1, h / 0.01, 1);
    liquidMesh.position.y = GLASS_Y + h / 2;
  }

  // ========== WHITE GLOVES ==========
  function createGlove(side) {
    var g = new THREE.Group();

    // Palm (large sphere)
    var palmGeo = new THREE.SphereGeometry(0.22, 12, 10);
    var palmMat = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 40 });
    var palm = new THREE.Mesh(palmGeo, palmMat);
    g.add(palm);

    // Thumb
    var thumbGeo = new THREE.SphereGeometry(0.09, 8, 6);
    var thumb = new THREE.Mesh(thumbGeo, palmMat);
    thumb.position.set(side * 0.2, -0.02, 0.12);
    g.add(thumb);

    // 4 Fingers
    for (var i = 0; i < 4; i++) {
      var fingerGeo = new THREE.SphereGeometry(0.07, 8, 6);
      var finger = new THREE.Mesh(fingerGeo, palmMat);
      var angle = (i - 1.5) * 0.3;
      finger.position.set(Math.sin(angle) * 0.2, 0.15, Math.cos(angle) * 0.08);
      g.add(finger);
    }

    // Cuff
    var cuffGeo = new THREE.CylinderGeometry(0.16, 0.2, 0.12, 12);
    var cuffMat = new THREE.MeshPhongMaterial({ color: 0xeeeeff, shininess: 20 });
    var cuff = new THREE.Mesh(cuffGeo, cuffMat);
    cuff.position.y = -0.26;
    g.add(cuff);

    return g;
  }

  function createGloves() {
    gloveL = createGlove(-1);
    gloveL.position.set(-1.2, GLASS_Y + GLASS_HEIGHT * 0.7, 0);
    scene.add(gloveL);

    gloveR = createGlove(1);
    gloveR.position.set(1.2, GLASS_Y + GLASS_HEIGHT * 0.7, 0);
    gloveR.scale.x = -1; // mirror
    scene.add(gloveR);
  }

  // ========== BAR TOP ==========
  function createBar() {
    var barGeo = new THREE.BoxGeometry(6, 0.15, 4);
    var barMat = new THREE.MeshPhongMaterial({
      color: 0x3a2215,
      shininess: 30,
      specular: 0x221100
    });
    barTop = new THREE.Mesh(barGeo, barMat);
    barTop.position.y = GLASS_Y - 0.08;
    barTop.receiveShadow = true;
    scene.add(barTop);
  }

  // ========== CARD MESHES (for animation) ==========
  function createCardPlane(type) {
    var cardGeo = new THREE.PlaneGeometry(0.38, 0.54);

    // Create canvas texture for card face
    var canvas = document.createElement('canvas');
    canvas.width = 76; canvas.height = 108;
    var ctx = canvas.getContext('2d');

    var colors = { beer: '#f5a623', soju: '#4ecdc4', liquor: '#c0792a', water: '#5dade2' };
    var emojis = { beer: '🍺', soju: '🍶', liquor: '🥃', water: '💧' };

    // Card back (red)
    ctx.fillStyle = '#8b1a2b';
    ctx.fillRect(0, 0, 76, 108);
    ctx.strokeStyle = '#c9a84c';
    ctx.lineWidth = 2;
    ctx.strokeRect(4, 4, 68, 100);
    // Diamond pattern
    ctx.strokeStyle = 'rgba(201,168,76,0.25)';
    ctx.lineWidth = 1;
    for (var i = 0; i < 12; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * 12); ctx.lineTo(76, i * 12 + 40);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(76, i * 12); ctx.lineTo(0, i * 12 + 40);
      ctx.stroke();
    }

    var backTex = new THREE.CanvasTexture(canvas);
    backTex.needsUpdate = true;

    // Front face
    var canvas2 = document.createElement('canvas');
    canvas2.width = 76; canvas2.height = 108;
    var ctx2 = canvas2.getContext('2d');
    ctx2.fillStyle = colors[type] || '#888';
    ctx2.fillRect(0, 0, 76, 108);
    ctx2.fillStyle = 'rgba(255,255,255,0.2)';
    ctx2.fillRect(0, 0, 76, 54);
    ctx2.font = '36px serif';
    ctx2.textAlign = 'center';
    ctx2.fillText(emojis[type] || '?', 38, 65);

    var frontTex = new THREE.CanvasTexture(canvas2);
    frontTex.needsUpdate = true;

    var frontMat = new THREE.MeshPhongMaterial({ map: frontTex, side: THREE.FrontSide });
    var backMat = new THREE.MeshPhongMaterial({ map: backTex, side: THREE.BackSide });

    var frontMesh = new THREE.Mesh(cardGeo, frontMat);
    var backMesh = new THREE.Mesh(cardGeo.clone(), backMat);

    var group = new THREE.Group();
    group.add(frontMesh);
    group.add(backMesh);
    group.userData = { frontTex: frontTex, backTex: backTex, type: type };

    return group;
  }

  // ========== ANIMATIONS ==========

  var animTime = 0;

  function animateIdle(dt) {
    if (!gloveL || !gloveR) return;
    animTime += dt;

    // Gloves bob gently
    var bobL = Math.sin(animTime * 1.5) * 0.08;
    var bobR = Math.sin(animTime * 1.5 + Math.PI * 0.7) * 0.08;
    gloveL.position.y = GLASS_Y + GLASS_HEIGHT * 0.7 + bobL;
    gloveR.position.y = GLASS_Y + GLASS_HEIGHT * 0.7 + bobR;

    // Slight rotation
    gloveL.rotation.z = Math.sin(animTime * 0.8) * 0.1;
    gloveR.rotation.z = -Math.sin(animTime * 0.8 + 0.5) * 0.1;
  }

  function animateMixing(dt) {
    if (!gloveL || !gloveR) return;
    animTime += dt;

    // Gloves move to glass and rotate around it
    var mixAngle = animTime * 4;
    var mixR = 0.45;
    var glassTopY = GLASS_Y + GLASS_HEIGHT + 0.15;

    gloveL.position.set(
      Math.cos(mixAngle) * mixR,
      glassTopY + Math.sin(animTime * 8) * 0.05,
      Math.sin(mixAngle) * mixR
    );
    gloveR.position.set(
      Math.cos(mixAngle + Math.PI) * mixR,
      glassTopY + Math.sin(animTime * 8 + Math.PI) * 0.05,
      Math.sin(mixAngle + Math.PI) * mixR
    );

    // Hands face inward
    gloveL.rotation.set(0, -mixAngle, Math.PI * 0.15);
    gloveR.rotation.set(0, -mixAngle + Math.PI, -Math.PI * 0.15);

    // Glass subtle shake
    if (glassGroup) {
      glassGroup.rotation.y = Math.sin(animTime * 6) * 0.04;
      glassGroup.position.x = Math.sin(animTime * 8) * 0.015;
    }
  }

  function endMixing() {
    gloveState = 'idle';
    if (glassGroup) {
      glassGroup.rotation.y = 0;
      glassGroup.position.x = 0;
    }
    // Return gloves to idle positions
    if (gloveL) {
      gloveL.position.set(-1.2, GLASS_Y + GLASS_HEIGHT * 0.7, 0);
      gloveL.rotation.set(0, 0, 0);
    }
    if (gloveR) {
      gloveR.position.set(1.2, GLASS_Y + GLASS_HEIGHT * 0.7, 0);
      gloveR.rotation.set(0, 0, 0);
    }

    if (mixCallback) {
      var cb = mixCallback;
      mixCallback = null;
      cb();
    }
  }

  // Card flight animations
  var flyingCards = [];

  function spawnFlyingCard(type, delay) {
    setTimeout(function() {
      if (!isInitialized || !scene) return; // guard against destroyed scene
      var card = createCardPlane(type || 'beer');
      card.position.set(0, -0.5, 2.5); // start from bottom front
      card.rotation.set(0, Math.PI, 0); // show back
      card.scale.set(0.8, 0.8, 0.8);
      scene.add(card);

      flyingCards.push({
        mesh: card,
        time: 0,
        duration: 0.7,
        startPos: card.position.clone(),
        endPos: new THREE.Vector3(
          (Math.random() - 0.5) * 0.3,
          GLASS_Y + GLASS_HEIGHT * 0.8 + Math.random() * 0.2,
          (Math.random() - 0.5) * 0.3
        )
      });
    }, delay);
  }

  function updateFlyingCards(dt) {
    for (var i = flyingCards.length - 1; i >= 0; i--) {
      var fc = flyingCards[i];
      fc.time += dt;
      var t = Math.min(fc.time / fc.duration, 1);
      // Ease out cubic
      var ease = 1 - Math.pow(1 - t, 3);

      fc.mesh.position.lerpVectors(fc.startPos, fc.endPos, ease);
      fc.mesh.rotation.x = t * Math.PI * 2;
      fc.mesh.rotation.z = t * Math.PI * 0.5;

      // Arc upward
      fc.mesh.position.y += Math.sin(t * Math.PI) * 0.8;

      // Shrink and fade at end
      if (t > 0.7) {
        var fadeT = (t - 0.7) / 0.3;
        var s = 0.8 * (1 - fadeT * 0.7);
        fc.mesh.scale.set(s, s, s);
      }

      if (t >= 1) {
        scene.remove(fc.mesh);
        // Dispose
        fc.mesh.traverse(function(child) {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (child.material.map) child.material.map.dispose();
            child.material.dispose();
          }
        });
        flyingCards.splice(i, 1);
      }
    }
  }

  // ========== MAIN LOOP ==========
  function animate() {
    rafId = requestAnimationFrame(animate);
    if (!clock) return;
    var dt = clock.getDelta();
    if (dt > 0.1) dt = 0.1; // cap

    updateLiquid(dt);
    updateFlyingCards(dt);

    if (gloveState === 'idle') {
      animateIdle(dt);
    } else if (gloveState === 'mixing') {
      animateMixing(dt);
    }

    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
  }

  // ========== RESIZE ==========
  function handleResize() {
    if (!renderer || !camera) return;
    var canvas = renderer.domElement;
    var parent = canvas.parentElement;
    if (!parent) return;
    var w = parent.clientWidth;
    var h = parent.clientHeight;
    if (w === 0 || h === 0) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  // ========== PUBLIC API ==========

  window.initBombShotThree = function(canvas) {
    if (isInitialized) return;
    if (!canvas || typeof THREE === 'undefined') return;

    var parent = canvas.parentElement;
    var w = parent ? parent.clientWidth : 360;
    var h = parent ? parent.clientHeight : 240;
    if (w === 0) w = 360;
    if (h === 0) h = 240;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0e0a08);

    // Camera — top-front view looking down at glass
    camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 50);
    camera.position.set(0, 3.5, 3.2);
    camera.lookAt(0, 1.2, 0);

    // Renderer
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Lights
    var ambient = new THREE.AmbientLight(0x443322, 0.6);
    scene.add(ambient);

    var dirLight = new THREE.DirectionalLight(0xffeedd, 0.8);
    dirLight.position.set(2, 5, 3);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 512;
    dirLight.shadow.mapSize.height = 512;
    scene.add(dirLight);

    // Warm point light (bar lamp feel)
    var warmLight = new THREE.PointLight(0xff9944, 0.6, 8);
    warmLight.position.set(0, 4, 0);
    scene.add(warmLight);

    // Rim light for glass
    var rimLight = new THREE.PointLight(0x88aaff, 0.3, 5);
    rimLight.position.set(-2, 2, -1);
    scene.add(rimLight);

    // Create objects
    createBar();
    createGlass();
    createLiquid();
    createGloves();

    window.addEventListener('resize', handleResize);
    clock = new THREE.Clock();
    isInitialized = true;
    animate();
  };

  window.destroyBombShotThree = function() {
    if (!isInitialized) return;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;

    window.removeEventListener('resize', handleResize);
    if (gloveTimer) { clearTimeout(gloveTimer); gloveTimer = null; }

    // Dispose flying cards
    flyingCards.forEach(function(fc) {
      if (fc.mesh) {
        scene.remove(fc.mesh);
        fc.mesh.traverse(function(child) {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (child.material.map) child.material.map.dispose();
            child.material.dispose();
          }
        });
      }
    });
    flyingCards = [];

    // Dispose scene objects
    if (scene) {
      scene.traverse(function(child) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (child.material.map) child.material.map.dispose();
          child.material.dispose();
        }
      });
    }

    if (renderer) {
      renderer.dispose();
      renderer = null;
    }

    scene = null;
    camera = null;
    glassGroup = null;
    liquidMesh = null;
    gloveL = null;
    gloveR = null;
    barTop = null;
    clock = null;
    isInitialized = false;
    gloveState = 'idle';
    liquidLevel = 0;
    targetLiquidLevel = 0;
    animTime = 0;
    mixCallback = null;
  };

  window.bsUpdateGlass = function(cardCount, maxCards, drink) {
    targetLiquidLevel = Math.min(cardCount / Math.max(maxCards, 1), 1);
    if (drink && DRINK_COLORS[drink] !== undefined) {
      drinkColor.setHex(DRINK_COLORS[drink]);
      if (liquidMesh) {
        liquidMesh.material.color.copy(drinkColor);
      }
    }
  };

  window.bsAnimateSubmit = function(count, cardTypes, callback) {
    if (!isInitialized) { if (callback) callback(); return; }
    // Spawn flying cards
    for (var i = 0; i < count; i++) {
      spawnFlyingCard(cardTypes ? cardTypes[i] : null, i * 150);
    }

    // Start mixing after cards arrive
    var totalDelay = count * 150 + 700;
    setTimeout(function() {
      if (!isInitialized) { if (callback) callback(); return; }
      gloveState = 'mixing';
      animTime = 0;
      mixCallback = callback || null;

      gloveTimer = setTimeout(function() {
        endMixing();
        gloveTimer = null;
      }, 1500);
    }, totalDelay);
  };

  window.bsAnimateLiarReveal = function(callback) {
    if (!isInitialized) { if (callback) callback(); return; }
    // Shake glass dramatically
    gloveState = 'mixing';
    animTime = 0;

    gloveTimer = setTimeout(function() {
      if (!isInitialized) { if (callback) callback(); return; }
      endMixing();
      if (callback) callback();
      gloveTimer = null;
    }, 800);
  };

  window.bsSetDrinkType = function(drink) {
    if (DRINK_COLORS[drink] !== undefined) {
      drinkColor.setHex(DRINK_COLORS[drink]);
      if (liquidMesh) {
        liquidMesh.material.color.copy(drinkColor);
      }
    }
  };

  window.bsResetGlass = function() {
    targetLiquidLevel = 0;
    liquidLevel = 0;
    if (liquidMesh) liquidMesh.visible = false;
  };

  window.bsIsInitialized = function() {
    return isInitialized;
  };

})();
