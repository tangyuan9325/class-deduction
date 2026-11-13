/* ============================================================
 * 巨型徽标场景 · Liquid Glass
 *
 *   enter()      开屏结束后淡入右下角水印
 *   flyToSlot()  登录成功后：半透明 → 顶层不透明 → 飞向左上角徽标槽
 *   reset()      退出登录，回到水印状态
 *
 *   高光跟随：只在指针进入徽标范围内时点亮，位移走 transform，不重绘渐变
 * ============================================================ */
(function(){
  'use strict';
  var scene = document.getElementById('brandScene');
  var logo  = document.getElementById('sceneLogo');
  if(!scene || !logo) return;

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var state = 'idle';          // idle | watermark | rising | flying | hidden
  var inside = false, raf = 0, px = 0, py = 0;

  function inApp(){ return document.body.classList.contains('in-app'); }

  // ---------- 指针高光 ----------
  function onMove(e){
    if(state !== 'watermark' && state !== 'rising') return;
    var r = logo.getBoundingClientRect();
    if(!r.width) return;
    var hit = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if(hit !== inside){
      inside = hit;
      scene.classList.toggle('has-ptr', hit);
    }
    if(!hit) return;
    px = e.clientX - (r.left + r.width / 2);
    py = e.clientY - (r.top + r.height / 2);
    if(!raf){
      raf = requestAnimationFrame(function(){
        raf = 0;
        logo.style.setProperty('--sx', px.toFixed(1) + 'px');
        logo.style.setProperty('--sy', py.toFixed(1) + 'px');
      });
    }
  }
  window.addEventListener('pointermove', onMove, { passive:true });
  document.addEventListener('mouseleave', function(){
    inside = false; scene.classList.remove('has-ptr');
  });

  // ---------- 状态切换 ----------
  function enter(){
    if(state === 'watermark' || state === 'rising' || state === 'flying') return;
    if(inApp()){ state = 'hidden'; return; }   // 已登录直接进应用，不播水印
    state = 'watermark';
    scene.classList.remove('is-rise', 'is-fade');
    logo.style.transform = '';
    scene.classList.add('is-on');          // 0.9s 淡入，不做位移，避免从上一轮位置滑进来
  }

  function reset(){
    if(state === 'flying') return;
    inside = false;
    scene.classList.remove('has-ptr');
    logo.style.transform = '';
    logo.style.setProperty('--sx', '0px');
    logo.style.setProperty('--sy', '0px');
    if(state === 'watermark' || state === 'rising'){ state = 'watermark'; return; }
    enter();
  }

  function hide(){
    state = 'hidden';
    scene.classList.remove('is-on', 'is-rise', 'has-ptr');
    logo.style.transform = '';
  }

  // ---------- 登录：升为顶层，再飞向左上角 ----------
  function flyToSlot(){
    return new Promise(function(resolve){
      if(state !== 'watermark'){ hide(); resolve(); return; }
      state = 'rising';
      scene.classList.add('is-rise');

      var target = document.querySelector('#appView:not(.hide) .brand .mark');
      var narrow = window.innerWidth <= 820;
      var wait = reduce ? 0 : 560;

      setTimeout(function(){
        if(!target || narrow || reduce){
          if(target && narrow){ /* 抽屉里的槽位不在视口内，直接交接 */ }
          if(target) target.style.opacity = '';
          scene.classList.add('is-fade');
          scene.classList.remove('is-on', 'is-rise');
          logo.style.transform = '';
          state = 'hidden';
          setTimeout(function(){ scene.classList.remove('is-fade'); }, 60);
          resolve();
          return;
        }

        state = 'flying';
        var a = logo.getBoundingClientRect();
        var b = target.getBoundingClientRect();
        var dx = (b.left + b.width / 2) - (a.left + a.width / 2);
        var dy = (b.top + b.height / 2) - (a.top + a.height / 2);
        var sc = b.width / a.width;
        target.style.opacity = '0';

        var anim = logo.animate([
          { transform:'translate(0,0) scale(1)' },
          { transform:'translate(' + (dx * .52) + 'px,' + (dy * .52 - 46) + 'px) scale(' + (sc + (1 - sc) * .52) + ')', offset:.56 },
          { transform:'translate(' + dx + 'px,' + dy + 'px) scale(' + sc + ')' }
        ], { duration:860, easing:'cubic-bezier(.4,0,.2,1)', fill:'both' });

        anim.onfinish = function(){
          target.style.opacity = '';
          logo.style.transform = '';
          try{ anim.cancel(); }catch(e){}   // 释放 fill:both，退出登录后才能回到原位
          scene.classList.add('is-fade');
          scene.classList.remove('is-on', 'is-rise', 'has-ptr');
          state = 'hidden';
          setTimeout(function(){ scene.classList.remove('is-fade'); }, 60);
          resolve();
        };
      }, wait);
    });
  }

  window.CMBrand = { enter:enter, reset:reset, hide:hide, flyToSlot:flyToSlot };

  // ---------- 开屏结束 → 出现水印 ----------
  var splash = document.getElementById('splash');
  if(splash && splash.classList.contains('is-gone')) enter();
  else window.addEventListener('cm:splash-done', enter, { once:true });
})();
