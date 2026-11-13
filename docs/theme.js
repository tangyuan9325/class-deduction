/* ============================================================
 * 外观：深浅色 + 字体模式
 *
 *   本文件在 <head> 同步执行，先给 <html> 打上 data-theme / data-font，
 *   保证首帧就是正确配色，不会先白一下再变暗。
 *   控件绑定放在 DOMContentLoaded，页面里可以有多组控件（登录页、侧栏）。
 * ============================================================ */
(function(){
  'use strict';
  var THEME_KEY = 'cm_theme';
  var FONT_KEY  = 'cm_font';
  var FONTS = ['mono', 'display'];
  var root = document.documentElement;

  function read(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
  function write(k, v){ try{ localStorage.setItem(k, v); }catch(e){} }

  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  var theme = read(THEME_KEY);
  if(theme !== 'dark' && theme !== 'light') theme = (mq && mq.matches) ? 'dark' : 'light';
  var font = read(FONT_KEY);
  if(font === 'serif') font = 'mono';          // 旧版本存过宋体，迁到等宽
  if(FONTS.indexOf(font) < 0) font = 'mono';   // 默认 JetBrains Mono

  root.setAttribute('data-theme', theme);
  root.setAttribute('data-font', font);

  function paintMeta(){
    var m = document.querySelector('meta[name="theme-color"]');
    if(!m) return;
    // 入场仪式期间固定在棕褐，遮罩消失后再交给主题
    var booting = root.classList.contains('splash-boot');
    var dark = root.getAttribute('data-theme') === 'dark';
    m.setAttribute('content', booting ? (dark ? '#1b1b19' : '#f7f4ee') : (dark ? '#15120e' : '#f7f4ee'));
  }
  paintMeta();
  if(font === 'display'){
    if(document.fonts && document.fonts.load){
      document.fonts.load('400 14px "Genshin SC"', '班级量化考核').catch(function(){});
    }
  }
  if(window.MutationObserver){
    new MutationObserver(paintMeta).observe(root, { attributes:true, attributeFilter:['class', 'data-theme'] });
  }

  var themingTimer = 0;
  function flash(){
    root.classList.add('is-theming');
    clearTimeout(themingTimer);
    themingTimer = setTimeout(function(){ root.classList.remove('is-theming'); }, 260);
  }

  function applyTheme(next, animate){
    if(animate) flash();
    root.setAttribute('data-theme', next);
    write(THEME_KEY, next);
    paintMeta();
    sync();
  }

  // 原神字体约 140KB，首次切换时才下载；下载期间按钮呼吸，加载完成自动替换
  var genLoading = false;
  function warmGenshin(){
    if(genLoading || !document.fonts || document.fonts.check('14px "Genshin SC"')) return;
    genLoading = true;
    document.querySelectorAll('button[data-font="display"]').forEach(function(b){ b.classList.add('is-loading'); });
    var done = function(){
      genLoading = false;
      document.querySelectorAll('button[data-font="display"]').forEach(function(b){ b.classList.remove('is-loading'); });
    };
    document.fonts.load('400 14px "Genshin SC"', '班级量化考核').then(done, done);
  }

  function applyFont(next){
    root.setAttribute('data-font', next);
    write(FONT_KEY, next);
    sync();
    if(next === 'display') warmGenshin();
  }

  function sync(){
    var t = root.getAttribute('data-theme');
    var f = root.getAttribute('data-font');
    document.querySelectorAll('[data-theme-toggle]').forEach(function(btn){
      btn.setAttribute('aria-pressed', t === 'dark' ? 'true' : 'false');
      btn.setAttribute('title', t === 'dark' ? '切换到浅色' : '切换到深色');
      btn.setAttribute('aria-label', t === 'dark' ? '切换到浅色模式' : '切换到深色模式');
    });
    document.querySelectorAll('button[data-font]').forEach(function(btn){
      var on = btn.getAttribute('data-font') === f;
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function bind(){
    document.querySelectorAll('[data-theme-toggle]').forEach(function(btn){
      btn.addEventListener('click', function(){
        applyTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark', true);
      });
    });
    document.querySelectorAll('.seg [data-font]').forEach(function(btn){
      btn.addEventListener('click', function(){ applyFont(btn.getAttribute('data-font')); });
    });
    sync();
    // 没有手动选过时，跟随系统
    if(mq && mq.addEventListener){
      mq.addEventListener('change', function(e){
        if(read(THEME_KEY)) return;
        applyTheme(e.matches ? 'dark' : 'light', true);
      });
    }
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();

  window.CMAppearance = { theme: function(){ return root.getAttribute('data-theme'); }, font: function(){ return root.getAttribute('data-font'); } };
})();
