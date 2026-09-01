/*
 * 建築現場スケジュール管理 - kintone JS カスタマイズ v3
 * =====================================================
 * 設定方法:
 *   アプリの設定 > JavaScriptでカスタマイズ > このファイルをアップロード
 *
 * カスタムビュー設定:
 *   一覧の設定 > 種別: カスタマイズビュー
 *   HTML欄: <div id="schedule-root"></div>
 *
 * kintoneフィールド (App ID: 160):
 *   現場名   / 開始日 / 終了日 / 開始時間 / 担当者 / 作成者
 *   備考     (複数行テキスト)
 *   種別     (ドロップダウン: 工事現場 / 会社行事 / 期日管理)
 */
(function () {
  'use strict';

  /* ====================================================================
   * VIEWER MODE (閲覧専用モード - GitHub Pages等で使用)
   * window.SCHEDULE_VIEWER_MODE = true; を事前にセットすると有効化
   * window.SCHEDULE_VIEWER_GAS_URL に GAS WebApp の URL をセット
   * ==================================================================== */
  const VIEWER_MODE = (typeof window !== 'undefined' && window.SCHEDULE_VIEWER_MODE === true);
  const VIEWER_GAS_URL = (typeof window !== 'undefined' && window.SCHEDULE_VIEWER_GAS_URL) || '';
  const __viewerCache = new Map(); // rangeKey -> { data, time }
  const VIEWER_CACHE_TTL = 300000; // 5分（GAS側キャッシュと合わせる）

  /* ====================================================================
   * THEME DEFINITIONS
   * ==================================================================== */
  const THEMES = {
    dark: {
      '--bg'      : '#1a1a1a',
      '--surface' : '#242424',
      '--surface2': '#2e2e2e',
      '--border'  : '#444444',
      '--accent'  : '#e8820c',
      '--accent2' : '#c96a00',
      '--text'    : '#e8e0d0',
      '--text-dim': '#999999',
      '--danger'  : '#c0392b',
      '--success' : '#27ae60',
      '--info'    : '#2980b9',
      '--ev-color': '#e8820c',   // 工事現場イベント色
      '--ev-bg'   : 'rgba(232,130,12,.15)',
      '--ev-border': 'rgba(232,130,12,.4)',
      '--ce-color': '#5dade2',   // 会社行事イベント色
      '--ce-bg'   : 'rgba(93,173,226,.15)',
      '--ce-border': 'rgba(93,173,226,.4)',
      '--dl-color': '#ff3b3b',   // 期日管理イベント色（目立つ赤）
      '--dl-bg'   : 'rgba(255,59,59,.18)',
      '--dl-border': 'rgba(255,59,59,.55)',
      '--holiday-color': '#ff6b5b', // 休日ハイライト色
      '--holiday-bg'   : 'rgba(255,107,91,.16)',
      '--sat-bg'       : 'rgba(93,173,226,.14)', // 土曜ハイライト背景
    },
    light: {
      '--bg'      : '#f2f2ef',
      '--surface' : '#ffffff',
      '--surface2': '#ebebeb',
      '--border'  : '#d0d0cc',
      '--accent'  : '#cc7000',
      '--accent2' : '#a85800',
      '--text'    : '#1a1a1a',
      '--text-dim': '#666666',
      '--danger'  : '#c0392b',
      '--success' : '#1a7a3f',
      '--info'    : '#1a5276',
      '--ev-color': '#cc7000',
      '--ev-bg'   : 'rgba(204,112,0,.12)',
      '--ev-border': 'rgba(204,112,0,.45)',
      '--ce-color': '#1a5276',
      '--ce-bg'   : 'rgba(26,82,118,.12)',
      '--ce-border': 'rgba(26,82,118,.4)',
      '--dl-color': '#c0151c',   // 期日管理イベント色（ライト：濃い赤）
      '--dl-bg'   : 'rgba(192,21,28,.13)',
      '--dl-border': 'rgba(192,21,28,.5)',
      '--holiday-color': '#c0392b', // 休日ハイライト色
      '--holiday-bg'   : 'rgba(192,57,43,.12)',
      '--sat-bg'       : 'rgba(93,173,226,.12)', // 土曜ハイライト背景
    }
  };

  /* ====================================================================
   * CSS
   * ==================================================================== */
  const SCHEDULE_CSS = `
  :root {
    --bg:#1a1a1a;--surface:#242424;--surface2:#2e2e2e;--border:#444;
    --accent:#e8820c;--accent2:#c96a00;--text:#e8e0d0;--text-dim:#999;
    --danger:#c0392b;--success:#27ae60;--info:#2980b9;
    --ev-color:#e8820c;--ev-bg:rgba(232,130,12,.15);--ev-border:rgba(232,130,12,.4);
    --ce-color:#5dade2;--ce-bg:rgba(93,173,226,.15);--ce-border:rgba(93,173,226,.4);
    --dl-color:#ff3b3b;--dl-bg:rgba(255,59,59,.18);--dl-border:rgba(255,59,59,.55);
    --holiday-color:#ff6b5b;--holiday-bg:rgba(255,107,91,.16);--sat-bg:rgba(93,173,226,.14);
  }
  #schedule-root *,#schedule-root *::before,#schedule-root *::after{box-sizing:border-box;margin:0;padding:0;}
  #schedule-root{font-family:'Hiragino Kaku Gothic ProN','Meiryo',sans-serif;background:var(--bg);color:var(--text);border-radius:6px;overflow:hidden;transition:background .3s,color .3s;}

  /* HEADER */
  #schedule-root header{background:linear-gradient(135deg,var(--surface) 0%,var(--surface2) 100%);border-bottom:3px solid var(--accent);padding:8px 16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
  #schedule-root .logo{font-size:24px;}
  #schedule-root .title-block h1{font-size:1.15rem;font-weight:700;color:var(--accent);text-shadow:0 0 12px rgba(232,130,12,.3);}
  #schedule-root .title-block .sub{font-size:.68rem;color:var(--text-dim);}
  #schedule-root .header-controls{display:flex;align-items:center;gap:8px;margin-left:auto;flex-wrap:wrap;}
  #schedule-root .view-toggle{display:flex;border:1px solid var(--border);border-radius:5px;overflow:hidden;}
  #schedule-root .view-btn{background:var(--surface2);border:none;color:var(--text-dim);padding:6px 14px;cursor:pointer;font-size:.8rem;font-weight:700;transition:background .2s,color .2s;}
  #schedule-root .view-btn.active{background:var(--accent);color:#fff;}
  #schedule-root .view-btn:hover:not(.active){background:var(--surface);color:var(--text);}
  #schedule-root .refresh-area{display:flex;align-items:center;gap:6px;background:var(--surface2);border:1px solid var(--border);border-radius:5px;padding:4px 10px;font-size:.78rem;}
  #schedule-root .refresh-area label{color:var(--text-dim);}
  #schedule-root .refresh-area select{background:var(--bg);border:1px solid var(--border);color:var(--text);border-radius:3px;padding:2px 4px;font-size:.78rem;outline:none;}
  #schedule-root .refresh-toggle{background:none;border:1px solid var(--border);color:var(--text-dim);border-radius:4px;padding:3px 8px;cursor:pointer;font-size:.75rem;transition:all .2s;}
  #schedule-root .refresh-toggle.on{border-color:var(--success);color:var(--success);background:rgba(39,174,96,.1);}
  #schedule-root .refresh-countdown{font-size:.72rem;color:var(--accent);min-width:28px;text-align:right;}

  /* ICON BUTTONS (テーマ・全画面) */
  #schedule-root .icon-btn{background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:5px 10px;border-radius:5px;cursor:pointer;font-size:.95rem;transition:all .2s;line-height:1;}
  #schedule-root .icon-btn:hover{border-color:var(--accent);color:var(--accent);}

  #schedule-root .btn-staff-mgmt{background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:6px 12px;border-radius:5px;cursor:pointer;font-size:.8rem;font-weight:700;transition:all .2s;white-space:nowrap;}
  #schedule-root .btn-staff-mgmt:hover{border-color:var(--accent);color:var(--accent);}
  #schedule-root .nav-btns{display:flex;gap:6px;}
  #schedule-root .nav-btn{background:var(--surface);border:1px solid var(--border);color:var(--text);padding:6px 14px;border-radius:4px;cursor:pointer;font-size:.85rem;font-weight:700;transition:all .2s;}
  #schedule-root .nav-btn:hover{background:var(--surface2);border-color:var(--accent);color:var(--accent);}
  #schedule-root .cal-title{font-size:1.2rem;font-weight:700;color:var(--accent);letter-spacing:.06em;white-space:nowrap;}

  /* SYNC / TOUCH HINT */
  #schedule-root .sync-status{font-size:.72rem;padding:3px 9px;border-radius:10px;font-weight:700;border:1px solid;white-space:nowrap;}
  #schedule-root .sync-status.ok  {color:var(--success);border-color:var(--success);background:rgba(39,174,96,.08);}
  #schedule-root .sync-status.err {color:var(--danger);border-color:var(--danger);background:rgba(192,57,43,.08);}
  #schedule-root .sync-status.busy{color:var(--accent);border-color:var(--accent);background:rgba(232,130,12,.08);}
  #schedule-root .touch-hint{font-size:.68rem;color:var(--accent);background:rgba(232,130,12,.12);border:1px solid rgba(232,130,12,.3);border-radius:4px;padding:3px 9px;white-space:nowrap;display:none;}
  #schedule-root .touch-hint.active{display:block;}
  #schedule-root .badge.touch-selected{box-shadow:0 0 0 3px #fff,0 0 0 6px var(--accent)!important;transform:scale(1.12)!important;}

  /* LAYOUT */
  #schedule-root .sc-app{display:grid;grid-template-columns:300px 1fr;height:calc(100vh - 160px);min-height:400px;}

  /* SIDEBAR */
  #schedule-root .sidebar{background:var(--surface);border-right:2px solid var(--border);overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:10px;}
  #schedule-root .sidebar-toggle-bar{display:none;}
  #schedule-root .sc-sidebar-tab{display:none;}
  #schedule-root .sc-sidebar-overlay{display:none;}
  #schedule-root .sidebar-inner{display:flex;flex-direction:column;gap:10px;flex:1;}
  #schedule-root .panel-title{font-size:.72rem;font-weight:700;letter-spacing:.12em;color:var(--accent);border-bottom:1px solid var(--border);padding-bottom:5px;margin-bottom:8px;}

  /* ORG FILTER */
  #schedule-root .org-filter{background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:10px;}
  #schedule-root .org-filter-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px;}
  #schedule-root .org-check-item{display:flex;align-items:center;gap:5px;cursor:pointer;padding:3px 6px;border-radius:4px;transition:background .15s;}
  #schedule-root .org-check-item:hover{background:rgba(128,128,128,.08);}
  #schedule-root .org-check-item input[type="checkbox"]{accent-color:var(--accent);width:13px;height:13px;cursor:pointer;}
  #schedule-root .org-check-item .org-label{font-size:.72rem;color:var(--text);}
  #schedule-root .org-check-item .org-count{font-size:.65rem;color:var(--text-dim);margin-left:auto;}
  #schedule-root .org-toggle-row{display:flex;gap:6px;margin-bottom:7px;}
  #schedule-root .btn-org-all,#schedule-root .btn-org-none{flex:1;background:none;border:1px solid var(--border);color:var(--text-dim);border-radius:4px;padding:3px;font-size:.68rem;cursor:pointer;transition:all .2s;}
  #schedule-root .btn-org-all:hover {border-color:var(--success);color:var(--success);}
  #schedule-root .btn-org-none:hover{border-color:var(--danger);color:var(--danger);}

  /* PERSONAL FILTER */
  #schedule-root .personal-filter{background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:10px;}
  #schedule-root .btn-personal-mode{width:100%;background:none;border:1px solid var(--border);color:var(--text-dim);border-radius:4px;padding:6px 10px;font-size:.75rem;font-weight:700;cursor:pointer;transition:all .2s;text-align:center;}
  #schedule-root .btn-personal-mode:hover{border-color:var(--accent);color:var(--accent);}
  #schedule-root .btn-personal-mode.active{background:var(--accent);border-color:var(--accent);color:#fff;}
  #schedule-root .personal-filter-body{display:none;margin-top:8px;flex-direction:column;gap:6px;}
  #schedule-root .personal-filter-body.active{display:flex;}
  #schedule-root .personal-filter-body select{width:100%;padding:5px 8px;border-radius:4px;background:var(--surface);border:1px solid var(--border);color:var(--text);font-size:.78rem;cursor:pointer;}
  #schedule-root .personal-toggle-row{display:flex;align-items:center;gap:6px;font-size:.72rem;color:var(--text);cursor:pointer;padding:3px 4px;border-radius:4px;transition:background .15s;}
  #schedule-root .personal-toggle-row:hover{background:rgba(128,128,128,.08);}
  #schedule-root .personal-toggle-row input{accent-color:var(--accent);width:13px;height:13px;cursor:pointer;}
  #schedule-root .org-filter.disabled{opacity:.45;pointer-events:none;}

  /* STAFF POOL */
  #schedule-root .staff-pool{background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:10px;}
  #schedule-root .staff-pool .desc{font-size:.69rem;color:var(--text-dim);margin-bottom:8px;}
  #schedule-root .badges-wrap{display:flex;flex-wrap:wrap;gap:5px;}

  /* BADGE */
  #schedule-root .badge{display:inline-flex;align-items:center;padding:3px 9px;border-radius:20px;font-size:.75rem;font-weight:700;cursor:grab;user-select:none;border:2px solid rgba(255,255,255,.2);box-shadow:0 2px 5px rgba(0,0,0,.25);transition:transform .1s,box-shadow .15s;white-space:nowrap;}
  #schedule-root .badge:hover{transform:translateY(-1px);}
  #schedule-root .badge:active{cursor:grabbing;transform:scale(.95);}
  #schedule-root .badge.dragging{opacity:.4;}

  /* FORM */
  #schedule-root .reg-form{background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:12px;}
  #schedule-root .form-group{margin-bottom:9px;}
  #schedule-root .form-group label{display:block;font-size:.69rem;color:var(--text-dim);margin-bottom:3px;font-weight:600;letter-spacing:.05em;}
  #schedule-root .form-group input[type="date"],
  #schedule-root .form-group input[type="time"],
  #schedule-root .form-group input[type="text"],
  #schedule-root .form-group select,
  #schedule-root .form-group textarea{width:100%;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);padding:6px 9px;font-size:.82rem;outline:none;transition:border-color .2s;font-family:inherit;}
  #schedule-root .form-group input:focus,
  #schedule-root .form-group select:focus,
  #schedule-root .form-group textarea:focus{border-color:var(--accent);}
  #schedule-root .form-group textarea{resize:vertical;min-height:52px;}
  #schedule-root .form-row2{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:9px;}
  #schedule-root .form-row2 .form-group{margin-bottom:0;min-width:0;}
  /* 終了日が枠外にはみ出す不具合の修正：grid item は内容(date inputの最小幅)に合わせて
     自動的に広がってしまうため、min-width:0 で明示的にグリッド枠内へ収める */
  #schedule-root .form-group input[type="date"],
  #schedule-root .form-group input[type="time"]{min-width:0;}
  /* 開始時間/終了時間の行で、終了時間ラベルの注釈テキストが折り返して2行になり
     入力欄が開始時間より下にズレてしまう不具合の修正：両ラベルの高さを揃える */
  #schedule-root .sc-time-row label{min-height:2.3em;}
  #schedule-root .checkbox-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px;max-height:180px;overflow-y:auto;}
  #schedule-root .checkbox-item{display:flex;align-items:center;gap:5px;cursor:pointer;padding:3px 5px;border-radius:4px;transition:background .15s;font-size:.72rem;}
  #schedule-root .checkbox-item:hover{background:rgba(128,128,128,.08);}
  #schedule-root .checkbox-item input[type="checkbox"]{accent-color:var(--accent);width:13px;height:13px;cursor:pointer;}
  #schedule-root .cb-badge{font-size:.7rem;font-weight:700;padding:2px 7px;border-radius:12px;}

  /* 種別バッジ */
  #schedule-root .type-badge-site{background:var(--ev-color);color:#fff;font-size:.62rem;padding:1px 6px;border-radius:3px;font-weight:700;}
  #schedule-root .type-badge-corp{background:var(--ce-color);color:#fff;font-size:.62rem;padding:1px 6px;border-radius:3px;font-weight:700;}
  #schedule-root .type-badge-deadline{background:var(--dl-color);color:#fff;font-size:.62rem;padding:1px 6px;border-radius:3px;font-weight:700;letter-spacing:.05em;}

  #schedule-root .btn-register{width:100%;background:var(--accent);color:#fff;border:none;border-radius:5px;padding:8px;font-size:.88rem;font-weight:700;cursor:pointer;transition:background .2s;}
  #schedule-root .btn-register:hover{background:var(--accent2);}
  #schedule-root .btn-register:disabled{background:#888;cursor:not-allowed;}

  /* MAIN */
  /* 曜日行(cal-dow)はposition:stickyでmainの上端に固定されるが、mainにpadding-topを
     付けると「paddingの隙間」がstickyの固定対象外として残り、スクロール中にその隙間へ
     予定がちらっと透けて見えてしまう。padding-topは外し、代わりに各ビューのラッパー側に
     margin-topを付けることで見た目の余白は変えずにこの隙間を無くす。 */
  #schedule-root .main{overflow-y:auto;padding:0 12px 12px;background:var(--bg);}
  #schedule-root .main>.cal-grid,
  #schedule-root .main>.daily-view,
  #schedule-root .main>.tt-wrap{margin-top:12px;}

  /* MONTHLY CALENDAR */
  #schedule-root .cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;}
  #schedule-root .cal-dow{text-align:center;padding:5px 3px;font-size:.7rem;font-weight:700;letter-spacing:.08em;color:var(--text-dim);background:var(--surface);border:1px solid var(--border);position:sticky;top:0;z-index:5;box-shadow:0 2px 4px rgba(0,0,0,.25);}
  #schedule-root .cal-dow.sun{color:#e74c3c;}
  #schedule-root .cal-dow.sat{color:#5dade2;}
  #schedule-root .cal-cell{background:var(--surface);border:1px solid var(--border);min-height:100px;padding:4px;transition:background .15s,border-color .15s;overflow:hidden;}
  #schedule-root .cal-cell.other-month{opacity:.45;}
  #schedule-root .cal-cell.today{border-color:var(--accent);border-width:3px;background:rgba(232,130,12,.16);}
  #schedule-root .cal-cell.drag-over,#schedule-root .cal-cell.touch-over{background:rgba(232,130,12,.08);border-color:var(--accent);border-style:dashed;}
  #schedule-root .date-num{font-size:.75rem;font-weight:700;color:var(--text-dim);margin-bottom:3px;}
  #schedule-root .cal-cell.today .date-num{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:var(--accent);color:#fff!important;font-size:.9rem;font-weight:900;line-height:1;}
  #schedule-root .sun-cell .date-num{color:#e74c3c;}
  #schedule-root .sat-cell .date-num{color:#5dade2;}
  #schedule-root .cal-cell.holiday-cell:not(.today){background:var(--holiday-bg);}
  #schedule-root .cal-cell.holiday-cell:not(.today) .date-num{color:var(--holiday-color);}
  #schedule-root .cal-cell.sat-cell:not(.today){background:var(--sat-bg);}
  #schedule-root .cell-events{display:flex;flex-direction:column;gap:2px;}

  /* EVENT CHIPS - 工事現場 */
  #schedule-root .event-chip{background:var(--ev-bg);border:1px solid var(--ev-border);border-left:3px solid var(--ev-color);border-radius:3px;padding:2px 4px;cursor:pointer;transition:background .15s;}
  #schedule-root .event-chip:hover{filter:brightness(1.15);}
  #schedule-root .event-chip.cont{opacity:.82;}
  #schedule-root .event-chip .ev-name{font-size:.75rem;font-weight:700;color:var(--ev-color);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:1px;}
  #schedule-root .event-chip .ev-time{font-size:.58rem;color:var(--text-dim);font-weight:600;margin-bottom:1px;}
  #schedule-root .event-chip .ev-badges{display:flex;flex-wrap:wrap;gap:2px;}
  #schedule-root .ev-badges .badge{font-size:.56rem;padding:1px 5px;cursor:default;}

  /* EVENT CHIPS - 会社行事 */
  #schedule-root .event-chip.corp{background:var(--ce-bg);border-color:var(--ce-border);border-left-color:var(--ce-color);}
  #schedule-root .event-chip.corp .ev-name{color:var(--ce-color);}

  /* EVENT CHIPS - 期日管理（目立つ赤＋脈動） */
  #schedule-root .event-chip.deadline{background:var(--dl-bg);border:2px solid var(--dl-border);border-left:4px solid var(--dl-color);box-shadow:0 0 8px rgba(255,59,59,.3);animation:scDeadlinePulse 2.4s ease-in-out infinite;position:relative;}
  #schedule-root .event-chip.deadline .ev-name{color:var(--dl-color);font-weight:800;letter-spacing:.02em;}
  #schedule-root .event-chip.deadline::before{content:'⚠';position:absolute;top:-6px;right:-3px;font-size:.7rem;background:var(--dl-color);color:#fff;border-radius:50%;width:14px;height:14px;display:flex;align-items:center;justify-content:center;line-height:1;box-shadow:0 1px 4px rgba(0,0,0,.4);z-index:1;}
  @keyframes scDeadlinePulse{0%,100%{box-shadow:0 0 8px rgba(255,59,59,.25);}50%{box-shadow:0 0 14px rgba(255,59,59,.55);}}

  /* DAILY LIST */
  #schedule-root .daily-view{display:flex;flex-direction:column;gap:3px;}
  #schedule-root .month-separator{background:linear-gradient(135deg,var(--surface),var(--surface2));border:2px solid var(--accent);border-radius:4px;padding:8px 16px;text-align:center;font-size:1rem;font-weight:700;color:var(--accent);letter-spacing:.1em;margin:8px 0 4px;}
  #schedule-root .month-separator.current-month{border-width:3px;font-size:1.15rem;}
  #schedule-root .day-row{display:grid;grid-template-columns:80px 1fr;background:var(--surface);border:1px solid var(--border);border-radius:4px;min-height:48px;overflow:hidden;transition:border-color .15s;}
  #schedule-root .day-row.today-row{border-color:var(--accent);border-width:2px;background:rgba(232,130,12,.09)!important;}
  #schedule-root .day-row.drag-over,#schedule-root .day-row.touch-over{background:rgba(232,130,12,.06);border-color:var(--accent);border-style:dashed;}
  #schedule-root .day-label{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8px 6px;border-right:1px solid var(--border);background:var(--surface2);min-width:80px;}
  #schedule-root .day-label .dl-num{font-size:1.4rem;font-weight:700;line-height:1;}
  #schedule-root .day-label .dl-dow{font-size:.65rem;font-weight:700;margin-top:2px;}
  #schedule-root .day-row.sun-row .dl-num,#schedule-root .day-row.sun-row .dl-dow{color:#e74c3c;}
  #schedule-root .day-row.sat-row .dl-num,#schedule-root .day-row.sat-row .dl-dow{color:#5dade2;}
  #schedule-root .day-row.holiday-row:not(.today-row){background:var(--holiday-bg)!important;}
  #schedule-root .day-row.holiday-row:not(.today-row) .dl-num,#schedule-root .day-row.holiday-row:not(.today-row) .dl-dow{color:var(--holiday-color);}
  #schedule-root .day-row.sat-row:not(.today-row){background:var(--sat-bg)!important;}
  #schedule-root .day-row.today-row .dl-num{display:flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:50%;background:var(--accent);color:#fff!important;font-size:1.35rem;font-weight:900;line-height:1;}
  #schedule-root .day-events{display:flex;flex-wrap:wrap;align-items:flex-start;gap:5px;padding:8px 10px;}
  #schedule-root .day-event-card{background:var(--ev-bg);border:1px solid var(--ev-border);border-left:3px solid var(--ev-color);border-radius:4px;padding:4px 8px;cursor:pointer;transition:filter .15s;min-width:140px;max-width:280px;}
  #schedule-root .day-event-card:hover{filter:brightness(1.12);}
  #schedule-root .day-event-card.cont{opacity:.82;}
  #schedule-root .day-event-card .dec-name{font-size:.75rem;font-weight:700;color:var(--ev-color);margin-bottom:2px;}
  #schedule-root .day-event-card .dec-time{font-size:.65rem;color:var(--text-dim);font-weight:600;margin-bottom:4px;}
  #schedule-root .day-event-card .dec-badges{display:flex;flex-wrap:wrap;gap:3px;}
  #schedule-root .dec-badges .badge{font-size:.65rem;padding:2px 7px;cursor:default;}
  #schedule-root .day-event-card.corp{background:var(--ce-bg);border-color:var(--ce-border);border-left-color:var(--ce-color);}
  #schedule-root .day-event-card.corp .dec-name{color:var(--ce-color);}
  #schedule-root .day-event-card.deadline{background:var(--dl-bg);border:2px solid var(--dl-border);border-left:5px solid var(--dl-color);box-shadow:0 0 8px rgba(255,59,59,.3);animation:scDeadlinePulse 2.4s ease-in-out infinite;position:relative;}
  #schedule-root .day-event-card.deadline .dec-name{color:var(--dl-color);font-weight:800;letter-spacing:.02em;}
  #schedule-root .day-event-card.deadline::before{content:'⚠ 期日';position:absolute;top:-9px;right:6px;font-size:.6rem;background:var(--dl-color);color:#fff;border-radius:3px;padding:1px 6px;font-weight:700;letter-spacing:.05em;box-shadow:0 1px 4px rgba(0,0,0,.4);z-index:1;}
  #schedule-root .day-empty{color:var(--text-dim);font-size:.72rem;padding:2px 0;}

  /* DROP TARGET */
  #schedule-root .event-chip.drop-target,#schedule-root .day-event-card.drop-target{background:rgba(39,174,96,.22)!important;border-color:#27ae60!important;border-left-color:#27ae60!important;box-shadow:0 0 10px rgba(39,174,96,.4);transform:scale(1.02);}
  #schedule-root .event-chip.drop-target .ev-name,#schedule-root .day-event-card.drop-target .dec-name{color:#27ae60!important;}

  /* MODAL BASE */
  .sc-modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:10000;align-items:center;justify-content:center;}
  .sc-modal-overlay.open{display:flex;}
  .sc-modal{background:var(--surface);border:2px solid var(--accent);border-radius:8px;padding:22px;min-width:340px;max-width:520px;width:92%;box-shadow:0 10px 40px rgba(0,0,0,.5);max-height:90vh;overflow-y:auto;color:var(--text);font-family:'Hiragino Kaku Gothic ProN','Meiryo',sans-serif;}
  .sc-modal-title{font-size:.72rem;font-weight:700;letter-spacing:.1em;color:var(--accent);border-bottom:1px solid var(--border);padding-bottom:5px;margin-bottom:14px;}
  .sc-modal-field{margin-bottom:13px;}
  .sc-modal-field label{display:block;font-size:.69rem;color:var(--text-dim);margin-bottom:4px;font-weight:600;letter-spacing:.05em;}
  .sc-modal-field input[type="text"],
  .sc-modal-field input[type="time"],
  .sc-modal-field input[type="date"],
  .sc-modal-field select,
  .sc-modal-field textarea{width:100%;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);padding:7px 10px;font-size:.88rem;outline:none;transition:border-color .2s;font-family:inherit;}
  .sc-modal-field input:focus,.sc-modal-field select:focus,.sc-modal-field textarea:focus{border-color:var(--accent);}
  .sc-modal-field textarea{resize:vertical;min-height:72px;}
  /* 確認・更新モーダルでの現場名の視認性向上：他の入力欄より大きく・太く表示 */
  #sc-modalSiteInput{font-size:1.3rem;font-weight:700;padding:9px 12px;}
  .sc-modal-row2{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:13px;}
  .sc-modal-row2 .sc-modal-field{margin-bottom:0;}
  .sc-modal-date-display{font-size:.82rem;color:var(--text-dim);padding:6px 10px;background:var(--surface2);border-radius:4px;border:1px solid var(--border);}
  .sc-modal-cb-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px;background:var(--surface2);border:1px solid var(--border);border-radius:5px;padding:9px;max-height:200px;overflow-y:auto;}
  .sc-modal-cb-grid .checkbox-item{display:flex;align-items:center;gap:5px;cursor:pointer;padding:3px 5px;border-radius:4px;transition:background .15s;font-size:.72rem;}
  .sc-modal-cb-grid .checkbox-item:hover{background:rgba(128,128,128,.08);}
  .sc-modal-cb-grid .checkbox-item input[type="checkbox"]{accent-color:var(--accent);width:13px;height:13px;cursor:pointer;}
  .sc-modal-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:4px;padding-top:12px;border-top:1px solid var(--border);flex-wrap:wrap;}
  .sc-save-fb{font-size:.72rem;color:var(--success);display:none;margin-right:auto;font-weight:600;align-self:center;}
  .sc-save-fb.show{display:block;}
  .btn-sc{border:none;padding:7px 16px;border-radius:4px;cursor:pointer;font-size:.84rem;font-weight:700;transition:background .2s;}
  .btn-sc:disabled{opacity:.5;cursor:not-allowed;}
  .btn-sc-sec{background:var(--surface2);border:1px solid var(--border);color:var(--text);}
  .btn-sc-sec:hover:not(:disabled){background:var(--border);}
  .btn-sc-ok {background:var(--success);color:#fff;}
  .btn-sc-ok:hover:not(:disabled){background:var(--info);}
  .btn-sc-del{background:var(--danger);color:#fff;}
  .btn-sc-del:hover:not(:disabled){background:#a93226;}

  /* STAFF MANAGEMENT */
  .sc-staff-list{display:flex;flex-direction:column;gap:6px;margin-bottom:14px;max-height:260px;overflow-y:auto;}
  .sc-staff-item{display:flex;align-items:center;gap:8px;background:var(--surface2);border:1px solid var(--border);border-radius:5px;padding:7px 10px;}
  .sc-staff-name-edit{flex:1;background:var(--bg);border:1px solid var(--border);border-radius:3px;color:var(--text);padding:3px 7px;font-size:.8rem;outline:none;}
  .sc-staff-name-edit:focus{border-color:var(--accent);}
  .sc-org-tag{font-size:.65rem;color:var(--text-dim);background:var(--bg);border:1px solid var(--border);border-radius:3px;padding:1px 5px;white-space:nowrap;}
  .btn-sc-icon{background:none;border:1px solid var(--border);color:var(--text-dim);border-radius:4px;padding:3px 8px;cursor:pointer;font-size:.75rem;transition:all .2s;}
  .btn-sc-icon:hover{border-color:var(--danger);color:var(--danger);}
  .sc-palette{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;}
  .sc-swatch{width:26px;height:26px;border-radius:50%;cursor:pointer;border:3px solid transparent;transition:border-color .15s,transform .1s;}
  .sc-swatch:hover{transform:scale(1.15);}
  .sc-swatch.selected{border-color:#888;transform:scale(1.1);}
  .sc-add-form{background:var(--surface2);border:1px solid var(--border);border-radius:5px;padding:12px;}
  .sc-add-form label{display:block;font-size:.69rem;color:var(--text-dim);margin-bottom:4px;font-weight:600;}
  .sc-add-form input[type="text"]{width:100%;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);padding:6px 9px;font-size:.85rem;outline:none;margin-bottom:10px;}
  .btn-sc-add{width:100%;background:var(--info);color:#fff;border:none;border-radius:4px;padding:8px;font-size:.85rem;font-weight:700;cursor:pointer;}

  /* QUICK MODAL */
  .sc-quick-preview{display:flex;align-items:center;gap:8px;background:var(--surface2);border:1px solid var(--border);border-radius:5px;padding:8px 12px;margin-bottom:14px;font-size:.8rem;color:var(--text-dim);}

  /* LOADING */
  .sc-loading{display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:11000;align-items:center;justify-content:center;flex-direction:column;gap:12px;}
  .sc-loading.show{display:flex;}
  .sc-spinner{width:40px;height:40px;border:4px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:scSpin .8s linear infinite;}
  @keyframes scSpin{to{transform:rotate(360deg);}}
  .sc-loading-text{color:var(--text-dim);font-size:.85rem;}

  /* Scrollbar */
  #schedule-root ::-webkit-scrollbar{width:5px;}
  #schedule-root ::-webkit-scrollbar-track{background:var(--bg);}
  #schedule-root ::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px;}



  /* TOOLTIP - 実スタイルは tooltip 自己挿入CSS（#sc-tooltip-css）側で定義 */

  /* TIMETABLE VIEW */
  #schedule-root .tt-wrap{display:flex;flex-direction:column;height:calc(100% - 12px);overflow:hidden;}
  #schedule-root .tt-allday-row{display:flex;background:var(--surface);border-bottom:2px solid var(--border);min-height:28px;}
  #schedule-root .tt-time-gutter{width:52px;min-width:52px;border-right:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:.6rem;color:var(--text-dim);padding:0 4px;}
  #schedule-root .tt-allday-events{flex:1;display:flex;flex-wrap:wrap;gap:3px;padding:4px 6px;align-items:center;}
  #schedule-root .tt-allday-chip{font-size:.68rem;font-weight:700;padding:3px 6px;border-radius:3px;cursor:pointer;white-space:normal;}
  #schedule-root .tt-allday-chip .tt-ad-name{display:block;margin-bottom:2px;}
  #schedule-root .tt-allday-chip .tt-ad-badges{display:flex;flex-wrap:wrap;gap:2px;}
  #schedule-root .tt-allday-chip .tt-ad-badges .badge{font-size:.52rem;padding:0 4px;cursor:default;}
  #schedule-root .tt-scroll-area{flex:1;overflow-y:auto;display:flex;position:relative;}
  #schedule-root .tt-time-col{width:52px;min-width:52px;border-right:1px solid var(--border);background:var(--surface);}
  #schedule-root .tt-hour-label{height:48px;display:flex;align-items:flex-start;justify-content:flex-end;padding:2px 5px 0;font-size:.6rem;color:var(--text-dim);border-bottom:1px solid rgba(128,128,128,.12);}
  #schedule-root .tt-days-area{display:flex;flex:1;}
  #schedule-root .tt-day-col{flex:1;border-right:1px solid var(--border);position:relative;min-width:0;}
  #schedule-root .tt-day-col:last-child{border-right:none;}
  #schedule-root .tt-day-hdr{text-align:center;padding:4px 2px 3px;background:var(--surface2);border-bottom:2px solid var(--border);position:sticky;top:0;z-index:3;height:48px;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;}
  #schedule-root .tt-day-hdr.tt-today{background:rgba(232,130,12,.2);border-bottom-color:var(--accent);border-bottom-width:3px;}
  #schedule-root .tt-day-hdr.tt-sun .tt-dnum,.tt-day-hdr.tt-sun .tt-ddow{color:#e74c3c!important;}
  #schedule-root .tt-day-hdr.tt-sat .tt-dnum,.tt-day-hdr.tt-sat .tt-ddow{color:#5dade2!important;}
  #schedule-root .tt-day-hdr.tt-holiday:not(.tt-today) .tt-dnum,#schedule-root .tt-day-hdr.tt-holiday:not(.tt-today) .tt-ddow{color:var(--holiday-color)!important;}
  #schedule-root .tt-day-hdr.tt-holiday:not(.tt-today){background:var(--holiday-bg);}
  #schedule-root .tt-day-hdr.tt-sat:not(.tt-today){background:var(--sat-bg);}
  #schedule-root .tt-ddow{font-size:.65rem;font-weight:700;color:var(--text-dim);}
  #schedule-root .tt-dnum{font-size:1.05rem;font-weight:700;color:var(--text);}
  #schedule-root .tt-day-hdr.tt-today .tt-dnum{display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:var(--accent);color:#fff!important;font-size:1rem;font-weight:900;line-height:1;margin:0 auto;}
  #schedule-root .tt-grid{position:relative;}
  #schedule-root .tt-hslot{height:48px;border-bottom:1px solid rgba(128,128,128,.13);}
  #schedule-root .tt-hslot.tt-half{border-bottom:1px dashed rgba(128,128,128,.07);}
  #schedule-root .tt-ev-layer{position:absolute;top:0;left:0;right:0;pointer-events:none;}
  #schedule-root .tt-ev{position:absolute;left:2px;right:2px;border-radius:3px;padding:2px 4px;font-size:.67rem;cursor:pointer;overflow:hidden;pointer-events:all;border:1px solid rgba(255,255,255,.15);box-sizing:border-box;transition:filter .15s;}
  #schedule-root .tt-ev:hover{filter:brightness(1.15);z-index:20;}
  #schedule-root .tt-ev .tt-ev-name{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  #schedule-root .tt-ev .tt-ev-time{font-size:.58rem;opacity:.85;}
  #schedule-root .tt-ev .tt-ev-bdg{display:flex;flex-wrap:wrap;gap:1px;margin-top:1px;}
  #schedule-root .tt-ev .tt-ev-bdg .badge{font-size:.52rem;padding:0 4px;cursor:default;}
  #schedule-root .tt-now-line{position:absolute;left:0;right:0;height:2px;background:var(--danger);z-index:10;pointer-events:none;}
  #schedule-root .tt-now-line::before{content:'';position:absolute;left:-4px;top:-4px;width:9px;height:9px;border-radius:50%;background:var(--danger);}

  /* 期日管理 - 週ビュー（タイムテーブル） */
  #schedule-root .tt-allday-chip.deadline{background:var(--dl-bg)!important;border:2px solid var(--dl-border)!important;border-left:4px solid var(--dl-color)!important;color:var(--dl-color)!important;font-weight:800;box-shadow:0 0 6px rgba(255,59,59,.3);animation:scDeadlinePulse 2.4s ease-in-out infinite;}
  #schedule-root .tt-ev.deadline{background:var(--dl-bg)!important;border:2px solid var(--dl-border)!important;border-left:4px solid var(--dl-color)!important;color:var(--dl-color)!important;font-weight:800;box-shadow:0 0 6px rgba(255,59,59,.3);animation:scDeadlinePulse 2.4s ease-in-out infinite;}

  /* 申請アプリ由来イベント */
  #schedule-root .event-chip.ext{background:repeating-linear-gradient(45deg,rgba(46,204,113,.12),rgba(46,204,113,.12) 4px,transparent 4px,transparent 8px)!important;border-color:rgba(46,204,113,.5)!important;border-left-color:#2ecc71!important;}
  #schedule-root .event-chip.ext .ev-name{color:#27ae60!important;}
  #schedule-root .day-event-card.ext{background:repeating-linear-gradient(45deg,rgba(46,204,113,.1),rgba(46,204,113,.1) 4px,transparent 4px,transparent 8px)!important;border-color:rgba(46,204,113,.5)!important;border-left-color:#2ecc71!important;}
  #schedule-root .day-event-card.ext .dec-name{color:#27ae60!important;}
  #schedule-root .tt-ev.ext{background:repeating-linear-gradient(45deg,rgba(46,204,113,.2),rgba(46,204,113,.2) 4px,rgba(0,30,10,.25) 4px,rgba(0,30,10,.25) 8px)!important;border-left:3px solid #2ecc71!important;}
  #schedule-root .tt-allday-chip.ext{background:rgba(46,204,113,.2);border:1px solid #2ecc71;color:#27ae60;}

  /* 東京支店イベント（オレンジストライプ） */
  #schedule-root .event-chip.tokyo{background:repeating-linear-gradient(45deg,rgba(232,130,12,.22),rgba(232,130,12,.22) 4px,transparent 4px,transparent 8px)!important;border-color:rgba(232,130,12,.7)!important;border-left-color:#e8820c!important;}
  #schedule-root .event-chip.tokyo .ev-name{color:#e8820c!important;}
  #schedule-root .day-event-card.tokyo{background:repeating-linear-gradient(45deg,rgba(232,130,12,.20),rgba(232,130,12,.20) 4px,transparent 4px,transparent 8px)!important;border-color:rgba(232,130,12,.7)!important;border-left-color:#e8820c!important;}
  #schedule-root .day-event-card.tokyo .dec-name{color:#e8820c!important;}
  #schedule-root .tt-ev.tokyo{background:repeating-linear-gradient(45deg,rgba(232,130,12,.30),rgba(232,130,12,.30) 4px,rgba(50,20,0,.25) 4px,rgba(50,20,0,.25) 8px)!important;border-left:3px solid #e8820c!important;}
  #schedule-root .tt-allday-chip.tokyo{background:rgba(232,130,12,.2);border:1px solid #e8820c;color:#e8820c;}

  /* FULLSCREEN
   * 全画面表示中は#schedule-root自身にposition:fixed;inset:0を付けて
   * 画面全体を覆う。重要なのは width:100vw / height:100vh を使わず、
   * inset:0だけで覆っている点（top/right/bottom/leftを全て0にすると、
   * ブラウザが「4辺の制約を満たすように」自動で幅・高さを物理的な
   * 実ビューポートに合わせて確定してくれる）。
   * 以前はwidth:100vw;height:100vhを使っていたが、zoomを併用すると
   * vw/vh単位自体がzoom倍率の影響を受けてしまい（例：zoom:0.6中は
   * width:100vwが画面幅の60%分しか埋まらない）、画面を覆いきれず
   * 隙間からkintone本来のUIが露出する不具合があった。insetベースの
   * 指定はvw/vh単位を使わないため、この問題が発生しない（実機検証済み）。
   * これによりtransformによる見た目だけの縮小（縮小時に余白が残って
   * しまう）をやめ、全画面中もCSSのzoomプロパティをそのまま使えるように
   * なった。zoomは要素のレイアウト占有領域そのものを縮小・拡大するため、
   * 縮小時は画面を埋め尽くしたまま、より多くの日数（行）が一画面に
   * 収まるようになる（平野さんの本来の目的に合致する挙動。実機検証済み）。
   * .sc-appの高さもvh基準ではなくroot自身の高さに対する%基準にして
   * いる（vhは上記と同じ理由でzoomと相性が悪いため使わない）。 */
  #schedule-root.sc-fullscreen{position:fixed;inset:0;z-index:9999;border-radius:0;}
  #schedule-root.sc-fullscreen .sc-app{height:calc(100% - 58px);}

  /* Mobile / 大型タッチディスプレイ（スマホ判定される環境含む） */
  @media(max-width:760px),(hover:none) and (pointer:coarse){
    #schedule-root .sc-app{grid-template-columns:1fr;height:auto;}

    /* 登録エリア＝左側からスライドインするドロワーに変更（横位置スマホ・大型ディスプレイ向け） */
    #schedule-root .sidebar{
      position:fixed;top:0;left:0;bottom:0;z-index:800;
      width:85vw;max-width:340px;
      border-right:2px solid var(--accent);border-bottom:none;
      padding:0;overflow-y:auto;
      transform:translateX(-100%);
      transition:transform .25s ease;
      box-shadow:6px 0 28px rgba(0,0,0,.5);
    }
    #schedule-root .sidebar.sidebar-open{transform:translateX(0);}

    /* ドロワー上部バー（タップで閉じる） */
    #schedule-root .sidebar-toggle-bar{
      display:flex;justify-content:space-between;align-items:center;
      padding:10px 14px;background:var(--surface2);border:none;border-bottom:1px solid var(--border);
      width:100%;cursor:pointer;font-size:.9rem;font-weight:700;color:var(--accent);
      font-family:inherit;transition:background .2s;
      position:sticky;top:0;z-index:2;
    }
    #schedule-root .sidebar-toggle-bar:active{background:var(--border);}
    #schedule-root .sidebar-toggle-bar .stb-caret{transition:transform .25s;}
    #schedule-root .sidebar.sidebar-open .sidebar-toggle-bar{border-bottom:2px solid var(--accent);}
    #schedule-root .sidebar.sidebar-open .sidebar-toggle-bar .stb-caret{transform:rotate(90deg);}
    #schedule-root .sidebar-inner{
      display:flex;flex-direction:column;gap:10px;padding:12px;
    }

    /* 左端の常設タブ（閉じている間表示・タップで登録エリアを開く） */
    #schedule-root .sc-sidebar-tab{
      display:flex;flex-direction:column;align-items:center;gap:4px;justify-content:center;
      position:fixed;top:50%;left:0;transform:translateY(-50%);
      z-index:550;
      background:var(--accent);color:#fff;border:none;
      border-radius:0 10px 10px 0;
      padding:14px 7px;
      font-size:.78rem;font-weight:700;line-height:1.3;
      writing-mode:vertical-rl;text-orientation:mixed;letter-spacing:.05em;
      box-shadow:3px 0 12px rgba(0,0,0,.4);
      cursor:pointer;
    }
    #schedule-root .sc-sidebar-tab.hide{display:none!important;}

    /* ドロワー背後のオーバーレイ（タップで閉じる） */
    #schedule-root .sc-sidebar-overlay.open{display:block;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:790;}

    #schedule-root .cal-cell{min-height:75px;}
    #schedule-root .day-row{grid-template-columns:58px 1fr;}
    #schedule-root .day-label .dl-num{font-size:1.1rem;}
    #schedule-root .badge{padding:6px 12px;font-size:.82rem;min-height:34px;}
    #schedule-root .event-chip{padding:5px 6px;}
    #schedule-root .day-event-card{padding:7px 10px;min-width:120px;min-height:40px;}
    #schedule-root .view-btn,#schedule-root .nav-btn{padding:9px 14px;}
    #schedule-root .btn-register{padding:13px;font-size:1rem;}
    .sc-modal{max-width:98vw;padding:16px;}
    .sc-modal-row2{grid-template-columns:1fr;}
    .btn-sc{padding:11px 18px;font-size:.92rem;}
  }

  /* ===== VIEWER MODE (閲覧専用) ===== */
  #schedule-root.viewer-mode .reg-form,
  #schedule-root.viewer-mode .staff-pool,
  #schedule-root.viewer-mode #sc-btnStaffMgmt,
  #schedule-root.viewer-mode #sc-staffModal,
  #schedule-root.viewer-mode #sc-quickModal,
  #schedule-root.viewer-mode #sc-btnEventSave,
  #schedule-root.viewer-mode #sc-btnEventDelete,
  #schedule-root.viewer-mode #sc-modalCbGrid,
  #schedule-root.viewer-mode #sc-modalSiteInput,
  #schedule-root.viewer-mode #sc-modalStartDate,
  #schedule-root.viewer-mode #sc-modalEndDate,
  #schedule-root.viewer-mode #sc-modalTimeInput,
  #schedule-root.viewer-mode #sc-modalEndTimeInput,
  #schedule-root.viewer-mode #sc-modalNotes,
  #schedule-root.viewer-mode #sc-modalType,
  #schedule-root.viewer-mode #sc-modalDateRow,
  #schedule-root.viewer-mode #sc-modalTimeRow,
  #schedule-root.viewer-mode .refresh-area,
  #schedule-root.viewer-mode #sc-touchHint,
  #schedule-root.viewer-mode #sc-syncStatus{display:none !important;}
  #schedule-root.viewer-mode .sc-modal-field label{margin-bottom:0;}
  #schedule-root.viewer-mode #sc-modalDateDisplay{font-size:.95rem;}
  #schedule-root.viewer-mode .viewer-only{display:block;}
  #schedule-root:not(.viewer-mode) .viewer-only{display:none;}
  /* イベント編集モーダルを閲覧専用に */
  #schedule-root.viewer-mode .sc-modal-title::after{content:' (閲覧)';opacity:.6;font-weight:400;}
  /* ドラッグ無効化 */
  #schedule-root.viewer-mode [draggable]{-webkit-user-drag:none;user-drag:none;}

  /* ===== 浮遊型 個人フィルターボタン (どこからでもタップ可) ===== */
  #schedule-root .sc-personal-fab{
    position:fixed;bottom:24px;right:24px;z-index:500;
    display:flex;align-items:center;gap:8px;
    background:var(--accent);color:#fff;border:none;
    border-radius:30px;padding:12px 20px;
    font-size:.92rem;font-weight:700;cursor:pointer;
    box-shadow:0 4px 16px rgba(0,0,0,.45);
    transition:all .2s;
  }
  #schedule-root .sc-personal-fab:hover{transform:translateY(-2px);box-shadow:0 6px 22px rgba(0,0,0,.55);}
  #schedule-root .sc-personal-fab:active{transform:scale(.95);}
  #schedule-root .sc-personal-fab.active{background:#27ae60;}
  #schedule-root .sc-personal-fab .fab-icon{font-size:1.15rem;line-height:1;}
  #schedule-root .sc-personal-fab .fab-text{max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}

  #schedule-root .sc-personal-fab-overlay{
    position:fixed;inset:0;
    background:rgba(0,0,0,.65);z-index:600;
    display:none;align-items:center;justify-content:center;padding:20px;
  }
  #schedule-root .sc-personal-fab-overlay.open{display:flex;}
  #schedule-root .sc-personal-fab-modal{
    background:var(--surface);border:1px solid var(--border);border-radius:12px;
    padding:18px 18px 16px;width:100%;max-width:360px;
    display:flex;flex-direction:column;gap:14px;
    box-shadow:0 12px 36px rgba(0,0,0,.55);
  }
  #schedule-root .fab-modal-header{display:flex;align-items:center;justify-content:space-between;}
  #schedule-root .fab-modal-title{font-size:1.05rem;font-weight:700;color:var(--accent);}
  #schedule-root .fab-modal-x{background:none;border:none;color:var(--text);font-size:1.6rem;cursor:pointer;padding:0 8px;line-height:1;}
  #schedule-root .fab-modal-x:hover{color:var(--accent);}
  #schedule-root .fab-modal-toggle{
    background:none;border:2px solid var(--border);color:var(--text-dim);
    border-radius:6px;padding:11px;font-size:.95rem;font-weight:700;
    cursor:pointer;transition:all .2s;
  }
  #schedule-root .fab-modal-toggle:hover{border-color:var(--accent);color:var(--accent);}
  #schedule-root .fab-modal-toggle.active{background:var(--accent);border-color:var(--accent);color:#fff;}
  #schedule-root .fab-modal-section{display:flex;flex-direction:column;gap:7px;}
  #schedule-root .fab-modal-label{font-size:.72rem;color:var(--text-dim);letter-spacing:.06em;font-weight:700;}
  #schedule-root .fab-modal-section select{
    width:100%;padding:10px;border-radius:6px;
    background:var(--bg);border:1px solid var(--border);color:var(--text);
    font-size:.95rem;cursor:pointer;
  }
  #schedule-root .fab-modal-cb{
    display:flex;align-items:center;gap:9px;padding:9px 8px;
    font-size:.9rem;color:var(--text);cursor:pointer;border-radius:5px;
    transition:background .15s;
  }
  #schedule-root .fab-modal-cb:hover{background:rgba(128,128,128,.1);}
  #schedule-root .fab-modal-cb input{accent-color:var(--accent);width:17px;height:17px;cursor:pointer;}
  #schedule-root .fab-modal-done{
    background:var(--accent);color:#fff;border:none;border-radius:6px;
    padding:12px;font-size:1rem;font-weight:700;cursor:pointer;
    transition:filter .15s;
  }
  #schedule-root .fab-modal-done:hover{filter:brightness(1.1);}

  /* ===== 拡大縮小コントロール（閲覧専用ページのみ表示） ===== */
  #schedule-root .sc-zoom-controls{
    display:none;
    position:fixed;top:50%;right:12px;transform:translateY(-50%);
    z-index:550;flex-direction:column;gap:6px;
    background:rgba(36,36,36,.92);border:1px solid var(--border);border-radius:24px;
    padding:6px;box-shadow:0 4px 14px rgba(0,0,0,.4);
  }
  #schedule-root.viewer-mode .sc-zoom-controls{display:flex;}
  @media(max-width:760px),(hover:none) and (pointer:coarse){
    #schedule-root .sc-zoom-controls{display:flex;}
  }
  #schedule-root .sc-zoom-controls button{
    width:38px;height:38px;border-radius:50%;
    background:var(--surface);border:1px solid var(--border);color:var(--text);
    font-size:1.2rem;font-weight:700;cursor:pointer;
    display:flex;align-items:center;justify-content:center;
    transition:all .2s;-webkit-tap-highlight-color:transparent;
  }
  #schedule-root .sc-zoom-controls button:hover{background:var(--accent);border-color:var(--accent);color:#fff;}
  #schedule-root .sc-zoom-controls button:active{transform:scale(.92);}
  #schedule-root .sc-zoom-label{
    font-size:.62rem;color:var(--text-dim);text-align:center;line-height:1;
    cursor:pointer;padding:4px 0;user-select:none;
  }
  #schedule-root .sc-zoom-label:hover{color:var(--accent);}
  `;

  /* ====================================================================
   * HTML TEMPLATE
   * ==================================================================== */
  const SCHEDULE_HTML = `
  <header>
    
    <div class="title-block">
      <h1>フジテック スケジュール管理</h1>
      <div class="sub">CONSTRUCTION SITE SCHEDULE MANAGER</div>
    </div>
    <div class="header-controls">
      <div class="view-toggle">
        <button class="view-btn active" id="sc-btnViewMonth">📅 月</button>
        <button class="view-btn"        id="sc-btnViewDay">📋 日別</button>
        <button class="view-btn"        id="sc-btnViewWeek">🕐 週</button>
      </div>
      <div class="refresh-area">
        <label>🔄</label>
        <select id="sc-refreshInterval">
          <option value="30">30秒</option>
          <option value="60">1分</option>
          <option value="300">5分</option>
          <option value="600" selected>10分</option>
        </select>
        <button class="refresh-toggle" id="sc-btnRefresh">AUTO OFF</button>
        <span class="refresh-countdown" id="sc-refreshCountdown"></span>
      </div>
      <span class="touch-hint" id="sc-touchHint">👆 配置先をタップ</span>
      <span class="sync-status ok" id="sc-syncStatus">● kintone 接続待ち</span>
      <button class="icon-btn" id="sc-btnVerify" title="表示漏れチェック（現在の表示期間をkintoneと照合）">🔍</button>
      <button class="icon-btn" id="sc-btnTheme" title="テーマ切り替え">🌙</button>
      <button class="icon-btn" id="sc-btnFullscreen" title="全画面">⛶</button>
      <button class="btn-staff-mgmt" id="sc-btnStaffMgmt" style="display:none;">👷 メンバー管理</button>
      <div class="nav-btns">
        <button class="nav-btn" id="sc-btnPrev">◀</button>
        <span class="cal-title" id="sc-calTitle"></span>
        <button class="nav-btn" id="sc-btnNext">▶</button>
        <button class="nav-btn" id="sc-btnToday">今日</button>
      </div>
    </div>
  </header>

  <div class="sc-app">
    <aside class="sidebar" id="sc-sidebar">
      <button class="sidebar-toggle-bar" id="sc-btnSidebarToggle" type="button">
        <span>📋 登録エリア</span>
        <span class="stb-caret">▶</span>
      </button>
      <div class="sidebar-inner" id="sc-sidebarInner">
      <div class="org-filter" id="sc-orgFilter">
        <div class="panel-title">🏢 部署フィルター</div>
        <div class="org-toggle-row">
          <button class="btn-org-all"  id="sc-btnOrgAll">✔ 全選択</button>
          <button class="btn-org-none" id="sc-btnOrgNone">✖ 全解除</button>
        </div>
        <div class="org-filter-grid" id="sc-orgFilterGrid"></div>
      </div>
      <div class="personal-filter" id="sc-personalFilter">
        <button class="btn-personal-mode" id="sc-btnPersonalToggle">👤 個人の予定を確認</button>
        <div class="personal-filter-body" id="sc-personalFilterBody">
          <select id="sc-personalStaffSelect"></select>
          <label class="personal-toggle-row"><input type="checkbox" id="sc-personalShowCorp" checked>🏢 会社行事を表示</label>
          <label class="personal-toggle-row"><input type="checkbox" id="sc-personalShowDeadline" checked>⚠️ 期日管理を表示</label>
        </div>
      </div>
      <div class="staff-pool">
        <div class="panel-title">👷 スタッフ一覧</div>
        <div class="desc" id="sc-poolDesc">空き日付へドラッグ→現場登録 ／ 既存の現場へドラッグ→メンバー追加</div>
        <div class="badges-wrap" id="sc-staffPool"></div>
      </div>
      <div class="reg-form">
        <div class="panel-title">📋 登録</div>
        <div class="form-group">
          <label>種別</label>
          <select id="sc-formType">
            <option value="工事現場">🔧 工事現場</option>
            <option value="会社行事">🏢 会社行事</option>
            <option value="期日管理">⚠️ 期日管理</option>
          </select>
        </div>
        <div class="form-row2">
          <div class="form-group"><label>開始日</label><input type="date" id="sc-formStartDate"></div>
          <div class="form-group"><label>終了日</label><input type="date" id="sc-formEndDate"></div>
        </div>
        <div class="form-group"><label>現場名 / 行事名</label><input type="text" id="sc-formSite" placeholder="〇〇工事・〇〇会議"></div>
        <div class="form-row2 sc-time-row">
          <div class="form-group"><label>開始時間</label><input type="time" id="sc-formTime"></div>
          <div class="form-group"><label>終了時間 <span style="font-size:.62rem;color:var(--text-dim);">（空欄=+3h自動）</span></label><input type="time" id="sc-formEndTime"></div>
        </div>
        <div class="form-group"><label>備考</label><textarea id="sc-formNotes" placeholder="補足・注意事項など"></textarea></div>
        <div class="form-group"><label>参加者</label><div class="checkbox-grid" id="sc-checkboxGrid"></div></div>
        <button class="btn-register" id="sc-btnRegister">登録する</button>
      </div>
      </div><!-- /sidebar-inner -->
    </aside>
    <button class="sc-sidebar-tab" id="sc-btnSidebarTab" type="button">📋 登録エリア</button>
    <div class="sc-sidebar-overlay" id="sc-sidebarOverlay"></div>
    <main class="main" id="sc-mainArea"></main>
  </div>

  <!-- イベント編集モーダル -->
  <div class="sc-modal-overlay" id="sc-eventModal">
    <div class="sc-modal">
      <div class="sc-modal-title">✏️ 現場情報の編集</div>
      <div class="sc-modal-field"><label>種別</label>
        <select id="sc-modalType">
          <option value="工事現場">🔧 工事現場</option>
          <option value="会社行事">🏢 会社行事</option>
          <option value="期日管理">⚠️ 期日管理</option>
        </select>
        <div class="viewer-only sc-modal-date-display" id="sc-viewerType"></div>
      </div>
      <div class="sc-modal-field"><label>📅 日付・期間</label><div class="sc-modal-date-display" id="sc-modalDateDisplay"></div></div>
      <div class="sc-modal-field"><label>現場名 / 行事名</label>
        <input type="text" id="sc-modalSiteInput" placeholder="現場名・行事名">
        <div class="viewer-only sc-modal-date-display" id="sc-viewerSite" style="font-size:1.3rem;font-weight:700;"></div>
      </div>
      <div class="sc-modal-row2" id="sc-modalDateRow">
        <div class="sc-modal-field"><label>📅 開始日</label><input type="date" id="sc-modalStartDate"></div>
        <div class="sc-modal-field"><label>📅 終了日</label><input type="date" id="sc-modalEndDate"></div>
      </div>
      <div class="sc-modal-row2 sc-time-row" id="sc-modalTimeRow">
        <div class="sc-modal-field"><label>🕐 開始時間</label><input type="time" id="sc-modalTimeInput"></div>
        <div class="sc-modal-field"><label>🕐 終了時間 <span style="font-size:.62rem;color:var(--text-dim);">（空欄=+3h自動）</span></label><input type="time" id="sc-modalEndTimeInput"></div>
      </div>
      <div class="sc-modal-field viewer-only" id="sc-viewerTimeField"><label>🕐 時間</label><div class="sc-modal-date-display" id="sc-viewerTime"></div></div>
      <div class="sc-modal-field"><label>👷 参加メンバー</label>
        <div class="sc-modal-cb-grid" id="sc-modalCbGrid"></div>
        <div class="viewer-only" id="sc-viewerStaff" style="display:flex;flex-wrap:wrap;gap:4px;padding:6px 0;"></div>
      </div>
      <div class="sc-modal-field"><label>📝 備考</label>
        <textarea id="sc-modalNotes" placeholder="補足・注意事項など"></textarea>
        <div class="viewer-only sc-modal-date-display" id="sc-viewerNotes" style="white-space:pre-wrap;"></div>
      </div>
      <div class="sc-modal-actions">
        <span class="sc-save-fb" id="sc-saveFb">✔ 保存しました</span>
        <button class="btn-sc btn-sc-sec" id="sc-btnEventClose">閉じる</button>
        <button class="btn-sc btn-sc-ok"  id="sc-btnEventSave">💾 保存</button>
        <button class="btn-sc btn-sc-del" id="sc-btnEventDelete" style="display:none;">🗑 削除</button>
      </div>
    </div>
  </div>

  <!-- クイック登録モーダル -->
  <div class="sc-modal-overlay" id="sc-quickModal">
    <div class="sc-modal" style="max-width:400px;">
      <div class="sc-modal-title">⚡ すばやく登録</div>
      <div class="sc-quick-preview"><span>👷 担当者：</span><span id="sc-quickStaffBadge"></span></div>
      <div class="sc-modal-field"><label>種別</label>
        <select id="sc-quickType">
          <option value="工事現場">🔧 工事現場</option>
          <option value="会社行事">🏢 会社行事</option>
          <option value="期日管理">⚠️ 期日管理</option>
        </select>
      </div>
      <div class="sc-modal-field"><label>📅 日付</label><div class="sc-modal-date-display" id="sc-quickDateDisplay"></div></div>
      <div class="sc-modal-field">
        <label>名称 <span style="color:#e74c3c;">*</span></label>
        <input type="text" id="sc-quickSiteName" placeholder="現場名・行事名を入力">
      </div>
      <div class="sc-modal-row2">
        <div class="sc-modal-field"><label>📅 終了日（複数日）</label><input type="date" id="sc-quickEndDate"></div>
        <div class="sc-modal-field"><label>🕐 開始時間</label><input type="time" id="sc-quickTime"></div>
      </div>
      <div class="sc-modal-field">
        <label>🕐 終了時間 <span style="font-size:.62rem;color:var(--text-dim);">（空欄=開始+3時間で自動表示）</span></label>
        <input type="time" id="sc-quickEndTime">
      </div>
      <div class="sc-modal-field"><label>📝 備考</label><textarea id="sc-quickNotes" placeholder="補足・注意事項など" style="min-height:52px;"></textarea></div>
      <div class="sc-modal-field"><label>👷 他のメンバーも追加</label><div class="sc-modal-cb-grid" id="sc-quickCbGrid"></div></div>
      <div class="sc-modal-actions">
        <button class="btn-sc btn-sc-sec" id="sc-btnQuickCancel">キャンセル</button>
        <button class="btn-sc btn-sc-ok"  id="sc-btnQuickRegister">✅ 登録する</button>
      </div>
    </div>
  </div>

  <!-- メンバー管理モーダル -->
  <div class="sc-modal-overlay" id="sc-staffModal">
    <div class="sc-modal" style="max-width:440px;">
      <div class="sc-modal-title">👷 メンバー管理</div>
      <div class="sc-staff-list" id="sc-staffListMgmt"></div>
      <div class="sc-add-form">
        <div class="panel-title" style="margin-bottom:10px;">➕ メンバーを追加</div>
        <label>名前</label><input type="text" id="sc-newStaffName" placeholder="名前を入力">
        <label>カラー</label><div class="sc-palette" id="sc-colorPalette"></div>
      </div>
      <div class="sc-modal-actions" style="margin-top:14px;">
        <button class="btn-sc btn-sc-add" id="sc-btnAddStaff" style="margin-right:auto;background:var(--info);color:#fff;">➕ 追加</button>
        <button class="btn-sc btn-sc-sec" id="sc-btnStaffClose">閉じる</button>
      </div>
    </div>
  </div>

  <!-- ローディング -->
  <div class="sc-loading" id="sc-loadingOverlay">
    <div class="sc-spinner"></div>
    <div class="sc-loading-text" id="sc-loadingText">kintoneと同期中...</div>
  </div>

  <!-- 浮遊型 個人フィルターボタン (どこからでもタップ可) -->
  <button class="sc-personal-fab" id="sc-personalFab" type="button" title="個人の予定を確認">
    <span class="fab-icon">👤</span>
    <span class="fab-text" id="sc-fabText">個人</span>
  </button>
  <div class="sc-personal-fab-overlay" id="sc-fabOverlay">
    <div class="sc-personal-fab-modal">
      <div class="fab-modal-header">
        <div class="fab-modal-title">👤 個人の予定を確認</div>
        <button class="fab-modal-x" id="sc-fabClose" type="button">×</button>
      </div>
      <button class="fab-modal-toggle" id="sc-fabModeToggle" type="button">個人モード OFF</button>
      <div class="fab-modal-section">
        <div class="fab-modal-label">担当者</div>
        <select id="sc-fabStaffSelect"></select>
      </div>
      <div class="fab-modal-section">
        <label class="fab-modal-cb"><input type="checkbox" id="sc-fabShowCorp"> 🏢 会社行事を表示</label>
        <label class="fab-modal-cb"><input type="checkbox" id="sc-fabShowDeadline"> ⚠️ 期日管理を表示</label>
      </div>
      <button class="fab-modal-done" id="sc-fabDone" type="button">完了</button>
    </div>
  </div>

  <!-- 拡大・縮小コントロール（閲覧専用ページのみ表示） -->
  <div class="sc-zoom-controls" id="sc-zoomControls">
    <button id="sc-zoomIn" type="button" title="拡大">＋</button>
    <div class="sc-zoom-label" id="sc-zoomLabel" title="クリックで100%にリセット">100%</div>
    <button id="sc-zoomOut" type="button" title="縮小">−</button>
  </div>
  `;

  /* ====================================================================
   * DATA
   * ==================================================================== */
  const COLOR_PALETTE = [
    '#c0392b','#2980b9','#27ae60','#8e44ad','#d35400',
    '#16a085','#2471a3','#1e8449','#7d6608','#c0187a',
    '#784212','#616a6b','#117a65','#1a5276','#6e2f87',
    '#b7950b','#1f618d','#a04000','#117864','#7b241c',
  ];

  let STAFF = [
    { id:  0, code: 'koyama',    name: '小山',   org: '業務部',      color: '#a04000' },
    { id:  1, code: 'takahashi', name: '高橋',   org: '業務部',      color: '#7e5109' },
    { id:  2, code: 'shibata',   name: '柴田A',  org: '業務部',      color: '#6e2f1a' },
    { id:  3, code: 'tomita',    name: '冨田',   org: '技術部',      color: '#899203' },
    { id:  4, code: 'terai',     name: '寺井',   org: '技術部',      color: '#616161' },
    { id:  5, code: 'iwakura',   name: '岩倉',   org: '営業部',      color: '#d35400' },
    { id:  6, code: 'n-shibata', name: '柴田N',  org: '施工管理課',  color: '#1e8449' },
    { id:  7, code: 'kumagai',   name: '熊谷',   org: '施工管理課',  color: '#196f3d' },
    { id:  8, code: 'nakamura',  name: '中村',   org: '施工管理課',  color: '#117864' },
    { id:  9, code: 'kato',      name: '加藤',   org: 'サービス1課', color: '#2b5aaf' },
    { id: 10, code: 'yamada',    name: '山田',   org: 'サービス1課', color: '#369136' },
    { id: 11, code: 'okada',     name: '岡田',   org: 'サービス1課', color: '#d18614' },
    { id: 12, code: 'hakamata',  name: '袴田',   org: 'サービス1課', color: '#681888' },
    { id: 13, code: 'hirano',    name: '平野',   org: 'サービス2課', color: '#cf0404' },
    { id: 14, code: 'matsumoto', name: '松本',   org: 'サービス2課', color: '#b427a1' },
    { id: 15, code: 'saito',     name: '齋藤',   org: 'サービス2課', color: '#a0a0a0' },
    { id: 16, code: 'masuya',    name: '増谷',   org: 'サービス2課', color: '#2645ad' },
    { id: 17, code: 'matsuura',  name: '松浦',   org: 'サービス2課', color: '#0cb5e9' },
    { id: 18, code: 'nihira',    name: '二平',   org: '東京支店',    color: '#922b21' },
    { id: 19, code: 'watanabe',  name: '渡邉',   org: '東京支店',    color: '#1d69be' },
    { id: 20, code: 'akita',     name: '秋田',   org: '東京支店',    color: '#93960b' },
    { id: 21, code: 'tanaka',    name: '田中',   org: '東京支店',    color: '#740f7e' },
    { id: 22, code: 'yonezawa',  name: '米澤',   org: '東京支店',    color: '#18ac98' },
    { id: 23, code: 'oka',       name: '岡',     org: '東京支店',    color: '#da44da' },
  ];
  let staffIdCounter = STAFF.length;
  const ORGS = ['業務部','技術部','営業部','施工管理課','サービス1課','サービス2課','東京支店'];

  /* ====================================================================
   * LOGIN USER & PERSISTENCE
   * ==================================================================== */
  let loginUser = { code: '', name: '' };
  try { loginUser = kintone.getLoginUser(); } catch (e) {}

  const FILTER_KEY = `sc-org-filter-${loginUser.code}`;
  const THEME_KEY  = 'sc-theme';
  const PERSONAL_FILTER_KEY = `sc-personal-filter-${loginUser.code}`;

  let selectedOrgs;
  try {
    const saved = localStorage.getItem(FILTER_KEY);
    selectedOrgs = saved ? new Set(JSON.parse(saved)) : new Set(ORGS);
  } catch (e) { selectedOrgs = new Set(ORGS); }

  let currentTheme;
  try { currentTheme = localStorage.getItem(THEME_KEY) || 'dark'; } catch (e) { currentTheme = 'dark'; }

  // 個人フィルター状態
  let personalFilterMode = false;
  let personalFilterStaffId = null;
  let personalShowCorp = true;
  let personalShowDeadline = true;
  try {
    const savedP = localStorage.getItem(PERSONAL_FILTER_KEY);
    if (savedP) {
      const obj = JSON.parse(savedP);
      personalFilterMode    = !!obj.mode;
      personalFilterStaffId = obj.staffId != null ? obj.staffId : null;
      personalShowCorp      = obj.showCorp !== false;
      personalShowDeadline  = obj.showDeadline !== false;
    }
  } catch (e) {}

  function saveFilterState() {
    try { localStorage.setItem(FILTER_KEY, JSON.stringify([...selectedOrgs])); } catch (e) {}
  }
  function savePersonalFilterState() {
    try {
      localStorage.setItem(PERSONAL_FILTER_KEY, JSON.stringify({
        mode: personalFilterMode,
        staffId: personalFilterStaffId,
        showCorp: personalShowCorp,
        showDeadline: personalShowDeadline,
      }));
    } catch (e) {}
  }
  function saveTheme(t) {
    try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
  }

  /* ====================================================================
   * STATE
   * ==================================================================== */
  let events = [];
  let eventIdCounter = 1;
  let currentYear, currentMonth;
  let currentView = 'month';
  let dragData = null;
  let touchSelectedStaffId = null;
  let modalEventId = null;
  let pendingDrop = null;
  let refreshTimer = null, refreshSeconds = 0, refreshOn = false;
  let currentWeekStart = null;
  let externalEvents = [];
  let holidaySet = new Set(); // 休日登録アプリ(159)の【日付】値を格納 ("YYYY-MM-DD")
  let selectedColor = COLOR_PALETTE[0];
  let isFullscreen = false;

  // 遅延ロード管理
  let loadedMonths    = new Set(); // ロード済み月の Set（"YYYY-MM" 形式）
  let isLoadingRange  = false;     // 追加ロード中フラグ（重複防止）
  let dailyRenderEndOffset = 1;    // 日別ビューで currentMonth+N まで表示

  // 日付の固定化によるズレ防止：呼び出し毎に最新の Date を返す
  function getToday() { return new Date(); }
  const APP_ID = (() => { try { return kintone.app.getId(); } catch (e) { return 160; } })();
  const EXTERNAL_APP_ID = 69;
  const HOLIDAY_APP_ID = 159; // 休日登録アプリ
  const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

  /* ====================================================================
   * HELPERS
   * ==================================================================== */
  function pad(n) { return String(n).padStart(2, '0'); }
  function toDateStr(y, m, d) { return `${y}-${pad(m + 1)}-${pad(d)}`; }
  function todayStr() { const t = getToday(); return toDateStr(t.getFullYear(), t.getMonth(), t.getDate()); }
  function getStaff(id) { return STAFF.find(s => s.id === id); }
  function getStaffByCode(code) { return STAFF.find(s => s.code === code); }
  function visibleStaff() { return STAFF.filter(s => selectedOrgs.has(s.org)); }
  function isCorp(ev) { return ev.type === '会社行事'; }
  function isDeadline(ev) { return ev.type === '期日管理'; }
  /* 最初のマグネットが東京支店メンバーかどうか判定 */
  function isTokyoBranch(ev) {
    if (!ev.staff || ev.staff.length === 0) return false;
    var s = getStaff(ev.staff[0]);
    return s && s.org === '東京支店';
  }

  // 遅延ロード用ヘルパー
  function monthKey(y, m) { return `${y}-${pad(m + 1)}`; }
  function isMonthLoaded(y, m) { return loadedMonths.has(monthKey(y, m)); }
  function firstOfMonth(y, m) { return `${y}-${pad(m + 1)}-01`; }
  function lastOfMonth(y, m) { const d = new Date(y, m + 1, 0); return toDateStr(d.getFullYear(), d.getMonth(), d.getDate()); }
  function shiftMonthBy(y, m, delta) { const d = new Date(y, m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() }; }
  function getNeededMonths() {
    const months = [];
    if (currentView === 'week') {
      if (!currentWeekStart) return months;
      const ws = currentWeekStart;
      const we = new Date(ws); we.setDate(we.getDate() + 6);
      months.push({ y: ws.getFullYear(), m: ws.getMonth() });
      const ey = we.getFullYear(), em = we.getMonth();
      if (!months.some(x => x.y === ey && x.m === em)) months.push({ y: ey, m: em });
    } else if (currentView === 'day') {
      for (let d = -1; d <= dailyRenderEndOffset; d++) {
        months.push(shiftMonthBy(currentYear, currentMonth, d));
      }
    } else {
      // month view: 前後1ヶ月も隣セルに表示されるためロードしておく
      for (let d = -1; d <= 1; d++) months.push(shiftMonthBy(currentYear, currentMonth, d));
    }
    return months;
  }

  function eventMatchesFilter(ev) {
    // ----- 個人フィルターモード -----
    if (personalFilterMode && personalFilterStaffId != null) {
      if (isCorp(ev))     return personalShowCorp;
      if (isDeadline(ev)) {
        if (!personalShowDeadline) return false;
        // 参加者なし=全社共通として表示、参加者あり=該当社員のみ
        if (!ev.staff || ev.staff.length === 0) return true;
        return ev.staff.indexOf(personalFilterStaffId) !== -1;
      }
      // 工事現場など：選択した社員が参加者に含まれる場合のみ表示
      if (!ev.staff || ev.staff.length === 0) return false;
      return ev.staff.indexOf(personalFilterStaffId) !== -1;
    }
    // ----- 通常（部署フィルター）モード -----
    // 会社行事は常に表示
    // 会社行事でも申請アプリ参照データはフィルター対象
    if (isCorp(ev) && !ev.isExternal) return true;
    // 参加者なし（未登録）は常に表示
    if (!ev.staff || ev.staff.length === 0) return true;
    // 参加者の中に1人でもフィルター対象部署の社員がいれば表示
    return ev.staff.some(function (sid) {
      var s = getStaff(sid);
      return s && selectedOrgs.has(s.org);
    });
  }
  function eventsOnDate(dateStr) {
    const internal = events.filter(ev =>
      dateStr >= ev.startDate &&
      dateStr <= (ev.endDate || ev.startDate) &&
      eventMatchesFilter(ev)
    );
    const external = externalEvents.filter(ev =>
      dateStr >= ev.startDate &&
      dateStr <= (ev.endDate || ev.startDate) &&
      eventMatchesFilter(ev)
    );
    return [...internal, ...external];
  }

  function allEventsOnDateRange(startStr, endStr) {
    const all = [...events, ...externalEvents];
    return all.filter(ev =>
      ev.startDate <= endStr && (ev.endDate || ev.startDate) >= startStr && eventMatchesFilter(ev)
    );
  }

  /* 終了時間を取得（未設定なら開始+3h） */
  function getEndTime(ev) {
    if (ev.endTime) return ev.endTime;
    if (!ev.startTime) return null;
    const [h, m] = ev.startTime.split(':').map(Number);
    const total = h * 60 + m + 180;
    return `${String(Math.min(Math.floor(total/60),23)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;
  }
  function isFirstDay(ev, d) { return ev.startDate === d; }

  /* ====================================================================
   * THEME
   * ==================================================================== */
  function applyTheme(theme) {
    currentTheme = theme;
    const root = document.getElementById('schedule-root');
    const vars = THEMES[theme];
    if (!root || !vars) return;
    Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
    // ヘッダー背景・入力背景もテーマに合わせる
    const btn = document.getElementById('sc-btnTheme');
    if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
    saveTheme(theme);
  }

  function toggleTheme() {
    applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
  }

  /* ====================================================================
   * FULLSCREEN
   * ==================================================================== */
  function toggleFullscreen() {
    const root = document.getElementById('schedule-root');
    const btn  = document.getElementById('sc-btnFullscreen');
    if (!isFullscreen) {
      // CSS全画面 (kintone環境ではdocument.requestFullscreenが制限される場合があるため両方試みる)
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
      root.classList.add('sc-fullscreen');
      isFullscreen = true;
      if (btn) btn.textContent = '✕';
    } else {
      if (document.exitFullscreen && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      root.classList.remove('sc-fullscreen');
      isFullscreen = false;
      if (btn) btn.textContent = '⛶';
    }
    applyZoom(currentZoom); // ズーム表示を再適用（ラベル等の同期も含む）
  }

  // ESCキーで全画面解除
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isFullscreen) toggleFullscreen();
  });

  /* ====================================================================
   * VIEWER ZOOM（閲覧専用ページの拡大縮小／大型ディスプレイ・スマホ用）
   * ==================================================================== */
  const ZOOM_KEY = 'sc-viewer-zoom';
  const ZOOM_MIN = 0.6, ZOOM_MAX = 1.6, ZOOM_STEP = 0.1;
  let currentZoom = 1.0;
  try {
    const savedZoom = parseFloat(localStorage.getItem(ZOOM_KEY));
    if (!isNaN(savedZoom) && savedZoom >= ZOOM_MIN && savedZoom <= ZOOM_MAX) currentZoom = savedZoom;
  } catch (e) {}

  /* 平野さんからのご要望「ボタンを押したらChromeの拡大縮小と同じように
   * 動いてほしい」を受けて、CSSのzoomプロパティ（ブラウザのページ拡大
   * 縮小機能と同じ仕組み。Chrome/Edge系で標準サポート、対象機材
   * （RICOHディスプレイ・スマホとも実ブラウザはChrome）では問題なく
   * 動作する）に切り替えた。
   *
   * これまでのtransform:scale()方式は「見た目だけ」縮小するもので、
   * 要素自身のレイアウト上の占有領域（高さ等）は変わらないため、縮小
   * した分の余白（空白／黒い箱）が残ってしまい、それを埋めるために
   * ラッパー要素のサイズをJSで毎回計算し直す、という複雑な補正が
   * 必要だった。
   *
   * zoomプロパティは逆に「レイアウト上の占有領域そのもの」を倍率に
   * 応じて縮小・拡大する（ブロック要素の場合、横幅は親要素の幅を
   * 満たす挙動のため変化しないが、縦の高さは内容に応じて自然に縮む）。
   * そのため、JS側でラッパーのサイズを計算したり、自身のwidth/heightを
   * px固定したりする補正コードが一切不要になった。縮小すれば本当に
   * その分だけ占有スペースが減り、kintone本来のページネーション等は
   * 自然に詰まって表示される（実機DOMで確認済み。これは仕様として
   * 許容する挙動）。
   *
   * 全画面表示（toggleFullscreen）との併用についての注意：
   * 全画面中の#schedule-rootはposition:fixed;inset:0（vw/vh単位は
   * 使わない）で画面を覆っているため、通常表示時と同じくrootに直接
   * CSSのzoomプロパティを掛けるだけでよい（transformによる見た目だけ
   * の縮小は使わない）。insetベースの全画面指定はzoom倍率の影響を
   * 受けないため、縮小時も画面を埋め尽くしたまま、より多くの日数が
   * 一画面に収まる（詳細はCSSのFULLSCREENセクションのコメント参照）。 */
  function applyZoom(z) {
    z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(z * 10) / 10));
    currentZoom = z;
    const root = document.getElementById('schedule-root');
    if (root) {
      root.style.zoom = Math.abs(z - 1) < 0.001 ? '' : String(z);
    }
    const lbl = document.getElementById('sc-zoomLabel');
    if (lbl) lbl.textContent = Math.round(z * 100) + '%';
    try { localStorage.setItem(ZOOM_KEY, String(z)); } catch (e) {}
  }

  function initViewerZoom() {
    const btnIn  = document.getElementById('sc-zoomIn');
    const btnOut = document.getElementById('sc-zoomOut');
    const lbl    = document.getElementById('sc-zoomLabel');
    if (btnIn)  btnIn.addEventListener('click', () => applyZoom(currentZoom + ZOOM_STEP));
    if (btnOut) btnOut.addEventListener('click', () => applyZoom(currentZoom - ZOOM_STEP));
    if (lbl)    lbl.addEventListener('click', () => applyZoom(1.0));
    applyZoom(currentZoom);
    window.addEventListener('resize', () => applyZoom(currentZoom));
  }

  /* ====================================================================
   * kintone API
   * ==================================================================== */
  function setSyncStatus(state, msg) {
    const el = document.getElementById('sc-syncStatus');
    if (!el) return;
    el.className = `sync-status ${state}`;
    el.textContent = `● ${msg}`;
  }

  async function kintoneApiCall(method, endpoint, params) {
    if (VIEWER_MODE) {
      // 書き込み系は閲覧モードでは無視
      if (method !== 'GET' || endpoint !== 'records') return { records: [], id: 0 };
      const now = Date.now();
      // クエリから日付範囲を抽出（開始日 / 日付選択用 どちらにも対応）
      const q = params.query || '';
      const fromM = q.match(/(?:開始日|日付選択用)\s*>=\s*"([^"]+)"/);
      const toM   = q.match(/(?:開始日|日付選択用)\s*<=\s*"([^"]+)"/);
      const dateFrom = fromM ? fromM[1] : null;
      const dateTo   = toM   ? toM[1]   : null;
      const cacheKey = dateFrom && dateTo ? `${dateFrom}_${dateTo}` : 'all';
      const cached = __viewerCache.get(cacheKey);
      if (!cached || (now - cached.time) > VIEWER_CACHE_TTL) {
        let url = VIEWER_GAS_URL;
        if (dateFrom && dateTo) url += `?from=${encodeURIComponent(dateFrom)}&to=${encodeURIComponent(dateTo)}`;
        const res = await fetch(url, { method: 'GET', cache: 'no-cache' });
        if (!res.ok) throw new Error('GAS取得エラー: ' + res.status);
        __viewerCache.set(cacheKey, { data: await res.json(), time: now });
      }
      const data = __viewerCache.get(cacheKey).data;
      const appKey = String(params.app);
      if (appKey === String(APP_ID))          return { records: data.events    || [] };
      if (appKey === String(EXTERNAL_APP_ID)) return { records: data.externals || [] };
      if (appKey === String(HOLIDAY_APP_ID))  return { records: data.holidays  || [] };
      return { records: [] };
    }
    return kintone.api(`/k/v1/${endpoint}`, method, params);
  }

  function kintoneToEvent(rec) {
    const codes = (rec['担当者'].value || []).map(u => u.code);
    const staffIds = codes.map(c => { const s = getStaffByCode(c); return s ? s.id : null; }).filter(id => id !== null);
    const timeRaw    = rec['開始時間'].value || '';
    const endTimeRaw = rec['終了時間'] ? (rec['終了時間'].value || '') : '';
    const creatorCode = (rec['作成者'] && rec['作成者'].value) ? rec['作成者'].value.code : '';
    const cs = getStaffByCode(creatorCode);
    return {
      id          : eventIdCounter++,
      kintoneId   : rec['$id'].value,
      startDate   : rec['開始日'].value || '',
      endDate     : rec['終了日'].value || rec['開始日'].value || '',
      site        : rec['現場名'].value || '',
      startTime   : timeRaw ? timeRaw.slice(0, 5) : '',
      endTime     : endTimeRaw ? endTimeRaw.slice(0, 5) : '',
      staff       : staffIds,
      notes       : rec['備考'] ? (rec['備考'].value || '') : '',
      type        : rec['種別'] ? (rec['種別'].value || '工事現場') : '工事現場',
      creatorCode : creatorCode,
      creatorOrg  : cs ? cs.org : ''
    };
  }

  function eventToKintone(ev) {
    const staffValues = ev.staff.map(sid => { const s = getStaff(sid); return s ? { code: s.code } : null; }).filter(Boolean);
    return {
      '現場名'  : { value: ev.site },
      '開始日'  : { value: ev.startDate },
      '終了日'  : { value: ev.endDate || ev.startDate },
      '開始時間': { value: ev.startTime ? ev.startTime + ':00' : '' },
      '終了時間': { value: ev.endTime  ? ev.endTime  + ':00' : '' },
      '担当者'  : { value: staffValues },
      '備考'    : { value: ev.notes || '' },
      '種別'    : { value: ev.type || '工事現場' }
    };
  }

  /* 500件超でも全件取得するカーソルAPI対応ヘルパー */
  async function fetchAllRecords(app, query, fields) {
    if (VIEWER_MODE) {
      // VIEWERモードはGASから取得するため従来の kintoneApiCall を使用
      const data = await kintoneApiCall('GET', 'records', { app, query: query + ' limit 500', fields });
      return data.records;
    }
    // カーソル作成
    const cursor = await kintone.api('/k/v1/records/cursor', 'POST', { app, query, fields, size: 500 });
    let allRecords = [];
    let hasNext = true;
    while (hasNext) {
      const result = await kintone.api('/k/v1/records/cursor', 'GET', { id: cursor.id });
      allRecords = allRecords.concat(result.records);
      hasNext = result.next;
    }
    return allRecords;
  }

  /* 指定月範囲をロード（未ロード月のみ取得してマージ） */
  async function loadMonthRange(fromYear, fromMonth, toYear, toMonth) {
    if (isLoadingRange) return;

    // 未ロード月を抽出
    const toLoad = [];
    let y = fromYear, m = fromMonth;
    while (y < toYear || (y === toYear && m <= toMonth)) {
      if (!isMonthLoaded(y, m)) toLoad.push({ y, m });
      m++; if (m > 11) { m = 0; y++; }
    }
    if (toLoad.length === 0) return;

    isLoadingRange = true;
    const fromStr = firstOfMonth(fromYear, fromMonth);
    const toStr   = lastOfMonth(toYear, toMonth);
    // 複数日またがりイベントをカバーするため2ヶ月前から取得
    const ext = shiftMonthBy(fromYear, fromMonth, -2);
    const extFromStr = firstOfMonth(ext.y, ext.m);

    setSyncStatus('busy', '読込中...');
    try {
      const records = await fetchAllRecords(
        APP_ID,
        `開始日 >= "${extFromStr}" and 開始日 <= "${toStr}" order by 開始日 asc`,
        ['$id','現場名','開始日','終了日','開始時間','終了時間','担当者','作成者','備考','種別']
      );
      const existingIds = new Set(events.map(e => String(e.kintoneId)));
      const newEvs = records.map(r => kintoneToEvent(r)).filter(e => !existingIds.has(String(e.kintoneId)));
      events = [...events, ...newEvs];

      // 申請アプリも同期取得
      await loadApplicationEventsRange(fromStr, toStr);
      await loadHolidaysRange(fromStr, toStr);

      toLoad.forEach(({ y, m }) => loadedMonths.add(monthKey(y, m)));
      setSyncStatus('ok', `同期済み ${new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`);
    } catch (e) {
      console.error('range load error:', e);
      setSyncStatus('err', `取得失敗: ${e.message}`);
      showToast(`⚠️ データ取得失敗: ${e.message}`);
    } finally {
      isLoadingRange = false;
    }
  }

  /* ====================================================================
   * VERIFY CURRENT VIEW（表示期間の差分チェック）
   * loadMonthRange は「開始日」基準でしか取得しないため、
   * 開始日が表示期間より古い長期スケジュールが抜けることがある。
   * この関数は「終了日が表示期間内に重なる全件」のIDをkintoneに
   * 問い合わせてローカルキャッシュと照合し、欠落分のみ追加取得する。
   * ==================================================================== */
  let _verifyBusy = false; // 二重実行防止

  async function verifyCurrentView() {
    if (VIEWER_MODE || _verifyBusy) return;
    _verifyBusy = true;

    // 現在ビューの表示日付範囲を決定
    let fromStr, toStr;
    if (currentView === 'week' && currentWeekStart) {
      const ws = currentWeekStart;
      const we = new Date(ws); we.setDate(we.getDate() + 6);
      fromStr = toDateStr(ws.getFullYear(), ws.getMonth(), ws.getDate());
      toStr   = toDateStr(we.getFullYear(), we.getMonth(), we.getDate());
    } else {
      fromStr = firstOfMonth(currentYear, currentMonth);
      toStr   = lastOfMonth(currentYear, currentMonth);
    }

    const verifyBtn = document.getElementById('sc-btnVerify');
    if (verifyBtn) { verifyBtn.textContent = '⏳'; verifyBtn.disabled = true; }

    try {
      // 期間に重なる全レコードのIDだけを取得（終了日が期間内に入るものも含む）
      const query = `開始日 <= "${toStr}" and 終了日 >= "${fromStr}" order by 開始日 asc`;
      const idRecs = await fetchAllRecords(APP_ID, query, ['$id']);
      const kintoneIdSet = new Set(idRecs.map(r => String(r['$id'].value)));
      const cachedIdSet  = new Set(events.filter(e => e.kintoneId).map(e => String(e.kintoneId)));

      const missingIds = [...kintoneIdSet].filter(id => !cachedIdSet.has(id));
      if (missingIds.length === 0) {
        console.log(`[verify] ${fromStr}〜${toStr}: 欠落なし（${kintoneIdSet.size}件確認）`);
      } else {
        console.warn(`[verify] ${fromStr}〜${toStr}: ${missingIds.length}件欠落 → 補完取得`, missingIds);
        // 欠落レコードを一括取得してマージ
        const idQuery = `$id in (${missingIds.join(',')})`;
        const fullRecs = await fetchAllRecords(
          APP_ID, idQuery,
          ['$id','現場名','開始日','終了日','開始時間','終了時間','担当者','作成者','備考','種別']
        );
        const newEvs = fullRecs.map(r => kintoneToEvent(r));
        events = [...events, ...newEvs];
        showToast(`🔍 ${missingIds.length}件の表示漏れを補完しました`);
        renderMain();
      }
    } catch (e) {
      console.error('[verify] チェックエラー:', e);
    } finally {
      _verifyBusy = false;
      if (verifyBtn) { verifyBtn.textContent = '🔍'; verifyBtn.disabled = false; }
    }
  }

  /* ナビゲーション時：必要月のロードを確保してから描画 */
  async function navigateAndRender() {
    const needed  = getNeededMonths();
    const missing = needed.filter(({ y, m }) => !isMonthLoaded(y, m));
    if (missing.length > 0) {
      missing.sort((a, b) => a.y !== b.y ? a.y - b.y : a.m - b.m);
      const first = missing[0], last = missing[missing.length - 1];
      await loadMonthRange(first.y, first.m, last.y, last.m);
    }
    renderMain();
    // バックグラウンドで表示漏れチェック（レンダリングをブロックしない）
    verifyCurrentView().catch(e => console.error('[verify]', e));
  }

  async function loadFromKintone() {
    showLoading('kintoneからデータを取得中...');
    loadedMonths.clear();
    events = [];
    externalEvents = [];
    holidaySet = new Set();
    dailyRenderEndOffset = 1;

    if (VIEWER_MODE) {
      /* ---- VIEWERモード: GASから全データを1回で取得 ---- */
      setSyncStatus('busy', '読込中...');
      try {
        const now = Date.now();
        const cached = __viewerCache.get('all');
        if (!cached || (now - cached.time) > VIEWER_CACHE_TTL) {
          const res = await fetch(VIEWER_GAS_URL, { method: 'GET', cache: 'no-cache' });
          if (!res.ok) throw new Error('GAS取得エラー: ' + res.status);
          __viewerCache.set('all', { data: await res.json(), time: now });
        }
        const gasData = __viewerCache.get('all').data;
        events = (gasData.events || []).map(r => kintoneToEvent(r));
        externalEvents = (gasData.externals || []).map(r => mapExtRecord(r)).filter(Boolean)
          .sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
        holidaySet = new Set((gasData.holidays || []).map(r => mapHolidayDate(r)).filter(Boolean));
        // 全月をロード済みとマーク → 以降のナビで追加GAS呼び出しなし
        const td = getToday();
        for (let d = -36; d <= 36; d++) {
          const s = shiftMonthBy(td.getFullYear(), td.getMonth(), d);
          loadedMonths.add(monthKey(s.y, s.m));
        }
        console.log('[VIEWER] スケジュール:', events.length, '件 / 申請アプリ:', externalEvents.length, '件');
        setSyncStatus('ok', `同期済み ${new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`);
      } catch (e) {
        console.error('GAS load error:', e);
        setSyncStatus('err', `取得失敗: ${e.message}`);
        showToast(`⚠️ データ取得失敗: ${e.message}`);
      } finally {
        hideLoading();
      }
      renderMain();
      return;
    }

    /* ---- kintone直接モード: 遅延ロード（±2ヶ月から開始） ---- */
    const today = getToday();
    const ty = today.getFullYear(), tm = today.getMonth();
    const from = shiftMonthBy(ty, tm, -2);
    const to   = shiftMonthBy(ty, tm, 2);
    try {
      await loadMonthRange(from.y, from.m, to.y, to.m);
    } catch (e) {
      console.error('kintone load error:', e);
      setSyncStatus('err', `取得失敗: ${e.message}`);
      showToast(`⚠️ kintone取得失敗: ${e.message}`);
    } finally {
      hideLoading();
    }
    renderMain();
    // 初期ロード後も表示漏れチェックを実行
    verifyCurrentView().catch(e => console.error('[verify]', e));
  }


  /* ====================================================================
   * 申請アプリ参照イベント取得（共通マッパー）
   * ==================================================================== */
  function mapExtRecord(rec) {
    const dateVal = (rec['日付選択用'] && rec['日付選択用'].value) ? rec['日付選択用'].value : null;
    if (!dateVal) return null;
    const format      = rec['休みの形式'] ? rec['休みの形式'].value : '一日';
    const memo        = rec['時間表示用'] ? (rec['時間表示用'].value || '') : '';
    const category    = rec['非当番'] ? rec['非当番'].value : '';
    const creatorCode = (rec['作成者'] && rec['作成者'].value) ? rec['作成者'].value.code : '';
    const cs = getStaffByCode(creatorCode);
    let startTime = '08:00', endTime = '17:00';
    if (format === 'AM')      { startTime = '08:00'; endTime = '12:00'; }
    else if (format === 'PM') { startTime = '13:00'; endTime = '17:00'; }
    const staffId = cs ? cs.id : null;
    return {
      id        : eventIdCounter++,
      kintoneId : rec['$id'].value,
      startDate : dateVal,
      endDate   : dateVal,
      site      : category + (cs ? ` (${cs.name})` : ''),
      startTime, endTime,
      // 「休みの形式」(一日/AM/PM) を保持。表示時間が同じ「08:00」でも
      // 全日休みと午前休みを見分けられるようにするため使用する。
      restFormat: format,
      staff     : staffId !== null ? [staffId] : [],
      notes     : memo,
      type      : '会社行事',
      isExternal: true,
      creatorCode,
      creatorOrg: cs ? cs.org : ''
    };
  }

  /* 範囲指定付き申請アプリ取得（loadMonthRange から呼ぶ） */
  async function loadApplicationEventsRange(fromDate, toDate) {
    try {
      const targetValues = '"有給","振替休日","夏季休暇","特別休暇","土曜出勤"';
      let query = `非当番 in (${targetValues})`;
      if (fromDate && toDate) query += ` and 日付選択用 >= "${fromDate}" and 日付選択用 <= "${toDate}"`;
      const recs = await fetchAllRecords(
        EXTERNAL_APP_ID, query,
        ['$id','非当番','日付選択用','休みの形式','時間表示用','作成者']
      );
      const existingIds = new Set(externalEvents.map(e => String(e.kintoneId)));
      const newEvs = recs.map(r => mapExtRecord(r)).filter(Boolean).filter(e => !existingIds.has(String(e.kintoneId)));
      externalEvents = [...externalEvents, ...newEvs].sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
      console.log('[申請アプリ] 追加ロード件数:', newEvs.length, '累計:', externalEvents.length);
    } catch (e) {
      console.error('[申請アプリ] 取得失敗:', e);
    }
  }

  /* ====================================================================
   * 休日登録アプリ参照（アプリID:159）【日付】フィールドのみ取得
   * ==================================================================== */
  function mapHolidayDate(rec) {
    return (rec['日付'] && rec['日付'].value) ? rec['日付'].value : null;
  }

  /* 範囲指定付き休日データ取得（loadMonthRange から呼ぶ） */
  async function loadHolidaysRange(fromDate, toDate) {
    try {
      let query = '';
      if (fromDate && toDate) query = `日付 >= "${fromDate}" and 日付 <= "${toDate}"`;
      const recs = await fetchAllRecords(HOLIDAY_APP_ID, query, ['日付']);
      let added = 0;
      recs.forEach(r => {
        const d = mapHolidayDate(r);
        if (d && !holidaySet.has(d)) { holidaySet.add(d); added++; }
      });
      console.log('[休日登録アプリ] 追加ロード件数:', added, '累計:', holidaySet.size);
    } catch (e) {
      console.error('[休日登録アプリ] 取得失敗:', e);
    }
  }

  async function saveToKintone(ev) {
    const data = await kintoneApiCall('POST', 'record', { app: APP_ID, record: eventToKintone(ev) });
    ev.kintoneId = data.id;
    ev.creatorCode = loginUser.code;
    const cs = getStaffByCode(loginUser.code);
    ev.creatorOrg = cs ? cs.org : '';
  }

  async function updateKintone(ev) {
    if (!ev.kintoneId) return;
    await kintoneApiCall('PUT', 'record', { app: APP_ID, id: ev.kintoneId, record: eventToKintone(ev) });
  }

  async function deleteFromKintone(kintoneId) {
    if (!kintoneId) return;
    await kintoneApiCall('DELETE', 'records', { app: APP_ID, ids: [kintoneId] });
  }


  /* ====================================================================
   * TOOLTIP
   * ==================================================================== */
  (function(){
    var tip = null;
    var hideTimer = null;

    // CSS自己挿入（SCHEDULE_CSSに依存しない）
    if (!document.getElementById('sc-tooltip-css')) {
      var ts = document.createElement('style');
      ts.id = 'sc-tooltip-css';
      ts.textContent = [
        '#sc-tooltip{position:fixed;z-index:20000;pointer-events:none;',
        'background:var(--surface,#242424);border:1px solid var(--accent,#e8820c);border-radius:6px;',
        'padding:10px 13px;min-width:200px;max-width:300px;',
        'box-shadow:0 6px 24px rgba(0,0,0,.45);',
        'font-family:"Hiragino Kaku Gothic ProN","Meiryo",sans-serif;',
        'font-size:.78rem;color:var(--text,#e8e0d0);line-height:1.55;',
        'opacity:0;transition:opacity .15s;word-break:break-all;}',
        '#sc-tooltip.visible{opacity:1;}',
        '#sc-tooltip .tt-title{font-size:.88rem;font-weight:700;color:var(--accent,#e8820c);',
        'margin-bottom:6px;border-bottom:1px solid var(--border,#444);padding-bottom:5px;}',
        '#sc-tooltip .tt-row{display:flex;gap:6px;margin-bottom:2px;}',
        '#sc-tooltip .tt-label{color:var(--text-dim,#999);white-space:nowrap;font-size:.72rem;}',
        '#sc-tooltip .tt-val{color:var(--text,#e8e0d0);}',
        '#sc-tooltip .tt-badges{display:flex;flex-wrap:wrap;gap:3px;margin-top:4px;}',
        '#sc-tooltip .tt-badges .badge{font-size:.62rem;padding:1px 6px;cursor:default;}',
        '#sc-tooltip .tt-ext-mark{font-size:.65rem;background:rgba(46,204,113,.2);color:#27ae60;',
        'border:1px solid #2ecc71;border-radius:3px;padding:1px 6px;display:inline-block;margin-bottom:5px;}'
      ].join('');
      document.head.appendChild(ts);
    }

    // tooltip要素を確実に取得（detached検出つき）
    function getTip() {
      if (!tip || !document.body.contains(tip)) {
        tip = document.getElementById('sc-tooltip');
        if (!tip) {
          tip = document.createElement('div');
          tip.id = 'sc-tooltip';
          var root = document.getElementById('schedule-root');
          (root || document.body).appendChild(tip);
        }
      }
      return tip;
    }

    function showTooltip(ev, e) {
      clearTimeout(hideTimer);
      var t = getTip(); if (!t) return;

      // 内容構築
      var html = '';
      if (ev.isExternal) html += '<div class="tt-ext-mark">📋 申請アプリ参照</div>';
      html += '<div class="tt-title">' + escHtml(ev.site) + '</div>';

      // 日付
      var dateStr = ev.startDate || '';
      if (ev.endDate && ev.endDate !== ev.startDate) dateStr += ' 〜 ' + ev.endDate;
      if (dateStr) html += '<div class="tt-row"><span class="tt-label">📅 日付</span><span class="tt-val">' + dateStr + '</span></div>';

      // 時間
      if (ev.startTime) {
        var timeStr = ev.startTime;
        var et = getEndTime(ev);
        if (et) {
          var _tipNextDay = ev.endDate && ev.endDate !== ev.startDate && ev.endTime && ev.endTime < ev.startTime;
          timeStr += ' 〜 ' + (_tipNextDay ? '翌' : '') + et;
        }
        // 申請アプリ参照（有給・振替休日など）は「全日／午前／午後」を明示する
        // （開始時刻だけでは全日休みと午前休みが同じ「08:00」になり区別できないため）
        if (ev.isExternal) {
          var _lbl = ev.restFormat === 'AM' ? '午前' : ev.restFormat === 'PM' ? '午後' : '全日';
          timeStr = _lbl + '（' + timeStr + '）';
        }
        html += '<div class="tt-row"><span class="tt-label">🕐 時間</span><span class="tt-val">' + timeStr + '</span></div>';
      }

      // 種別
      var typeIcon = ev.isExternal ? '📋' : (ev.type === '期日管理' ? '⚠️' : (ev.type === '会社行事' ? '🏢' : '🔧'));
      html += '<div class="tt-row"><span class="tt-label">📌 種別</span><span class="tt-val">' + typeIcon + ' ' + escHtml(ev.type || '') + '</span></div>';

      // 備考
      if (ev.notes) html += '<div class="tt-row"><span class="tt-label">📝 備考</span><span class="tt-val">' + escHtml(ev.notes) + '</span></div>';

      // 担当者バッジ
      if (ev.staff && ev.staff.length > 0) {
        html += '<div class="tt-badges">';
        ev.staff.forEach(function(sid){ var s = getStaff(sid); if(s) html += '<span class="badge" style="background:'+s.color+';color:#fff;">'+escHtml(s.name)+'</span>'; });
        html += '</div>';
      }

      t.innerHTML = html;
      positionTip(t, e);
      t.classList.add('visible');
    }

    function hideTooltip() {
      hideTimer = setTimeout(function(){
        var t = getTip(); if (t) t.classList.remove('visible');
      }, 80);
    }

    function positionTip(t, e) {
      var x = e.clientX + 14, y = e.clientY + 14;
      // 画面端チェック
      var W = window.innerWidth, H = window.innerHeight;
      t.style.left = '-9999px'; t.style.top = '-9999px'; t.classList.add('visible');
      var tw = t.offsetWidth, th = t.offsetHeight;
      if (x + tw > W - 8) x = e.clientX - tw - 14;
      if (y + th > H - 8) y = e.clientY - th - 14;
      t.style.left = Math.max(4, x) + 'px';
      t.style.top  = Math.max(4, y) + 'px';
    }

    function escHtml(s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    // グローバルに公開
    window._scShowTip = showTooltip;
    window._scHideTip = hideTooltip;
  })();

  /* ====================================================================
   * LOADING / TOAST
   * ==================================================================== */
  function showLoading(msg) {
    const el = document.getElementById('sc-loadingText');
    if (el) el.textContent = msg || 'kintoneと同期中...';
    const ov = document.getElementById('sc-loadingOverlay');
    if (ov) ov.classList.add('show');
  }
  function hideLoading() {
    const ov = document.getElementById('sc-loadingOverlay');
    if (ov) ov.classList.remove('show');
  }
  function showToast(msg) {
    let t = document.getElementById('sc-toast');
    if (!t) {
      t = document.createElement('div'); t.id = 'sc-toast';
      t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#2e2e2e;border:1px solid #555;color:#e8e0d0;padding:10px 20px;border-radius:6px;font-size:.85rem;box-shadow:0 4px 16px rgba(0,0,0,.5);z-index:12000;transition:opacity .3s;pointer-events:none;font-family:Meiryo,sans-serif;white-space:nowrap;';
      document.body.appendChild(t);
    }
    t.textContent = msg; t.style.opacity = '1';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.style.opacity = '0'; }, 2800);
  }

  /* ====================================================================
   * BADGE
   * ==================================================================== */
  function makeBadge(staff, draggable) {
    const b = document.createElement('span');
    b.className = 'badge';
    b.style.background = staff.color;
    b.style.color = '#fff';
    b.textContent = staff.name;
    if (draggable) {
      b.dataset.staffId = staff.id;
      if (!isTouch) {
        b.draggable = true;
        b.addEventListener('dragstart', onBadgeDragStart);
        b.addEventListener('dragend',   onBadgeDragEnd);
      } else {
        b.addEventListener('click', e => { e.stopPropagation(); onBadgeTouchSelect(parseInt(b.dataset.staffId)); });
      }
    }
    return b;
  }

  /* ====================================================================
   * TOUCH MODE
   * ==================================================================== */
  function onBadgeTouchSelect(staffId) {
    if (touchSelectedStaffId === staffId) { clearTouchSelection(); return; }
    touchSelectedStaffId = staffId;
    document.querySelectorAll('.badge.touch-selected').forEach(b => b.classList.remove('touch-selected'));
    document.querySelectorAll(`[data-staff-id="${staffId}"]`).forEach(b => b.classList.add('touch-selected'));
    const s = getStaff(staffId);
    const hint = document.getElementById('sc-touchHint');
    if (hint) { hint.textContent = `👆 ${s ? s.name : ''}を選択中 → 日付or現場をタップ`; hint.classList.add('active'); }
  }
  function clearTouchSelection() {
    touchSelectedStaffId = null;
    document.querySelectorAll('.badge.touch-selected').forEach(b => b.classList.remove('touch-selected'));
    const hint = document.getElementById('sc-touchHint');
    if (hint) hint.classList.remove('active');
  }
  function onCellTouchClick(dateStr) {
    if (!touchSelectedStaffId) return;
    openQuickModal(touchSelectedStaffId, dateStr);
    clearTouchSelection();
  }
  async function onChipTouchClick(eventId) {
    if (!touchSelectedStaffId) return;
    const ev = events.find(e => e.id === eventId); if (!ev) return;
    const s = getStaff(touchSelectedStaffId);
    if (!ev.staff.includes(touchSelectedStaffId)) {
      ev.staff.push(touchSelectedStaffId);
      showToast(`✅ ${s ? s.name : ''}を「${ev.site}」に追加しました`);
      clearTouchSelection(); renderMain();
      try {
        setSyncStatus('busy', '同期中...');
        await updateKintone(ev);
        setSyncStatus('ok', `同期済み ${new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`);
      } catch (err) { setSyncStatus('err', `更新失敗: ${err.message}`); showToast('⚠️ kintoneの更新に失敗しました'); }
    } else {
      showToast(`ℹ️ ${s ? s.name : ''}はすでに登録されています`); clearTouchSelection();
    }
  }

  /* ====================================================================
   * ORG FILTER
   * ==================================================================== */
  function renderOrgFilter() {
    const grid = document.getElementById('sc-orgFilterGrid');
    if (!grid) return;
    grid.innerHTML = '';
    ORGS.forEach(org => {
      const count = STAFF.filter(s => s.org === org).length;
      const label = document.createElement('label'); label.className = 'org-check-item';
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.value = org; cb.checked = selectedOrgs.has(org);
      cb.addEventListener('change', () => {
        cb.checked ? selectedOrgs.add(org) : selectedOrgs.delete(org);
        saveFilterState(); renderStaffPool(); renderCheckboxGrid(); renderMain();
      });
      const span = document.createElement('span'); span.className = 'org-label'; span.textContent = org;
      const cnt  = document.createElement('span'); cnt.className = 'org-count'; cnt.textContent = `${count}名`;
      label.appendChild(cb); label.appendChild(span); label.appendChild(cnt);
      grid.appendChild(label);
    });
  }

  /* ====================================================================
   * PERSONAL FILTER
   * ==================================================================== */
  function renderPersonalFilter() {
    const btn   = document.getElementById('sc-btnPersonalToggle');
    const body  = document.getElementById('sc-personalFilterBody');
    const sel   = document.getElementById('sc-personalStaffSelect');
    const cbCorp     = document.getElementById('sc-personalShowCorp');
    const cbDeadline = document.getElementById('sc-personalShowDeadline');
    const orgPanel   = document.getElementById('sc-orgFilter');
    if (!btn || !body || !sel) return;

    // 社員選択ドロップダウンを構築（部署順）
    const prevValue = String(personalFilterStaffId != null ? personalFilterStaffId : '');
    sel.innerHTML = '';
    const optEmpty = document.createElement('option');
    optEmpty.value = '';
    optEmpty.textContent = '-- 社員を選択 --';
    sel.appendChild(optEmpty);
    ORGS.forEach(org => {
      const list = STAFF.filter(s => s.org === org);
      if (list.length === 0) return;
      const og = document.createElement('optgroup');
      og.label = org;
      list.forEach(s => {
        const op = document.createElement('option');
        op.value = String(s.id);
        op.textContent = s.name;
        og.appendChild(op);
      });
      sel.appendChild(og);
    });
    sel.value = prevValue;
    // 保存値が現存スタッフに存在しない場合は解除
    if (personalFilterStaffId != null && !getStaff(personalFilterStaffId)) {
      personalFilterStaffId = null;
      sel.value = '';
      savePersonalFilterState();
    }

    // ON/OFF状態の反映
    if (personalFilterMode) {
      btn.classList.add('active');
      btn.textContent = '👤 個人モード ON';
      body.classList.add('active');
      if (orgPanel) orgPanel.classList.add('disabled');
    } else {
      btn.classList.remove('active');
      btn.textContent = '👤 個人の予定を確認';
      body.classList.remove('active');
      if (orgPanel) orgPanel.classList.remove('disabled');
    }
    cbCorp.checked     = personalShowCorp;
    cbDeadline.checked = personalShowDeadline;

    // 浮遊型ボタンも同期
    renderPersonalFab();
  }

  /* ====================================================================
   * PERSONAL FAB (浮遊型 個人フィルターボタン)
   * ==================================================================== */
  function renderPersonalFab() {
    const fab        = document.getElementById('sc-personalFab');
    const fabText    = document.getElementById('sc-fabText');
    const toggle     = document.getElementById('sc-fabModeToggle');
    const sel        = document.getElementById('sc-fabStaffSelect');
    const cbCorp     = document.getElementById('sc-fabShowCorp');
    const cbDeadline = document.getElementById('sc-fabShowDeadline');
    if (!fab || !sel) return;

    // FABの見た目を更新（ONかつ社員選択中なら社員名を表示）
    if (personalFilterMode && personalFilterStaffId != null) {
      const s = getStaff(personalFilterStaffId);
      fab.classList.add('active');
      fabText.textContent = s ? s.name : '個人モード';
    } else {
      fab.classList.remove('active');
      fabText.textContent = '個人';
    }

    // セレクト構築（部署順）
    const prevValue = String(personalFilterStaffId != null ? personalFilterStaffId : '');
    sel.innerHTML = '';
    const optEmpty = document.createElement('option');
    optEmpty.value = '';
    optEmpty.textContent = '-- 社員を選択 --';
    sel.appendChild(optEmpty);
    ORGS.forEach(org => {
      const list = STAFF.filter(s => s.org === org);
      if (list.length === 0) return;
      const og = document.createElement('optgroup');
      og.label = org;
      list.forEach(s => {
        const op = document.createElement('option');
        op.value = String(s.id);
        op.textContent = s.name;
        og.appendChild(op);
      });
      sel.appendChild(og);
    });
    sel.value = prevValue;

    // モード切替ボタン
    if (personalFilterMode) {
      toggle.classList.add('active');
      toggle.textContent = '個人モード ON';
    } else {
      toggle.classList.remove('active');
      toggle.textContent = '個人モード OFF';
    }

    cbCorp.checked     = personalShowCorp;
    cbDeadline.checked = personalShowDeadline;
  }

  /* ====================================================================
   * STAFF POOL
   * ==================================================================== */
  function renderStaffPool() {
    const pool = document.getElementById('sc-staffPool');
    if (!pool) return;
    pool.innerHTML = '';
    visibleStaff().forEach(s => pool.appendChild(makeBadge(s, true)));
    const desc = document.getElementById('sc-poolDesc');
    if (desc) desc.textContent = isTouch
      ? 'バッジをタップして選択 → 日付をタップで登録 / 現場をタップでメンバー追加'
      : '空き日付へドラッグ→現場登録 ／ 既存の現場へドラッグ→メンバー追加';
  }

  /* ====================================================================
   * CHECKBOX GRIDS
   * ==================================================================== */
  function buildCheckboxGrid(containerId, selectedIds) {
    selectedIds = selectedIds || [];
    const grid = document.getElementById(containerId);
    if (!grid) return;
    grid.innerHTML = '';
    visibleStaff().forEach(s => {
      const label = document.createElement('label'); label.className = 'checkbox-item';
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.value = s.id;
      if (selectedIds.includes(s.id)) cb.checked = true;
      const badge = document.createElement('span'); badge.className = 'cb-badge badge';
      badge.style.background = s.color; badge.style.color = '#fff'; badge.textContent = s.name;
      label.appendChild(cb); label.appendChild(badge);
      grid.appendChild(label);
    });
  }
  function renderCheckboxGrid() { buildCheckboxGrid('sc-checkboxGrid', []); }

  /* ====================================================================
   * RENDER MAIN
   * ==================================================================== */
  function renderMain() {
    const title = document.getElementById('sc-calTitle');
    if (currentView === 'week') {
      if (!currentWeekStart) currentWeekStart = getWeekStart(getToday());
      const endD = new Date(currentWeekStart); endD.setDate(endD.getDate() + 4);
      const fmt = d => `${d.getMonth()+1}/${d.getDate()}`;
      if (title) title.textContent = `${currentWeekStart.getFullYear()}年 ${fmt(currentWeekStart)}〜${fmt(endD)}`;
      renderTimetable();
    } else {
      if (title) title.textContent = `${currentYear}年 ${currentMonth + 1}月`;
      currentView === 'month' ? renderMonthly() : renderDaily();
    }
  }

  function getWeekStart(d) {
    const dt = new Date(d);
    dt.setHours(0,0,0,0);
    const day = dt.getDay();
    dt.setDate(dt.getDate() - (day === 0 ? 6 : day - 1)); // 月曜始まり
    return dt;
  }

  /* ====================================================================
   * EVENT CHIP / CARD BUILDER
   * ==================================================================== */
  const DAYS = ['日','月','火','水','木','金','土'];

  function makeEvIcon(ev) { return isDeadline(ev) ? '⚠️' : (isCorp(ev) ? '🏢' : '🔧'); }

  /* 申請アプリ参照（有給・振替休日など）の「全日／午前／午後」ラベル。
   * 開始時間だけを見ると「08:00」が全日休みと午前休みの両方で同じ表示になり
   * 区別できないため、「休みの形式」(restFormat) から明示的なラベルを返す。 */
  function extLeaveLabel(ev) {
    if (!ev.isExternal) return '';
    if (ev.restFormat === 'AM') return '午前';
    if (ev.restFormat === 'PM') return '午後';
    return '全日';
  }
  /* チップ/カード用の短い時間表示テキスト（申請アプリ参照イベントはラベル付き） */
  function evTimeLabel(ev) {
    if (!ev.startTime) return '';
    return ev.isExternal ? `🕐 ${extLeaveLabel(ev)}（${ev.startTime}）` : `🕐 ${ev.startTime}`;
  }

  function makeEventChip(ev, dateStr) {
    const first = isFirstDay(ev, dateStr);
    const corp  = isCorp(ev);
    const deadline = isDeadline(ev);
    const chip  = document.createElement('div');
    chip.className = `event-chip${corp ? ' corp' : ''}${deadline ? ' deadline' : ''}${ev.isExternal ? ' ext' : (isTokyoBranch(ev) ? ' tokyo' : '')}${first ? '' : ' cont'}`;
    let html = `<div class="ev-name">${first ? makeEvIcon(ev) : '⟶'} ${ev.site}`;
    if (first && ev.endDate && ev.endDate !== ev.startDate) html += ` 〜${ev.endDate.slice(5)}`;
    html += '</div>';
    if (first && ev.startTime) html += `<div class="ev-time">${evTimeLabel(ev)}</div>`;
    chip.innerHTML = html;
    const bd = document.createElement('div'); bd.className = 'ev-badges';
    ev.staff.forEach(sid => { const s = getStaff(sid); if (s) bd.appendChild(makeBadge(s)); });
    chip.appendChild(bd);
    return chip;
  }

  /* ====================================================================
   * TIMETABLE (週ビュー)
   * ==================================================================== */
  const TT_START_H = 0;   // 表示開始時
  const TT_END_H   = 23;  // 表示終了時（0:00〜24:00 = 24スロット）
  const TT_H_PX    = 48;  // 1時間の高さ(px)
  const TT_DAYS    = 5;   // 表示日数

  function timeToY(timeStr) {
    if (!timeStr) return null;
    const [h, m] = timeStr.split(':').map(Number);
    return (h - TT_START_H + m / 60) * TT_H_PX;
  }

  function renderTimetable() {
    const main = document.getElementById('sc-mainArea');
    if (!main || !currentWeekStart) return;
    main.innerHTML = '';
    const wrap = document.createElement('div'); wrap.className = 'tt-wrap';

    // 日付リスト生成
    const dates = [];
    for (let i = 0; i < TT_DAYS; i++) {
      const d = new Date(currentWeekStart); d.setDate(d.getDate() + i);
      dates.push(d);
    }
    const dateStrs = dates.map(d => toDateStr(d.getFullYear(), d.getMonth(), d.getDate()));

    // ---- 終日エリア ----
    const alldayRow = document.createElement('div'); alldayRow.className = 'tt-allday-row';
    const alldayGutter = document.createElement('div');
    alldayGutter.className = 'tt-time-gutter'; alldayGutter.textContent = '終日';
    alldayRow.appendChild(alldayGutter);
    const alldayArea = document.createElement('div'); alldayArea.className = 'tt-allday-events';
    alldayArea.style.cssText = 'display:grid;grid-template-columns:repeat('+TT_DAYS+',1fr);gap:2px;flex:1;';

    dateStrs.forEach(dateStr => {
      const cell = document.createElement('div');
      cell.style.cssText = 'display:flex;flex-direction:column;gap:2px;padding:2px;';
      const dayEvs = eventsOnDate(dateStr).filter(ev => !ev.startTime);
      dayEvs.forEach(ev => {
        const chip = document.createElement('div');
        const _dl = isDeadline(ev);
        chip.className = `tt-allday-chip${ev.isExternal?' ext':(isTokyoBranch(ev)?' tokyo':(_dl?' deadline':isCorp(ev)?' corp':''))}`;
        // 色変数を選択（期日管理優先）
        const _vars = ev.isExternal
          ? { bg:'--ce-bg', bd:'--ce-border', cl:'--ce-color' }
          : _dl ? { bg:'--dl-bg', bd:'--dl-border', cl:'--dl-color' }
          : { bg:'--ev-bg', bd:'--ev-border', cl:'--ev-color' };
        chip.style.cssText = `background:var(${_vars.bg});border:1px solid var(${_vars.bd});border-left:3px solid var(${_vars.cl});color:var(${_vars.cl});`;
        const adName = document.createElement('span');
        adName.className = 'tt-ad-name';
        adName.textContent = (_dl ? '⚠️ ' : '') + ev.site;
        chip.appendChild(adName);
        if (ev.staff && ev.staff.length > 0) {
          const adBdg = document.createElement('div');
          adBdg.className = 'tt-ad-badges';
          ev.staff.forEach(sid => { const s = getStaff(sid); if (s) adBdg.appendChild(makeBadge(s)); });
          chip.appendChild(adBdg);
        }
        chip.addEventListener('click', e => { e.stopPropagation(); if (!ev.isExternal) openEventModal(ev.id); });
        cell.appendChild(chip);
      });
      alldayArea.appendChild(cell);
    });
    alldayRow.appendChild(alldayArea);
    wrap.appendChild(alldayRow);

    // ---- スクロールエリア ----
    const scrollArea = document.createElement('div'); scrollArea.className = 'tt-scroll-area';

    // 時間列
    const timeCol = document.createElement('div'); timeCol.className = 'tt-time-col';
    // 曜日ヘッダー（tt-day-hdr）の高さ分スペーサーを追加してラベル位置を合わせる
    const ttHdrSpacer = document.createElement('div');
    ttHdrSpacer.style.height = TT_H_PX + 'px';
    timeCol.appendChild(ttHdrSpacer);
    for (let h = TT_START_H; h <= TT_END_H; h++) {
      const lbl = document.createElement('div'); lbl.className = 'tt-hour-label';
      lbl.textContent = `${h}:00`; timeCol.appendChild(lbl);
    }
    // 24:00 終端ラベル（グリッド底端に表示）
    const endLbl = document.createElement('div');
    endLbl.className = 'tt-hour-label';
    endLbl.style.height = '0';
    endLbl.style.overflow = 'visible';
    endLbl.style.borderBottom = 'none';
    endLbl.textContent = '24:00';
    timeCol.appendChild(endLbl);
    scrollArea.appendChild(timeCol);

    // 日付列コンテナ
    const daysArea = document.createElement('div'); daysArea.className = 'tt-days-area';
    const totalHours = TT_END_H - TT_START_H + 1;

    dates.forEach((d, idx) => {
      const dateStr = dateStrs[idx];
      const dow = d.getDay();
      const isToday = dateStr === todayStr();
      const col = document.createElement('div'); col.className = 'tt-day-col';

      // ヘッダー
      const hdr = document.createElement('div');
      const isHolidayHdr = holidaySet.has(dateStr) && dow !== 6; // 土曜は青を優先し祝日装飾を適用しない
      hdr.className = 'tt-day-hdr' + (isToday?' tt-today':'') + (dow===0?' tt-sun':dow===6?' tt-sat':'') + (isHolidayHdr?' tt-holiday':'');
      hdr.innerHTML = `<div class="tt-ddow">${DAYS[dow]}</div><div class="tt-dnum">${d.getDate()}</div>`;
      col.appendChild(hdr);

      // グリッド
      const grid = document.createElement('div'); grid.className = 'tt-grid';
      grid.style.height = (totalHours * TT_H_PX) + 'px';
      for (let h = TT_START_H; h <= TT_END_H; h++) {
        const slot = document.createElement('div'); slot.className = 'tt-hslot'; grid.appendChild(slot);
      }

      // イベントレイヤー
      const evLayer = document.createElement('div'); evLayer.className = 'tt-ev-layer';
      evLayer.style.height = (totalHours * TT_H_PX) + 'px';

      const dayEvs = eventsOnDate(dateStr).filter(ev => ev.startTime);
      // 重なり処理（同じ時間帯のイベントを横に並べる）
      const sorted = [...dayEvs].sort((a, b) => (a.startTime||'').localeCompare(b.startTime||''));
      const cols_layout = [];
      const gridBottom = totalHours * TT_H_PX;
      sorted.forEach(ev => {
        // 複数日イベントの日またぎ対応
        const isMultiDay  = ev.endDate && ev.endDate !== ev.startDate;
        const isStartDate = ev.startDate === dateStr;
        const isEndDate   = (ev.endDate || ev.startDate) === dateStr;

        let y1, y2;
        if (isMultiDay && isStartDate && !isEndDate) {
          // 開始日：startTimeからグリッド底まで延伸
          y1 = timeToY(ev.startTime) || 0;
          y2 = gridBottom;
        } else if (isMultiDay && !isStartDate && isEndDate) {
          // 終了日：グリッド頭からendTimeまで。endTimeがTT_START_H以前なら非表示
          const ey = ev.endTime ? timeToY(ev.endTime) : null;
          if (ey === null || ey <= 0) return; // グリッド外なのでスキップ
          y1 = 0;
          y2 = ey;
        } else if (isMultiDay && !isStartDate && !isEndDate) {
          // 中間日：グリッド全体を埋める
          y1 = 0;
          y2 = gridBottom;
        } else {
          // 単一日：従来通り
          y1 = timeToY(ev.startTime) || 0;
          const et = getEndTime(ev) || ev.startTime;
          y2 = (timeToY(et) || y1) || (y1 + TT_H_PX);
        }

        let placed = false;
        for (let ci = 0; ci < cols_layout.length; ci++) {
          const last = cols_layout[ci][cols_layout[ci].length-1];
          const ly2 = last._y2;
          if (y1 >= ly2) { cols_layout[ci].push({...ev, _y1:y1, _y2:Math.max(y2, y1+20), _dateStr:dateStr}); placed=true; break; }
        }
        if (!placed) cols_layout.push([{...ev, _y1:y1, _y2:Math.max(y2, y1+20), _dateStr:dateStr}]);
      });

      const totalCols = cols_layout.length || 1;
      cols_layout.forEach((col_evs, ci) => {
        const w = (1/totalCols * 100).toFixed(1) + '%';
        const left = (ci/totalCols * 100).toFixed(1) + '%';
        col_evs.forEach(ev => {
          const height = Math.max(ev._y2 - ev._y1, 20);
          const _evDl = isDeadline(ev);
          const evEl = document.createElement('div');
          evEl.className = 'tt-ev' + (ev.isExternal?' ext':(isTokyoBranch(ev)?' tokyo':(_evDl?' deadline':'')));
          evEl.style.top    = ev._y1 + 'px';
          evEl.style.height = height + 'px';
          evEl.style.left   = `calc(${left} + 2px)`;
          evEl.style.width  = `calc(${w} - 4px)`;
          if (!ev.isExternal) {
            const _cl = _evDl ? '--dl-color' : (isCorp(ev) ? '--ce-color' : '--ev-color');
            const _bg = _evDl ? '--dl-bg'    : (isCorp(ev) ? '--ce-bg'    : '--ev-bg');
            evEl.style.background = `var(${_bg})`;
            evEl.style.borderLeft = `3px solid var(${_cl})`;
            evEl.style.color      = `var(${_cl})`;
          }
          const et = getEndTime(ev) || ev.startTime;
          // 複数日イベントの時間ラベル（開始日/終了日/中間日で表示切り替え）
          const _isMultiDay  = ev.endDate && ev.endDate !== ev.startDate;
          const _isStartDate = ev.startDate === ev._dateStr;
          const _isEndDate   = (ev.endDate || ev.startDate) === ev._dateStr;
          const _isNextDayEnd = _isMultiDay && ev.endTime && ev.endTime < ev.startTime;
          let timeLabel;
          if (_isMultiDay && _isStartDate && !_isEndDate) {
            timeLabel = `${ev.startTime}〜翌→`;
          } else if (_isMultiDay && !_isStartDate && _isEndDate) {
            timeLabel = `→〜${et}`;
          } else if (_isMultiDay && !_isStartDate && !_isEndDate) {
            timeLabel = '(終日)';
          } else {
            const endSuffix = _isNextDayEnd ? '翌' : '';
            timeLabel = `${ev.startTime}〜${endSuffix}${et}`;
          }
          let html = `<div class="tt-ev-name">${_evDl ? '⚠️ ' : ''}${ev.site}</div>`;
          html += `<div class="tt-ev-time">${ev.isExternal ? extLeaveLabel(ev) + ' ' : ''}${timeLabel}</div>`;
          evEl.innerHTML = html;
          if (height > 40) {
            const bdg = document.createElement('div'); bdg.className = 'tt-ev-bdg';
            ev.staff.forEach(sid => { const s = getStaff(sid); if (s) bdg.appendChild(makeBadge(s)); });
            evEl.appendChild(bdg);
          }
          evEl.addEventListener('mouseenter', function(e){ window._scShowTip && window._scShowTip(ev, e); });
          evEl.addEventListener('mouseleave', function(){ window._scHideTip && window._scHideTip(); });
          evEl.addEventListener('click', e => { e.stopPropagation(); if (!ev.isExternal) openEventModal(ev.id); });
          evLayer.appendChild(evEl);
        });
      });

      // 現在時刻ライン
      if (isToday) {
        const now = new Date();
        const y = timeToY(`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`);
        if (y !== null && y >= 0 && y <= totalHours * TT_H_PX) {
          const line = document.createElement('div'); line.className = 'tt-now-line';
          line.style.top = y + 'px'; evLayer.appendChild(line);
        }
      }

      grid.appendChild(evLayer);
      col.appendChild(grid);
      daysArea.appendChild(col);
    });

    scrollArea.appendChild(daysArea);
    wrap.appendChild(scrollArea);
    main.appendChild(wrap);

    // 現在時刻にスクロール
    setTimeout(() => {
      const now = new Date();
      const y = timeToY(`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`);
      if (y !== null) scrollArea.scrollTop = Math.max(0, y - 100);
    }, 50);
  }

  /* ====================================================================
   * MONTHLY CALENDAR
   * ==================================================================== */
  function renderMonthly() {
    const main = document.getElementById('sc-mainArea');
    if (!main) return;
    main.innerHTML = '';
    const grid = document.createElement('div'); grid.className = 'cal-grid';
    DAYS.forEach((d, i) => {
      const h = document.createElement('div');
      h.className = `cal-dow${i === 0 ? ' sun' : i === 6 ? ' sat' : ''}`;
      h.textContent = d; grid.appendChild(h);
    });
    const firstDay    = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const daysInPrev  = new Date(currentYear, currentMonth, 0).getDate();
    const totalCells  = Math.ceil((firstDay + daysInMonth) / 7) * 7;
    for (let i = 0; i < totalCells; i++) {
      let y, m, d, inMonth;
      if (i < firstDay) {
        m = currentMonth === 0 ? 11 : currentMonth - 1;
        y = currentMonth === 0 ? currentYear - 1 : currentYear;
        d = daysInPrev - firstDay + i + 1; inMonth = false;
      } else if (i < firstDay + daysInMonth) {
        d = i - firstDay + 1; m = currentMonth; y = currentYear; inMonth = true;
      } else {
        d = i - firstDay - daysInMonth + 1;
        m = currentMonth === 11 ? 0 : currentMonth + 1;
        y = currentMonth === 11 ? currentYear + 1 : currentYear;
        inMonth = false;
      }
      const dateStr = toDateStr(y, m, d), dow = i % 7, isTodayCell = dateStr === todayStr();
      const cell = document.createElement('div');
      const isHolidayCell = holidaySet.has(dateStr) && dow !== 6; // 土曜は青を優先し祝日装飾を適用しない
      cell.className = `cal-cell${!inMonth?' other-month':''}${isTodayCell?' today':''}${dow===0?' sun-cell':dow===6?' sat-cell':''}${isHolidayCell?' holiday-cell':''}`;
      cell.dataset.date = dateStr;
      const dn = document.createElement('div'); dn.className = 'date-num'; dn.textContent = d; cell.appendChild(dn);
      const evWrap = document.createElement('div'); evWrap.className = 'cell-events';
      eventsOnDate(dateStr).sort((a, b) => (a.startTime || '').localeCompare(b.startTime || '')).forEach(ev => {
        const chip = makeEventChip(ev, dateStr);
        if (!isTouch) {
          chip.addEventListener('dragover',  e => { e.preventDefault(); e.stopPropagation(); chip.classList.add('drop-target'); });
          chip.addEventListener('dragleave', () => chip.classList.remove('drop-target'));
          chip.addEventListener('drop',      e => { e.preventDefault(); e.stopPropagation(); chip.classList.remove('drop-target'); onChipDrop(ev.id); });
        }
        if (!isTouch) {
          chip.addEventListener('mouseenter', function(e){ window._scShowTip && window._scShowTip(ev, e); });
          chip.addEventListener('mouseleave', function(){ window._scHideTip && window._scHideTip(); });
        }
        chip.addEventListener('click', e => {
          e.stopPropagation();
          if (isTouch && touchSelectedStaffId) { onChipTouchClick(ev.id); return; }
          openEventModal(ev.id);
        });
        evWrap.appendChild(chip);
      });
      cell.appendChild(evWrap);
      if (!isTouch) {
        cell.addEventListener('dragover',  onCellDragOver);
        cell.addEventListener('dragleave', onCellDragLeave);
        cell.addEventListener('drop',      onCellDrop);
      } else {
        cell.addEventListener('click', () => { if (touchSelectedStaffId) onCellTouchClick(dateStr); });
      }
      grid.appendChild(cell);
    }
    main.appendChild(grid);
  }

  /* ====================================================================
   * DAILY LIST VIEW
   * ==================================================================== */

  /* 1ヶ月分の日付行を wrap に追加するヘルパー（renderDaily / 追記両用） */
  function appendMonthToDailyWrap(wrap, y, m) {
    const sep = document.createElement('div');
    sep.className = `month-separator${(y===currentYear && m===currentMonth) ? ' current-month' : ''}`;
    sep.textContent = `${y}年 ${m + 1}月`;
    wrap.appendChild(sep);

    const dim = new Date(y, m + 1, 0).getDate();
    for (let d = 1; d <= dim; d++) {
      const dateStr = toDateStr(y, m, d);
      const dow = new Date(dateStr + 'T00:00:00').getDay();
      const isTodayRow = dateStr === todayStr();
      const row = document.createElement('div');
      const isHolidayRow = holidaySet.has(dateStr) && dow !== 6; // 土曜は青を優先し祝日装飾を適用しない
      row.className = `day-row${dow===0?' sun-row':dow===6?' sat-row':''}${isTodayRow?' today-row':''}${isHolidayRow?' holiday-row':''}`;
      row.dataset.date = dateStr;

      const lbl = document.createElement('div'); lbl.className = 'day-label';
      lbl.innerHTML = `<div class="dl-num">${d}</div><div class="dl-dow">${DAYS[dow]}</div>`;
      row.appendChild(lbl);

      const evArea = document.createElement('div'); evArea.className = 'day-events'; evArea.style.flexDirection = 'column';
      const dayEvs = eventsOnDate(dateStr).sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));

      if (dayEvs.length === 0) {
        const emp = document.createElement('div'); emp.className = 'day-empty'; emp.textContent = '予定なし'; evArea.appendChild(emp);
      } else {
        const cardRow = document.createElement('div'); cardRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;width:100%;';
        dayEvs.forEach(ev => {
          const first = isFirstDay(ev, dateStr);
          const corp  = isCorp(ev);
          const deadline = isDeadline(ev);
          const card  = document.createElement('div');
          card.className = `day-event-card${corp?' corp':''}${deadline?' deadline':''}${ev.isExternal?' ext':(isTokyoBranch(ev)?' tokyo':'')}${first?'':' cont'}`;
          let html = `<div class="dec-name">${first?makeEvIcon(ev):'⟶'} ${ev.site}`;
          if (first && ev.endDate && ev.endDate !== ev.startDate) html += ` 〜${ev.endDate.slice(5)}`;
          html += '</div>';
          if (first && ev.startTime) html += `<div class="dec-time">${evTimeLabel(ev)}</div>`;
          card.innerHTML = html;
          const bd = document.createElement('div'); bd.className = 'dec-badges';
          ev.staff.forEach(sid => { const s = getStaff(sid); if (s) bd.appendChild(makeBadge(s)); });
          card.appendChild(bd);
          if (!isTouch) {
            card.addEventListener('dragover',  e => { e.preventDefault(); e.stopPropagation(); card.classList.add('drop-target'); });
            card.addEventListener('dragleave', () => card.classList.remove('drop-target'));
            card.addEventListener('drop',      e => { e.preventDefault(); e.stopPropagation(); card.classList.remove('drop-target'); onChipDrop(ev.id); });
          }
          if (!isTouch) {
            card.addEventListener('mouseenter', function(e){ window._scShowTip && window._scShowTip(ev, e); });
            card.addEventListener('mouseleave', function(){ window._scHideTip && window._scHideTip(); });
          }
          card.addEventListener('click', e => {
            e.stopPropagation();
            if (isTouch && touchSelectedStaffId) { onChipTouchClick(ev.id); return; }
            openEventModal(ev.id);
          });
          cardRow.appendChild(card);
        });
        evArea.appendChild(cardRow);
      }
      row.appendChild(evArea);
      if (!isTouch) {
        row.addEventListener('dragover',  onCellDragOver);
        row.addEventListener('dragleave', onCellDragLeave);
        row.addEventListener('drop',      onCellDrop);
      } else {
        row.addEventListener('click', () => { if (touchSelectedStaffId) onCellTouchClick(dateStr); });
      }
      wrap.appendChild(row);
    }
  }

  /* センチネルを wrap 末尾に設置し、IntersectionObserver で翌月を追記する */
  function attachDailySentinel(main, wrap) {
    if (typeof IntersectionObserver === 'undefined') return;
    const sentinel = document.createElement('div');
    sentinel.style.cssText = 'height:2px;width:100%;';
    wrap.appendChild(sentinel);

    const obs = new IntersectionObserver(async (entries) => {
      if (!entries[0].isIntersecting || isLoadingRange) return;
      obs.disconnect();
      sentinel.remove();

      dailyRenderEndOffset++;
      const next = shiftMonthBy(currentYear, currentMonth, dailyRenderEndOffset);
      if (!isMonthLoaded(next.y, next.m)) {
        await loadMonthRange(next.y, next.m, next.y, next.m);
      }
      // DOM に追記するだけ（スクロール位置は変わらない）
      appendMonthToDailyWrap(wrap, next.y, next.m);
      attachDailySentinel(main, wrap); // 次の末尾にセンチネルを再設置
    }, { root: main, threshold: 0 });

    obs.observe(sentinel);
  }

  function renderDaily() {
    const main = document.getElementById('sc-mainArea');
    if (!main) return;
    main.innerHTML = '';
    const wrap = document.createElement('div'); wrap.className = 'daily-view';

    for (let offset = -1; offset <= dailyRenderEndOffset; offset++) {
      const shifted = shiftMonthBy(currentYear, currentMonth, offset);
      appendMonthToDailyWrap(wrap, shifted.y, shifted.m);
    }

    attachDailySentinel(main, wrap);
    main.appendChild(wrap);

    // 今日の行にスクロール
    setTimeout(() => {
      const target = wrap.querySelector('.today-row') || wrap.querySelector(`[data-date="${toDateStr(currentYear, currentMonth, 1)}"]`);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }

  /* ====================================================================
   * DRAG & DROP
   * ==================================================================== */
  function onBadgeDragStart(e) {
    dragData = { type: 'staff', staffId: parseInt(this.dataset.staffId) };
    this.classList.add('dragging'); e.dataTransfer.effectAllowed = 'copy';
  }
  function onBadgeDragEnd() { document.querySelectorAll('.badge.dragging').forEach(b => b.classList.remove('dragging')); }
  function onCellDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; this.classList.add('drag-over'); }
  function onCellDragLeave() { this.classList.remove('drag-over'); }
  function onCellDrop(e) {
    e.preventDefault(); this.classList.remove('drag-over');
    if (!dragData) return;
    if (dragData.type === 'staff') openQuickModal(dragData.staffId, this.dataset.date);
    dragData = null;
  }
  async function onChipDrop(eventId) {
    if (!dragData || dragData.type !== 'staff') return;
    const ev = events.find(e => e.id === eventId); if (!ev) return;
    const s = getStaff(dragData.staffId);
    if (!ev.staff.includes(dragData.staffId)) {
      ev.staff.push(dragData.staffId);
      showToast(`✅ ${s ? s.name : ''}を「${ev.site}」に追加しました`);
      renderMain();
      try {
        setSyncStatus('busy', '同期中...');
        await updateKintone(ev);
        setSyncStatus('ok', `同期済み ${new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`);
      } catch (err) { setSyncStatus('err', `更新失敗: ${err.message}`); showToast('⚠️ kintoneの更新に失敗しました'); }
    } else {
      showToast(`ℹ️ ${s ? s.name : ''}はすでに登録されています`);
    }
    dragData = null;
  }

  /* ====================================================================
   * QUICK MODAL
   * ==================================================================== */
  function openQuickModal(staffId, targetDate) {
    const s = getStaff(staffId); if (!s) return;
    pendingDrop = { staffId, targetDate };
    const bspan = document.getElementById('sc-quickStaffBadge');
    bspan.innerHTML = ''; bspan.appendChild(makeBadge(s));
    document.getElementById('sc-quickDateDisplay').textContent = `📅 ${targetDate}`;
    document.getElementById('sc-quickSiteName').value = '';
    document.getElementById('sc-quickEndDate').value  = targetDate;
    document.getElementById('sc-quickTime').value     = '';
    document.getElementById('sc-quickEndTime').value  = '';
    document.getElementById('sc-quickNotes').value    = '';
    document.getElementById('sc-quickType').value     = '工事現場';
    buildCheckboxGrid('sc-quickCbGrid', []);
    const cb = document.querySelector(`#sc-quickCbGrid input[value="${staffId}"]`);
    if (cb) { cb.checked = true; cb.disabled = true; cb.parentElement.style.opacity = '.6'; }
    document.getElementById('sc-quickModal').classList.add('open');
    setTimeout(() => document.getElementById('sc-quickSiteName').focus(), 80);
  }
  function closeQuickModal() { document.getElementById('sc-quickModal').classList.remove('open'); pendingDrop = null; }

  /* ====================================================================
   * EVENT EDIT MODAL
   * ==================================================================== */
  function openEventModal(eventId) {
    const ev = events.find(e => e.id === eventId); if (!ev) return;
    modalEventId = eventId;
    const endLabel = ev.endDate && ev.endDate !== ev.startDate ? ` 〜 ${ev.endDate}` : '';
    document.getElementById('sc-modalDateDisplay').textContent = `📅 ${ev.startDate}${endLabel}`;
    document.getElementById('sc-modalSiteInput').value = ev.site;
    document.getElementById('sc-modalStartDate').value = ev.startDate;
    document.getElementById('sc-modalEndDate').value   = ev.endDate || ev.startDate;
    document.getElementById('sc-modalTimeInput').value    = ev.startTime || '';
    document.getElementById('sc-modalEndTimeInput').value = ev.endTime   || '';
    document.getElementById('sc-modalNotes').value        = ev.notes     || '';
    document.getElementById('sc-modalType').value      = ev.type || '工事現場';
    buildCheckboxGrid('sc-modalCbGrid', ev.staff);
    // VIEWER MODE: 閲覧専用の表示要素を更新
    if (VIEWER_MODE) {
      const typeMap = { '工事現場': '🔧 工事現場', '会社行事': '🏢 会社行事', '期日管理': '⚠️ 期日管理' };
      const vType = document.getElementById('sc-viewerType');
      if (vType) vType.textContent = typeMap[ev.type || '工事現場'] || ev.type || '';
      const vSite = document.getElementById('sc-viewerSite');
      if (vSite) vSite.textContent = ev.site || '';
      const vTime = document.getElementById('sc-viewerTime');
      if (vTime) {
        if (ev.startTime) {
          let t = ev.startTime;
          if (ev.endTime) {
            const _vNextDay = ev.endDate && ev.endDate !== ev.startDate && ev.endTime < ev.startTime;
            t += ' 〜 ' + (_vNextDay ? '翌' : '') + ev.endTime;
          }
          vTime.textContent = t;
        } else {
          vTime.textContent = '時間指定なし';
        }
      }
      const vStaff = document.getElementById('sc-viewerStaff');
      if (vStaff) {
        if (ev.staff && ev.staff.length > 0) {
          vStaff.innerHTML = ev.staff.map(function(sid) {
            const s = getStaff(sid);
            if (!s) return '';
            const safeName = String(s.name).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            return '<span class="badge" style="background:' + s.color + ';color:#fff;">' + safeName + '</span>';
          }).join('');
        } else {
          vStaff.textContent = '（なし）';
        }
      }
      const vNotes = document.getElementById('sc-viewerNotes');
      if (vNotes) vNotes.textContent = ev.notes || '（備考なし）';
    }
    document.getElementById('sc-saveFb').classList.remove('show');
    // ボタンのdisabled状態を必ずリセット（前回の保存成功後に残る場合があるため）
    ['sc-btnEventSave','sc-btnEventClose','sc-btnEventDelete'].forEach(function(id){
      var b = document.getElementById(id); if (b) b.disabled = false;
    });
    const canDelete = (loginUser.code === 'master') || (ev.creatorCode && ev.creatorCode === loginUser.code);
    document.getElementById('sc-btnEventDelete').style.display = canDelete ? '' : 'none';
    document.getElementById('sc-eventModal').classList.add('open');
  }
  function closeEventModal() { document.getElementById('sc-eventModal').classList.remove('open'); modalEventId = null; }

  /* ====================================================================
   * COLOR PALETTE
   * ==================================================================== */
  function renderColorPalette() {
    const pal = document.getElementById('sc-colorPalette'); if (!pal) return;
    pal.innerHTML = '';
    COLOR_PALETTE.forEach(color => {
      const sw = document.createElement('div');
      sw.className = `sc-swatch${color === selectedColor ? ' selected' : ''}`;
      sw.style.background = color;
      sw.addEventListener('click', () => {
        selectedColor = color;
        document.querySelectorAll('.sc-swatch').forEach(s => s.classList.remove('selected'));
        sw.classList.add('selected');
      });
      pal.appendChild(sw);
    });
  }

  /* ====================================================================
   * STAFF MANAGEMENT
   * ==================================================================== */
  function renderStaffList() {
    const list = document.getElementById('sc-staffListMgmt'); if (!list) return;
    list.innerHTML = '';
    STAFF.forEach(s => {
      const item = document.createElement('div'); item.className = 'sc-staff-item';
      const badge = makeBadge(s); badge.style.cursor = 'default'; badge.style.minWidth = '46px'; badge.style.textAlign = 'center';
      const ni = document.createElement('input'); ni.type = 'text'; ni.className = 'sc-staff-name-edit'; ni.value = s.name;
      ni.addEventListener('change', () => { s.name = ni.value.trim() || s.name; badge.textContent = s.name; renderStaffPool(); renderCheckboxGrid(); renderMain(); });
      const ot = document.createElement('span'); ot.className = 'sc-org-tag'; ot.textContent = s.org;
      const db = document.createElement('button'); db.className = 'btn-sc-icon'; db.textContent = '🗑'; db.title = '削除';
      db.addEventListener('click', () => {
        if (!confirm(`「${s.name}」を削除しますか？`)) return;
        STAFF = STAFF.filter(x => x.id !== s.id);
        events.forEach(ev => { ev.staff = ev.staff.filter(id => id !== s.id); });
        renderStaffList(); renderOrgFilter(); renderPersonalFilter(); renderStaffPool(); renderCheckboxGrid(); renderMain();
      });
      item.appendChild(badge); item.appendChild(ni); item.appendChild(ot); item.appendChild(db);
      list.appendChild(item);
    });
  }

  /* ====================================================================
   * AUTO REFRESH
   * ==================================================================== */
  function startRefresh() {
    refreshOn = true;
    const btn = document.getElementById('sc-btnRefresh');
    if (btn) { btn.textContent = 'AUTO ON'; btn.classList.add('on'); }
    refreshSeconds = parseInt(document.getElementById('sc-refreshInterval').value);
    refreshTimer = setInterval(() => {
      refreshSeconds--;
      const cd = document.getElementById('sc-refreshCountdown');
      if (cd) cd.textContent = refreshSeconds + 's';
      if (refreshSeconds <= 0) { refreshSeconds = parseInt(document.getElementById('sc-refreshInterval').value); loadFromKintone(); }
    }, 1000);
  }
  function stopRefresh() {
    refreshOn = false; clearInterval(refreshTimer);
    const btn = document.getElementById('sc-btnRefresh');
    if (btn) { btn.textContent = 'AUTO OFF'; btn.classList.remove('on'); }
    const cd = document.getElementById('sc-refreshCountdown');
    if (cd) cd.textContent = '';
  }

  /* ====================================================================
   * INIT
   * ==================================================================== */
  function initScheduleApp() {
    if (document.getElementById("sc-tooltip") === null) { var _t=document.createElement("div"); _t.id="sc-tooltip"; document.getElementById("schedule-root").appendChild(_t); }
    const _now = getToday();
    currentYear  = _now.getFullYear();
    currentMonth = _now.getMonth();

    document.getElementById('sc-formStartDate').value = todayStr();
    document.getElementById('sc-formEndDate').value   = '';

    // テーマ適用
    applyTheme(currentTheme);

    // masterのみメンバー管理ボタン
    if (loginUser.code === 'master') document.getElementById('sc-btnStaffMgmt').style.display = '';

    /* テーマ・全画面・表示漏れチェックボタン */
    document.getElementById('sc-btnTheme').addEventListener('click', toggleTheme);
    document.getElementById('sc-btnFullscreen').addEventListener('click', toggleFullscreen);
    document.getElementById('sc-btnVerify').addEventListener('click', () => {
      verifyCurrentView().catch(e => console.error('[verify]', e));
    });

    /* サイドバー（登録エリア）開閉
       モバイル／タッチ環境（大型タッチディスプレイ含む）では左からのスライドドロワーになる */
    function openSidebarDrawer() {
      document.getElementById('sc-sidebar').classList.add('sidebar-open');
      const overlay = document.getElementById('sc-sidebarOverlay');
      if (overlay) overlay.classList.add('open');
      const tab = document.getElementById('sc-btnSidebarTab');
      if (tab) tab.classList.add('hide');
    }
    function closeSidebarDrawer() {
      document.getElementById('sc-sidebar').classList.remove('sidebar-open');
      const overlay = document.getElementById('sc-sidebarOverlay');
      if (overlay) overlay.classList.remove('open');
      const tab = document.getElementById('sc-btnSidebarTab');
      if (tab) tab.classList.remove('hide');
    }
    document.getElementById('sc-btnSidebarToggle').addEventListener('click', function () {
      const sidebar = document.getElementById('sc-sidebar');
      if (sidebar.classList.contains('sidebar-open')) closeSidebarDrawer(); else openSidebarDrawer();
    });
    const sidebarTabEl = document.getElementById('sc-btnSidebarTab');
    if (sidebarTabEl) sidebarTabEl.addEventListener('click', openSidebarDrawer);
    const sidebarOverlayEl = document.getElementById('sc-sidebarOverlay');
    if (sidebarOverlayEl) sidebarOverlayEl.addEventListener('click', closeSidebarDrawer);

    /* モバイル環境（タッチ）では最初から閉じた状態（左端タブをタップして開く） */
    if (isTouch || window.innerWidth <= 760) {
      closeSidebarDrawer();
    } else {
      openSidebarDrawer();
    }

    /* 月切り替え（未ロード月は自動追加ロード） */
    document.getElementById('sc-btnPrev').addEventListener('click', async () => {
      if (currentView === 'week') {
        currentWeekStart = currentWeekStart || getWeekStart(getToday());
        currentWeekStart.setDate(currentWeekStart.getDate() - 7);
      } else {
        currentMonth--;
        if (currentMonth < 0) { currentMonth = 11; currentYear--; }
        dailyRenderEndOffset = 1; // 日別ビューの拡張リセット
      }
      await navigateAndRender();
    });
    document.getElementById('sc-btnNext').addEventListener('click', async () => {
      if (currentView === 'week') {
        currentWeekStart = currentWeekStart || getWeekStart(getToday());
        currentWeekStart.setDate(currentWeekStart.getDate() + 7);
      } else {
        currentMonth++;
        if (currentMonth > 11) { currentMonth = 0; currentYear++; }
        dailyRenderEndOffset = 1; // 日別ビューの拡張リセット
      }
      await navigateAndRender();
    });
    document.getElementById('sc-btnToday').addEventListener('click', async () => {
      const _t = getToday();
      if (currentView === 'week') { currentWeekStart = getWeekStart(_t); }
      else { currentYear = _t.getFullYear(); currentMonth = _t.getMonth(); dailyRenderEndOffset = 1; }
      await navigateAndRender();
    });

    /* ビュー切り替え */
    document.getElementById('sc-btnViewMonth').addEventListener('click', async () => {
      currentView = 'month';
      document.getElementById('sc-btnViewMonth').classList.add('active');
      document.getElementById('sc-btnViewDay').classList.remove('active');
      document.getElementById('sc-btnViewWeek').classList.remove('active');
      await navigateAndRender();
    });
    document.getElementById('sc-btnViewDay').addEventListener('click', async () => {
      currentView = 'day';
      dailyRenderEndOffset = 1;
      document.getElementById('sc-btnViewDay').classList.add('active');
      document.getElementById('sc-btnViewMonth').classList.remove('active');
      document.getElementById('sc-btnViewWeek').classList.remove('active');
      await navigateAndRender();
    });

    document.getElementById('sc-btnViewWeek').addEventListener('click', async () => {
      currentView = 'week';
      currentWeekStart = getWeekStart(getToday());
      document.getElementById('sc-btnViewWeek').classList.add('active');
      document.getElementById('sc-btnViewMonth').classList.remove('active');
      document.getElementById('sc-btnViewDay').classList.remove('active');
      await navigateAndRender();
    });

    /* 部署フィルター */
    document.getElementById('sc-btnOrgAll').addEventListener('click', () => {
      selectedOrgs = new Set(ORGS); saveFilterState();
      renderOrgFilter(); renderStaffPool(); renderCheckboxGrid(); renderMain();
    });
    document.getElementById('sc-btnOrgNone').addEventListener('click', () => {
      selectedOrgs = new Set(); saveFilterState();
      renderOrgFilter(); renderStaffPool(); renderCheckboxGrid(); renderMain();
    });

    /* 個人フィルター */
    document.getElementById('sc-btnPersonalToggle').addEventListener('click', () => {
      personalFilterMode = !personalFilterMode;
      // ON時に社員未選択ならログインユーザーを自動選択
      if (personalFilterMode && personalFilterStaffId == null) {
        const me = getStaffByCode(loginUser.code);
        if (me) personalFilterStaffId = me.id;
      }
      savePersonalFilterState();
      renderPersonalFilter();
      renderMain();
    });
    document.getElementById('sc-personalStaffSelect').addEventListener('change', e => {
      const v = e.target.value;
      personalFilterStaffId = v === '' ? null : parseInt(v, 10);
      savePersonalFilterState();
      renderMain();
    });
    document.getElementById('sc-personalShowCorp').addEventListener('change', e => {
      personalShowCorp = e.target.checked;
      savePersonalFilterState();
      renderMain();
    });
    document.getElementById('sc-personalShowDeadline').addEventListener('change', e => {
      personalShowDeadline = e.target.checked;
      savePersonalFilterState();
      renderMain();
    });

    /* 浮遊型 個人フィルターボタン (どこからでも開ける) */
    document.getElementById('sc-personalFab').addEventListener('click', () => {
      renderPersonalFab();
      document.getElementById('sc-fabOverlay').classList.add('open');
    });
    document.getElementById('sc-fabClose').addEventListener('click', () => {
      document.getElementById('sc-fabOverlay').classList.remove('open');
    });
    document.getElementById('sc-fabDone').addEventListener('click', () => {
      document.getElementById('sc-fabOverlay').classList.remove('open');
    });
    document.getElementById('sc-fabOverlay').addEventListener('click', e => {
      if (e.target === document.getElementById('sc-fabOverlay')) {
        document.getElementById('sc-fabOverlay').classList.remove('open');
      }
    });
    document.getElementById('sc-fabModeToggle').addEventListener('click', () => {
      personalFilterMode = !personalFilterMode;
      if (personalFilterMode && personalFilterStaffId == null) {
        const me = getStaffByCode(loginUser.code);
        if (me) personalFilterStaffId = me.id;
      }
      savePersonalFilterState();
      renderPersonalFilter();
      renderMain();
    });
    document.getElementById('sc-fabStaffSelect').addEventListener('change', e => {
      const v = e.target.value;
      personalFilterStaffId = v === '' ? null : parseInt(v, 10);
      savePersonalFilterState();
      renderPersonalFilter();
      renderMain();
    });
    document.getElementById('sc-fabShowCorp').addEventListener('change', e => {
      personalShowCorp = e.target.checked;
      savePersonalFilterState();
      renderPersonalFilter();
      renderMain();
    });
    document.getElementById('sc-fabShowDeadline').addEventListener('change', e => {
      personalShowDeadline = e.target.checked;
      savePersonalFilterState();
      renderPersonalFilter();
      renderMain();
    });

    /* オートリフレッシュ */
    document.getElementById('sc-btnRefresh').addEventListener('click', () => { refreshOn ? stopRefresh() : startRefresh(); });
    document.getElementById('sc-refreshInterval').addEventListener('change', () => { if (refreshOn) { stopRefresh(); startRefresh(); } });

    /* 登録フォーム */
    document.getElementById('sc-btnRegister').addEventListener('click', async () => {
      const startDate = document.getElementById('sc-formStartDate').value;
      const endDate   = document.getElementById('sc-formEndDate').value;
      const site      = document.getElementById('sc-formSite').value.trim();
      const time      = document.getElementById('sc-formTime').value;
      const notes     = document.getElementById('sc-formNotes').value.trim();
      const type      = document.getElementById('sc-formType').value;
      if (!startDate) { alert('開始日を入力してください'); return; }
      if (!site)      { alert('名称を入力してください'); return; }
      if (endDate && endDate < startDate) { alert('終了日は開始日以降にしてください'); return; }
      const staff = [...document.querySelectorAll('#sc-checkboxGrid input:checked')].map(cb => parseInt(cb.value));
      const btn = document.getElementById('sc-btnRegister'); btn.disabled = true; btn.textContent = '保存中...';
      const cs = getStaffByCode(loginUser.code);
      const ev = { id: eventIdCounter++, kintoneId: null, startDate, endDate: endDate || startDate, site, startTime: time || '', staff, notes, type, creatorCode: loginUser.code, creatorOrg: cs ? cs.org : '' };
      events.push(ev);
      const d = new Date(startDate + 'T00:00:00');
      if (d.getFullYear() !== currentYear || d.getMonth() !== currentMonth) { currentYear = d.getFullYear(); currentMonth = d.getMonth(); }
      document.getElementById('sc-formSite').value    = '';
      document.getElementById('sc-formTime').value    = '';
      document.getElementById('sc-formEndTime').value = '';
      document.getElementById('sc-formEndDate').value = '';
      document.getElementById('sc-formNotes').value   = '';
      document.getElementById('sc-formType').value    = '工事現場';
      document.querySelectorAll('#sc-checkboxGrid input').forEach(cb => cb.checked = false);
      renderMain();
      try {
        setSyncStatus('busy', '同期中...');
        await saveToKintone(ev);
        setSyncStatus('ok', `同期済み ${new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`);
        showToast(`✅「${site}」をkintoneに保存しました`);
      } catch (err) { setSyncStatus('err', `保存失敗: ${err.message}`); showToast('⚠️ kintoneへの保存に失敗しました'); }
      finally { btn.disabled = false; btn.textContent = '登録する'; }
    });

    /* クイック登録 */
    document.getElementById('sc-btnQuickRegister').addEventListener('click', async () => {
      if (!pendingDrop) return;
      const site = document.getElementById('sc-quickSiteName').value.trim();
      if (!site) {
        const i = document.getElementById('sc-quickSiteName'); i.focus(); i.style.borderColor = '#e74c3c';
        setTimeout(() => i.style.borderColor = '', 1500); return;
      }
      const endDate = document.getElementById('sc-quickEndDate').value || pendingDrop.targetDate;
      const time    = document.getElementById('sc-quickTime').value;
      const notes   = document.getElementById('sc-quickNotes').value.trim();
      const type    = document.getElementById('sc-quickType').value;
      let staff = [...document.querySelectorAll('#sc-quickCbGrid input:checked')].map(cb => parseInt(cb.value));
      if (!staff.includes(pendingDrop.staffId)) staff.unshift(pendingDrop.staffId);
      const cs = getStaffByCode(loginUser.code);
      const ev = { id: eventIdCounter++, kintoneId: null, startDate: pendingDrop.targetDate, endDate, site, startTime: time || '', staff, notes, type, creatorCode: loginUser.code, creatorOrg: cs ? cs.org : '' };
      events.push(ev);
      closeQuickModal(); renderMain();
      showToast(`✅「${site}」を登録しました`);
      try {
        setSyncStatus('busy', '同期中...');
        await saveToKintone(ev);
        setSyncStatus('ok', `同期済み ${new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`);
      } catch (err) { setSyncStatus('err', `保存失敗: ${err.message}`); showToast('⚠️ kintoneへの保存に失敗しました'); }
    });
    document.getElementById('sc-btnQuickCancel').addEventListener('click', closeQuickModal);
    document.getElementById('sc-quickModal').addEventListener('click', e => { if (e.target === document.getElementById('sc-quickModal')) closeQuickModal(); });
    document.getElementById('sc-quickSiteName').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('sc-btnQuickRegister').click(); });

    /* 編集モーダル - 開始日を変更した際、終了日が開始日より前のままだと
       保存時にエラーになり、カレンダーにも表示されなくなってしまうため、
       開始日を終了日より後ろにずらした場合は終了日を自動的に開始日へ合わせる */
    document.getElementById('sc-modalStartDate').addEventListener('change', () => {
      const startInput = document.getElementById('sc-modalStartDate');
      const endInput   = document.getElementById('sc-modalEndDate');
      if (startInput.value && endInput.value && endInput.value < startInput.value) {
        endInput.value = startInput.value;
      }
    });

    /* 編集モーダル - 保存後に閉じる */
    document.getElementById('sc-btnEventSave').addEventListener('click', async () => {
      if (modalEventId === null) return;
      const ev = events.find(e => e.id === modalEventId); if (!ev) return;
      const newSite  = document.getElementById('sc-modalSiteInput').value.trim();
      const newStart = document.getElementById('sc-modalStartDate').value;
      const newEnd   = document.getElementById('sc-modalEndDate').value;
      const newTime    = document.getElementById('sc-modalTimeInput').value;
      const newEndTime = document.getElementById('sc-modalEndTimeInput').value;
      const newNotes   = document.getElementById('sc-modalNotes').value.trim();
      const newType  = document.getElementById('sc-modalType').value;
      if (!newSite)  { alert('名称を入力してください'); return; }
      if (!newStart) { alert('開始日を入力してください'); return; }
      if (newEnd && newEnd < newStart) { alert('終了日は開始日以降にしてください'); return; }
      const newStaff = [...document.querySelectorAll('#sc-modalCbGrid input:checked')].map(cb => parseInt(cb.value));
      ev.site = newSite; ev.startDate = newStart; ev.endDate = newEnd || newStart;
      ev.startTime = newTime || ''; ev.endTime = newEndTime || ''; ev.staff = newStaff; ev.notes = newNotes; ev.type = newType;
      renderMain();
      const btns = ['sc-btnEventSave','sc-btnEventDelete','sc-btnEventClose'].map(id => document.getElementById(id)).filter(Boolean);
      btns.forEach(b => b.disabled = true);
      try {
        setSyncStatus('busy', '同期中...');
        await updateKintone(ev);
        setSyncStatus('ok', `同期済み ${new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`);
        showToast(`✅「${ev.site}」を更新しました`);
        closeEventModal();
      } catch (err) {
        setSyncStatus('err', `更新失敗: ${err.message}`);
        showToast('⚠️ kintoneの更新に失敗しました');
        btns.forEach(b => b.disabled = false);
      }
    });
    document.getElementById('sc-btnEventClose').addEventListener('click', closeEventModal);
    document.getElementById('sc-eventModal').addEventListener('click', e => { if (e.target === document.getElementById('sc-eventModal')) closeEventModal(); });
    document.getElementById('sc-btnEventDelete').addEventListener('click', async () => {
      if (modalEventId === null) return;
      if (!confirm('この予定を削除しますか？')) return;
      const ev = events.find(e => e.id === modalEventId);
      events = events.filter(e => e.id !== modalEventId);
      closeEventModal(); renderMain();
      if (ev && ev.kintoneId) {
        try {
          setSyncStatus('busy', '同期中...');
          await deleteFromKintone(ev.kintoneId);
          setSyncStatus('ok', `同期済み ${new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`);
        } catch (err) { setSyncStatus('err', `削除失敗: ${err.message}`); showToast('⚠️ kintoneからの削除に失敗しました'); }
      }
    });

    /* メンバー管理 */
    document.getElementById('sc-btnStaffMgmt').addEventListener('click', () => {
      renderStaffList(); renderColorPalette();
      document.getElementById('sc-newStaffName').value = '';
      document.getElementById('sc-staffModal').classList.add('open');
    });
    document.getElementById('sc-btnAddStaff').addEventListener('click', () => {
      const name = document.getElementById('sc-newStaffName').value.trim();
      if (!name) { alert('名前を入力してください'); return; }
      STAFF.push({ id: staffIdCounter++, code: '', name, org: '', color: selectedColor });
      renderStaffList(); renderPersonalFilter(); renderStaffPool(); renderCheckboxGrid(); renderMain();
      document.getElementById('sc-newStaffName').value = '';
    });
    document.getElementById('sc-btnStaffClose').addEventListener('click', () => document.getElementById('sc-staffModal').classList.remove('open'));
    document.getElementById('sc-staffModal').addEventListener('click', e => { if (e.target === document.getElementById('sc-staffModal')) document.getElementById('sc-staffModal').classList.remove('open'); });

    /* 閲覧モード時は日別ビューをデフォルトに */
    if (VIEWER_MODE) {
      currentView = 'day';
      document.getElementById('sc-btnViewDay').classList.add('active');
      document.getElementById('sc-btnViewMonth').classList.remove('active');
      document.getElementById('sc-btnViewWeek').classList.remove('active');
    }

    /* 拡大縮小コントロール初期化（閲覧専用ページに加え、kintoneを直接スマホ/タッチ判定環境で開いた場合も有効） */
    initViewerZoom();

    /* 初期描画 */
    renderOrgFilter();
    renderPersonalFilter();
    renderStaffPool();
    renderCheckboxGrid();
    loadFromKintone(); // renderMain() は loadFromKintone 完了後に実行される
  }

  /* ====================================================================
   * kintone イベントハンドラー
   * ==================================================================== */
  kintone.events.on('app.record.index.show', function (event) {
    var root = document.getElementById('schedule-root');
    if (!root || root.dataset.initialized === 'true') return event;
    root.dataset.initialized = 'true';

    if (!document.getElementById('schedule-custom-style')) {
      var style = document.createElement('style');
      style.id = 'schedule-custom-style';
      style.textContent = SCHEDULE_CSS;
      document.head.appendChild(style);
    }

    root.innerHTML = SCHEDULE_HTML;
    if (VIEWER_MODE) {
      root.classList.add('viewer-mode');
      // ドラッグ操作を全面無効化
      root.addEventListener('dragstart', function (e) { e.preventDefault(); }, true);
    }
    initScheduleApp();

    return event;
  });

})();

