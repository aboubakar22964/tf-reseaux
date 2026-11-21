(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Photos: show the real image when the file exists, keep the placeholder otherwise
  document.querySelectorAll('.ph img').forEach(img => {
    const ok = () => img.closest('.ph').classList.add('has-img');
    if (img.complete) { img.naturalWidth ? ok() : img.remove(); return; }
    img.addEventListener('load', ok);
    img.addEventListener('error', () => img.remove());
  });

  // Header turns solid after the hero
  const header = document.getElementById('top');
  const onScroll = () => header.classList.toggle('solid', scrollY > innerHeight * 0.6);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  // Form: sent to the Apps Script web app, which emails the PDF
  const DEVIS_URL = '';
  document.getElementById('devisForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target, msg = document.getElementById('formMsg'), btn = f.querySelector('button[type=submit]');
    const missing = [...f.querySelectorAll('[required]')].filter(i => !i.value.trim());
    if (missing.length) { msg.textContent = 'Merci de renseigner votre nom, votre téléphone et votre email.'; missing[0].focus(); return; }
    if (!f.email.checkValidity()) { msg.textContent = "L'adresse email ne semble pas valide."; f.email.focus(); return; }
    if (!/^[+0-9 ().-]{6,30}$/.test(f.tel.value.trim())) { msg.textContent = 'Le numéro de téléphone ne semble pas valide.'; f.tel.focus(); return; }
    if (!DEVIS_URL) { msg.textContent = "Formulaire en préparation : votre demande n'a pas été transmise."; return; }
    btn.disabled = true; msg.textContent = 'Envoi en cours…';
    try {
      // text/plain: Apps Script does not answer CORS preflight requests
      const res = await fetch(DEVIS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.fromEntries(new FormData(f))) });
      const data = await res.json();
      if (!data.ok) throw new Error('refused');
      f.reset();
      msg.textContent = 'Votre demande a bien été envoyée. Nous vous recontactons pour fixer une visite.';
    } catch {
      msg.textContent = "L'envoi a échoué et votre demande n'a pas été transmise. Merci de réessayer dans quelques minutes.";
    } finally { btn.disabled = false; }
  });

  // ---------- Fibre light layer (three.js) ----------
  function fibre() {
    const canvas = document.getElementById('fibre');
    if (!window.THREE || !canvas) return;
    const hero = canvas.parentElement;
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    const scene = new THREE.Scene();
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
    const group = new THREE.Group(); scene.add(group);

    // round soft sprite
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(.35, 'rgba(255,255,255,.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    const sprite = new THREE.CanvasTexture(c);

    const LINES = 13, PULSES = 26, TRAIL = 8;
    let curves = [], lineObjs = [], W = 1, H = 1;
    const copper = new THREE.Color('#C8773A'), yellow = new THREE.Color('#F2C230'), white = new THREE.Color('#9FB6CE');
    const pulses = Array.from({ length: PULSES }, (_, i) => ({
      line: i % LINES, t: Math.random(), speed: .035 + Math.random() * .06,
      col: i % 9 === 0 ? yellow : (i % 3 === 0 ? white : copper)
    }));
    const pGeo = new THREE.BufferGeometry();
    const pPos = new Float32Array(PULSES * TRAIL * 3), pCol = new Float32Array(PULSES * TRAIL * 3);
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
    const pMat = new THREE.PointsMaterial({ size: 9, map: sprite, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: false });
    group.add(new THREE.Points(pGeo, pMat));

    function build() {
      W = hero.clientWidth; H = hero.clientHeight;
      renderer.setSize(W, H, false);
      Object.assign(cam, { left: -W / 2, right: W / 2, top: H / 2, bottom: -H / 2 }); cam.updateProjectionMatrix();
      lineObjs.forEach(l => { group.remove(l); l.geometry.dispose(); });
      lineObjs = []; curves = [];
      for (let i = 0; i < LINES; i++) {
        // cables bundle in, fan out, bundle again: like a chemin de câbles seen in perspective
        const k = i / (LINES - 1) - .5, y0 = -H * .08 + k * H * .06;
        const pts = [
          new THREE.Vector3(-W * .6, y0 + k * H * .5, 0),
          new THREE.Vector3(-W * .2, y0 + k * H * .08 - H * .05, 0),
          new THREE.Vector3(W * .15, y0 + k * H * .22 + H * .02, 0),
          new THREE.Vector3(W * .6, y0 + H * .18 + k * H * .7, 0)
        ];
        const curve = new THREE.CatmullRomCurve3(pts); curves.push(curve);
        const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(160));
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .07 + (i % 4 === 0 ? .08 : 0), blending: THREE.AdditiveBlending, depthWrite: false }));
        group.add(line); lineObjs.push(line);
      }
    }
    build();
    let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(build, 150); });

    let mx = 0, my = 0;
    addEventListener('pointermove', e => { mx = e.clientX / innerWidth - .5; my = e.clientY / innerHeight - .5; }, { passive: true });

    const v = new THREE.Vector3();
    let last = performance.now(), visible = true;
    new IntersectionObserver(([e]) => visible = e.isIntersecting).observe(hero);
    (function tick(now) {
      requestAnimationFrame(tick);
      const dt = Math.min((now - last) / 1000, .05); last = now;
      if (!visible) return;
      pulses.forEach((p, i) => {
        p.t += p.speed * dt; if (p.t > 1) { p.t = 0; p.line = Math.floor(Math.random() * LINES); }
        for (let j = 0; j < TRAIL; j++) {
          const tt = Math.max(0, p.t - j * .006);
          curves[p.line].getPointAt(tt, v);
          const o = (i * TRAIL + j) * 3, fade = (1 - j / TRAIL) ** 2 * (p.t < .04 ? p.t / .04 : 1);
          pPos[o] = v.x; pPos[o + 1] = v.y; pPos[o + 2] = 0;
          pCol[o] = p.col.r * fade; pCol[o + 1] = p.col.g * fade; pCol[o + 2] = p.col.b * fade;
        }
      });
      pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
      group.position.x += (mx * 30 - group.position.x) * .04;
      group.position.y += (-my * 20 - group.position.y) * .04;
      renderer.render(scene, cam);
    })(last);
  }
  if (!reduce) fibre();

  // ---------- GSAP choreography ----------
  if (!window.gsap || reduce) return;
  gsap.registerPlugin(ScrollTrigger);
  gsap.ticker.lagSmoothing(0); // l'intro finit à l'heure même sur une machine lente

  // scroll progress
  gsap.to('#progress', { scaleX: 1, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: .2 } });

  // hero: lines rise, photo settles
  const intro = gsap.timeline({ defaults: { ease: 'expo.out' } });
  intro.from('.hero .ph img', { scale: 1.18, duration: 2.4, ease: 'power3.out' }, 0)
       .from('#heroTitle .l span', { yPercent: 110, duration: 1.3, stagger: .1 }, .2)
       .from('.hero-sub > *', { y: 24, opacity: 0, duration: 1, stagger: .12 }, .7)
       .from('header.top', { y: -20, opacity: 0, duration: .8 }, .5);
  gsap.to('.hero .ph', { yPercent: 18, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
  gsap.to('.hero-in', { yPercent: -30, opacity: .2, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'center center', end: 'bottom top', scrub: true } });


  // manifesto: words light up with scroll
  const m = document.getElementById('manifest');
  m.innerHTML = m.textContent.split(/(\s+)/).map(w => w.trim() ? `<span class="w">${w}</span>` : w).join('');
  gsap.fromTo('#manifest .w', { opacity: .18 }, { opacity: 1, stagger: .05, ease: 'none',
    scrollTrigger: { trigger: '#manifest', start: 'top 80%', end: 'bottom 45%', scrub: true } });

  // copper rules draw in
  gsap.utils.toArray('.rule').forEach(r => gsap.from(r, { scaleX: 0, duration: 1.1, ease: 'expo.out', scrollTrigger: { trigger: r, start: 'top 92%' } }));

  // image reveals (outside the pinned track)
  gsap.utils.toArray('.refs .ph, .metiers-head + .track .ph').forEach(ph => {
    if (ph.closest('.track') && matchMedia('(min-width:901px)').matches) return;
    gsap.fromTo(ph, { clipPath: 'inset(18% 0% 18% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.4, ease: 'expo.out', scrollTrigger: { trigger: ph, start: 'top 88%' } });
    const img = ph.querySelector('img');
    if (img) gsap.fromTo(img, { yPercent: -8, scale: 1.15 }, { yPercent: 8, scale: 1.15, ease: 'none', scrollTrigger: { trigger: ph, start: 'top bottom', end: 'bottom top', scrub: true } });
  });

  // métiers: pinned horizontal gallery on desktop
  const mm = gsap.matchMedia();
  mm.add('(min-width: 901px)', () => {
    const track = document.getElementById('track');
    const dist = () => track.scrollWidth - innerWidth;
    const tween = gsap.to(track, { x: () => -dist(), ease: 'none',
      scrollTrigger: { trigger: '.metiers', start: 'top top', end: () => '+=' + dist(), pin: true, scrub: 1, invalidateOnRefresh: true } });
    gsap.utils.toArray('.panel').forEach(p => {
      if (p.querySelector('img')) gsap.fromTo(p.querySelector('img'), { xPercent: -6, scale: 1.14 }, { xPercent: 6, scale: 1.14, ease: 'none',
        scrollTrigger: { trigger: p, containerAnimation: tween, start: 'left right', end: 'right left', scrub: true } });
      gsap.from(p.querySelectorAll('.panel-txt > *'), { y: 30, opacity: 0, stagger: .06, duration: .9, ease: 'power3.out',
        scrollTrigger: { trigger: p, containerAnimation: tween, start: 'left 70%' } });
    });
  });

  // velocity band (inspired by Magic UI scroll-based-velocity)
  const rows = [['#band1', 1], ['#band2', -1]].map(([s, dir]) => ({ el: document.querySelector(s), dir, x: 0 }));
  let boost = 0;
  ScrollTrigger.create({ trigger: '.band', start: 'top bottom', end: 'bottom top',
    onUpdate: self => boost = gsap.utils.clamp(-12, 12, self.getVelocity() / 300) });
  gsap.ticker.add((t, dt) => {
    boost *= .94;
    rows.forEach(r => {
      const half = r.el.scrollWidth / 2;
      r.x -= r.dir * (0.6 + Math.abs(boost)) * (dt / 16) * (boost < 0 ? -1 : 1);
      r.x = gsap.utils.wrap(-half, 0, r.x);
      r.el.style.transform = `translate3d(${r.x}px,0,0)`;
    });
  });

  // steps
  gsap.from('.step > :not(.rule)', { y: 24, opacity: 0, stagger: .05, duration: .9, ease: 'power3.out', scrollTrigger: { trigger: '.steps', start: 'top 85%' } });

  // devis section
  gsap.from('.devis h2, .devis .lead, .contact > div, form .f, form .btn', { y: 28, opacity: 0, stagger: .05, duration: .9, ease: 'power3.out', scrollTrigger: { trigger: '.devis', start: 'top 75%' } });

  addEventListener('load', () => ScrollTrigger.refresh());
})();
