// Minimal, fast, dependency-free CSS. System fonts, readable measure, works in
// light and dark. No web fonts, no JS.
export const STYLES = `:root{--fg:#1a1a1a;--muted:#5a5a5a;--bg:#fdfdfc;--accent:#7a2f3a;--card:#fff;--line:#e6e3de;--btn:#7a2f3a;--btn-fg:#fff}
@media (prefers-color-scheme:dark){:root{--fg:#ececec;--muted:#a8a8a8;--bg:#141414;--accent:#e88b98;--card:#1d1d1d;--line:#2c2c2c;--btn:#e88b98;--btn-fg:#1a1a1a}}
*{box-sizing:border-box}
html{font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
body{margin:0;color:var(--fg);background:var(--bg)}
main{max-width:760px;margin:0 auto;padding:1rem 1.1rem 3rem}
a{color:var(--accent)}
h1{font-size:1.9rem;line-height:1.2;margin:.4rem 0}
h2{font-size:1.3rem;margin:1.6rem 0 .4rem}
h3{font-size:1.05rem;margin:1rem 0 .3rem}
.site-header{display:flex;justify-content:space-between;align-items:center;gap:1rem;max-width:760px;margin:0 auto;padding:.8rem 1.1rem;border-bottom:1px solid var(--line)}
.site-header .brand{font-weight:700;text-decoration:none;color:var(--fg)}
.site-header nav a{margin-left:.8rem;font-size:.9rem}
.breadcrumb{font-size:.82rem;color:var(--muted);margin:.2rem 0 .6rem}
.affiliate-disclosure{font-size:.82rem;color:var(--muted);background:transparent;border-left:3px solid var(--line);padding:.3rem .6rem;margin:.6rem 0}
.answer-summary{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:.9rem 1rem;margin:1rem 0;font-size:1.05rem}
.intro{color:var(--muted)}
.updated{font-size:.8rem;color:var(--muted);margin:.2rem 0}
.pick{border-top:1px solid var(--line);padding:1rem 0}
.pick .rank{color:var(--accent);font-weight:700}
.pick .by{font-weight:400;color:var(--muted);font-size:.95rem}
.pick-meta{font-size:.82rem;color:var(--muted);margin:.1rem 0 .5rem;text-transform:uppercase;letter-spacing:.03em}
.writeup{margin:.4rem 0}
.chips .chip,.chips{margin:.2rem 0}
.chip{display:inline-block;font-size:.78rem;background:var(--card);border:1px solid var(--line);border-radius:999px;padding:.15rem .6rem;margin:.15rem .2rem .15rem 0;color:var(--muted)}
.btn{display:inline-block;background:var(--btn);color:var(--btn-fg);text-decoration:none;padding:.5rem .9rem;border-radius:8px;font-weight:600;border:0;cursor:pointer;font-size:.95rem}
.retailer{margin:.5rem 0}
.retailer.unavailable{color:var(--muted);font-size:.85rem}
.more{font-size:.85rem;margin:.2rem 0}
.faq{margin-top:2rem;border-top:1px solid var(--line);padding-top:1rem}
.faq-item{margin:.6rem 0}
.email-capture{margin:2rem 0;padding:1.1rem;border:1px dashed var(--line);border-radius:10px;background:var(--card)}
.email-capture form{display:flex;gap:.5rem;flex-wrap:wrap;align-items:end}
.email-capture input{padding:.5rem;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--fg)}
.related{margin-top:2rem;border-top:1px solid var(--line);padding-top:1rem}
.related ul,.hub-list{list-style:none;padding:0;display:grid;gap:.4rem}
@media(min-width:560px){.hub-list{grid-template-columns:1fr 1fr}}
.content-notes{font-size:.9rem;color:var(--muted)}
.site-footer{max-width:760px;margin:2rem auto 0;padding:1.2rem 1.1rem;border-top:1px solid var(--line);font-size:.85rem;color:var(--muted)}
.site-footer nav{margin:.4rem 0}
.fineprint{font-size:.78rem}
.flag{background:#fff6d6;color:#5a4a00;border-radius:8px;padding:.6rem .8rem}
@media (prefers-color-scheme:dark){.flag{background:#3a3413;color:#f0e6b0}}
.tagline{color:var(--muted);font-size:1.1rem}
`;
