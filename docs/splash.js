/* ============================================================
 * 入场仪式 · 分镜实现（总长 3.6s，可跳过）
 *
 *   Phase 0  0ms    → 400ms   棕褐画布 + 中心金色光晕放大
 *   Phase 1  400ms  → 1800ms  七根白条错峰 90ms 飞入 + 落位回弹，金点 1680ms 弹入
 *   Phase 2  1800ms → 2200ms  整组呼吸 + 金色细环扩散
 *   Phase 3  2200ms → 2900ms  FLIP 归位到导航/品牌槽位（含残影拖尾）
 *   Phase 4  2900ms → 3600ms  遮罩淡出 + 内容按 80ms 错峰呼吸渐显
 *
 *   同会话二次进入：600ms 精简版；prefers-reduced-motion：300ms 淡入
 * ============================================================ */
(function(){
  'use strict';
  const splash = document.getElementById('splash');
  if(!splash) return;

  const KEY = 'cm_splash_v1';
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const narrow = window.matchMedia('(max-width: 640px)').matches;
  const bars = Array.prototype.slice.call(splash.querySelectorAll('[data-bar]'));
  const logo = document.getElementById('splashLogo');
  const dot = splash.querySelector('.splash-dot');
  const halo = splash.querySelector('.splash-halo');
  const glow = splash.querySelector('.splash-glow');
  const word = splash.querySelector('.splash-word');
  const sub = splash.querySelector('.splash-sub');

  let done = false, target = null;
  const anims = [];
  const play = (el, kf, opt) => { const a = el.animate(kf, opt); anims.push(a); return a; };

  document.body.classList.add('splash-on');

  // ---------- 终态 ----------
  function finishState(){
    if(target) target.style.opacity = '';
    splash.classList.add('is-gone');
    document.body.classList.remove('splash-on');
    document.documentElement.classList.remove('splash-boot');
    document.querySelectorAll('.rv').forEach(el=>{
      el.classList.remove('rv');
      el.style.removeProperty('--rv-i');
    });
    ['pointerdown','wheel','keydown','touchstart'].forEach(ev=>{
      document.removeEventListener(ev, skip, true);
    });
  }

  function skip(){
    if(done) return;
    done = true;
    anims.forEach(a=>{ try{ a.finish(); }catch(e){} });
    finishState();
  }

  ['pointerdown','wheel','keydown','touchstart'].forEach(ev=>{
    document.addEventListener(ev, skip, { capture:true, passive:true });
  });

  // ---------- Phase 4：内容呼吸渐显 ----------
  function reveal(){
    const scope = document.querySelector('#appView:not(.hide)') || document.getElementById('loginView');
    if(!scope) return;
    const isLogin = scope.id === 'loginView';
    const sels = isLogin
      ? ['h1','p','.lead-stats','.lead-foot','.login-card']
      : ['.menu','.page-head','.stat','.card'];
    let i = 0;
    sels.forEach(sel=>{
      scope.querySelectorAll(sel).forEach(el=>{
        if(i > 8) return;
        el.classList.add('rv');
        el.style.setProperty('--rv-i', i++);
      });
    });
  }

  function pickTarget(){
    const app = document.querySelector('#appView:not(.hide) .brand .mark');
    const login = document.querySelector('#loginView:not(.hide) .markline .mark');
    return [app, login].filter(Boolean).find(el=>el.getBoundingClientRect().width > 0) || null;
  }

  // ---------- 完整分镜 ----------
  function runFull(){
    // Phase 0
    play(logo, [{ opacity:0 }, { opacity:1 }], { duration:300, easing:'ease-out', fill:'both' });
    play(glow, [
      { opacity:0, transform:'scale(.6)' },
      { opacity:.25, transform:'scale(1)' }
    ], { duration:400, easing:'ease-out', fill:'both' });

    // 基线与两端小金点随最后一根条一起落定
    splash.querySelectorAll('.splash-base').forEach((el, i)=>{
      play(el, [{ opacity:0 }, { opacity:1 }], { duration:260, delay:900 + i * 40, fill:'both' });
    });

    // Phase 1：七条飞入，90ms 错峰
    const unit = (logo.getBoundingClientRect().width || 88) / 64;
    const base = (narrow ? 150 : 300) + Math.random() * (narrow ? 150 : 300);
    bars.forEach((b, i)=>{
      const cluster = i % 3;                       // 0 左 / 1 右 / 2 下
      const ang = cluster === 0 ? Math.PI + (Math.random() - .5) * .34
                : cluster === 1 ? (Math.random() - .5) * .34
                : Math.PI / 2 + (Math.random() - .5) * .5;
      const dx = Math.cos(ang) * base;
      const dy = Math.sin(ang) * base;
      const rot = (cluster === 1 ? 1 : -1) * (18 + Math.random() * 12);
      play(b, [
        { transform:`translate(${dx/unit}px,${dy/unit}px) rotate(${rot}deg) scale(.4)`, opacity:0 },
        { transform:'translate(0,0) rotate(0deg) scale(1.06)', opacity:1, offset:.86 },
        { transform:'translate(0,0) rotate(0deg) scale(1)', opacity:1 }
      ], { duration:600, delay:400 + i * 90, easing:'cubic-bezier(.65,0,.35,1)', fill:'both' });
    });

    // 金点：最后一根落位后 120ms
    play(dot, [
      { opacity:0, transform:'scale(0)' },
      { opacity:1, transform:'scale(1.2)', offset:.7 },
      { opacity:1, transform:'scale(1)' }
    ], { duration:420, delay:1680, easing:'cubic-bezier(.34,1.4,.64,1)', fill:'both' });

    play(word, [{ opacity:0, transform:'translateY(10px)' }, { opacity:1, transform:'none' }],
      { duration:520, delay:1480, easing:'cubic-bezier(.22,1,.36,1)', fill:'both' });
    play(sub, [{ opacity:0 }, { opacity:.9 }], { duration:400, delay:1640, fill:'both' });

    // Phase 2：呼吸 + 金环
    play(logo.querySelector('svg'), [
      { transform:'scale(1)' },
      { transform:'scale(1.04)', offset:.5 },
      { transform:'scale(1)' }
    ], { duration:400, delay:1800, easing:'ease-in-out', fill:'both' });
    play(halo, [
      { transform:'scale(.8)', opacity:.6 },
      { transform:'scale(1.8)', opacity:0 }
    ], { duration:600, delay:1800, easing:'ease-out', fill:'both' });

    // Phase 3：FLIP 归位（到点才建残影，避免提前出现在画面上）
    setTimeout(()=>{
      if(done) return;
      const t = pickTarget();
      if(!t){
        play(logo, [{ opacity:1 }, { opacity:0 }], { duration:400, easing:'ease-out', fill:'both' });
        return;
      }
      const s = logo.getBoundingClientRect();
      const r = t.getBoundingClientRect();
      const dx = (r.left + r.width / 2) - (s.left + s.width / 2);
      const dy = (r.top + r.height / 2) - (s.top + s.height / 2);
      const sc = r.width / s.width;
      t.style.opacity = '0';
      target = t;

      // 残影：克隆一份同尺寸副本，跟随移动并淡出
      const sr = logo.parentNode.getBoundingClientRect();
      const ghost = logo.cloneNode(true);
      ghost.removeAttribute('id');
      ghost.style.cssText = `position:absolute;left:${s.left - sr.left}px;top:${s.top - sr.top}px;` +
        `width:${s.width}px;height:${s.height}px;pointer-events:none;opacity:0`;
      logo.parentNode.appendChild(ghost);
      const g = play(ghost, [
        { transform:'translate(0,0) scale(1)', opacity:.55 },
        { transform:`translate(${dx * .55}px,${dy * .55 - 26}px) scale(${(1 + sc) / 2})`, opacity:.26, offset:.55 },
        { transform:`translate(${dx}px,${dy}px) scale(${sc})`, opacity:0 }
      ], { duration:700, easing:'cubic-bezier(.4,0,.2,1)', fill:'both' });
      g.onfinish = ()=>ghost.remove();

      play(logo, [
        { transform:'translate(0,0) scale(1)' },
        { transform:`translate(${dx * .55}px,${dy * .55 - 26}px) scale(${(1 + sc) / 2 * .99})`, offset:.55 },
        { transform:`translate(${dx}px,${dy}px) scale(${sc})` }
      ], { duration:700, easing:'cubic-bezier(.4,0,.2,1)', fill:'both' });
    }, 2200);

    // Phase 4：揭开遮罩 + 内容渐显
    reveal();
    play(splash, [{ opacity:1 }, { opacity:0 }], { duration:600, delay:2900, easing:'ease-out', fill:'both' });

    setTimeout(()=>{ if(!done){ done = true; finishState(); } }, 3560);
  }

  // ---------- 600ms 精简版 ----------
  function runLite(){
    play(glow, [{ opacity:0 }, { opacity:.18 }], { duration:300, fill:'both' });
    play(logo, [
      { opacity:0, transform:'scale(.92)' },
      { opacity:1, transform:'scale(1)' }
    ], { duration:320, easing:'ease-out', fill:'both' });
    play(word, [{ opacity:0 }, { opacity:.9 }], { duration:300, delay:100, fill:'both' });
    reveal();
    play(splash, [{ opacity:1 }, { opacity:0 }], { duration:300, delay:300, fill:'both' });
    setTimeout(()=>{ if(!done){ done = true; finishState(); } }, 640);
  }

  // ---------- 无障碍：300ms 淡入 ----------
  function runReduced(){
    reveal();
    play(splash, [{ opacity:1 }, { opacity:0 }], { duration:300, delay:120, fill:'both' });
    setTimeout(()=>{ if(!done){ done = true; finishState(); } }, 460);
  }

  let seen = false;
  try{ seen = sessionStorage.getItem(KEY) === '1'; }catch(e){}
  try{ sessionStorage.setItem(KEY, '1'); }catch(e){}

  if(reduce) runReduced();
  else if(seen) runLite();
  else runFull();
})();
