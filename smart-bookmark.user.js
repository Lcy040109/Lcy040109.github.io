// ==UserScript==
// @name         智能收藏 Smart Bookmark
// @namespace    smart-bookmark
// @version      0.1.0
// @description  当前网页一键收藏、AI自动分类、邮箱密码登录、云端同步、智能搜索
// @match        http://*/*
// @match        https://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      ghtnniublwkejociyedh.supabase.co
// @connect      *
// @run-at       document-idle
// ==/UserScript==

(function(){
'use strict';
const BASE='https://ghtnniublwkejociyedh.supabase.co';
const KEY='sb_publishable_kHazDpnWtpuWZgeW7ggODg_4z6b2TCq';
const CATS=['AI工具','网络与路由','开发与代码','服务器与云服务','手机与软件','社交与通讯','视频与音乐','购物与电商','学习与资料','云盘与存储','办公与效率','设计与图片','新闻与资讯','生活与服务','网站与服务'];

function request({method='GET',url,headers={},body,timeout=30000}){
  return new Promise((resolve,reject)=>GM_xmlhttpRequest({
    method,url,headers,data:body?JSON.stringify(body):undefined,timeout,
    onload:r=>{let d=r.responseText;try{d=d?JSON.parse(d):null}catch{};if(r.status>=200&&r.status<300)resolve(d);else reject(new Error(`${r.status} ${d?.message||d?.msg||d?.error||r.responseText||'请求失败'}`));},
    onerror:()=>reject(new Error('网络请求失败')),ontimeout:()=>reject(new Error('请求超时'))
  }));
}
async function session(){
  let s=GM_getValue('sb_session',null); if(!s)return null;
  if((s.expires_at||0)<=Date.now()/1000+60){
    try{const d=await request({method:'POST',url:`${BASE}/auth/v1/token?grant_type=refresh_token`,headers:{apikey:KEY,'Content-Type':'application/json'},body:{refresh_token:s.refresh_token}});s={access_token:d.access_token,refresh_token:d.refresh_token,expires_at:Math.floor(Date.now()/1000)+Number(d.expires_in||3600),user:d.user||s.user};GM_setValue('sb_session',s);}catch{GM_deleteValue('sb_session');return null;}
  }
  return s;
}
async function login(email,password){
  const d=await request({method:'POST',url:`${BASE}/auth/v1/token?grant_type=password`,headers:{apikey:KEY,'Content-Type':'application/json'},body:{email,password}});
  const s={access_token:d.access_token,refresh_token:d.refresh_token,expires_at:Math.floor(Date.now()/1000)+Number(d.expires_in||3600),user:d.user};GM_setValue('sb_session',s);return s;
}
async function register(email,password){return request({method:'POST',url:`${BASE}/auth/v1/signup`,headers:{apikey:KEY,'Content-Type':'application/json'},body:{email,password}})}
async function rest(path,{method='GET',query={},body,headers={}}={}){
  const s=await session();if(!s)throw new Error('请先登录');
  const u=new URL(`${BASE}/rest/v1/${path}`);Object.entries(query).forEach(([k,v])=>u.searchParams.set(k,v));
  return request({method,url:u.toString(),headers:{apikey:KEY,Authorization:`Bearer ${s.access_token}`,'Content-Type':'application/json',...headers},body});
}
async function ai(){
  const base=(GM_getValue('sb_ai_base','')||'').replace(/\/+$/,''), key=GM_getValue('sb_ai_key',''), model=GM_getValue('sb_ai_model','');
  if(!base||!key||!model)throw new Error('请先设置 AI API');
  const endpoint=base.endsWith('/chat/completions')?base:base+'/chat/completions';
  const text=(document.body?.innerText||'').replace(/\s+/g,' ').slice(0,2500);
  const prompt=`分析此网页并只返回JSON对象：{"category":"分类","tags":["标签"],"summary":"摘要","confidence":90}。category必须从这些分类中选：${CATS.join('、')}。标题：${document.title}；网址：${location.href}；正文：${text}`;
  const d=await request({method:'POST',url:endpoint,headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:{model,messages:[{role:'system',content:'你是浏览器收藏分类助手，只返回合法JSON。'},{role:'user',content:prompt}],temperature:0},timeout:45000});
  let c=String(d?.choices?.[0]?.message?.content||'').trim().replace(/^```json\s*/i,'').replace(/^```\s*/,'').replace(/\s*```$/,'');const a=c.indexOf('{'),b=c.lastIndexOf('}');if(a>=0&&b>a)c=c.slice(a,b+1);const x=JSON.parse(c);
  return {category:CATS.includes(x.category)?x.category:'网站与服务',tags:Array.isArray(x.tags)?x.tags.slice(0,5):[],summary:typeof x.summary==='string'?x.summary:'',confidence:Number(x.confidence)||70};
}
async function save(useAI=true){
  const s=await session();if(!s){open('account');return;}
  let x={category:'网站与服务',tags:[],summary:'',confidence:null};
  if(useAI){try{x=await ai()}catch(e){toast('AI失败，按普通收藏保存：'+e.message)}}
  await rest('bookmarks',{method:'POST',headers:{Prefer:'return=minimal'},body:{user_id:s.user.id,source_browser:'userscript',source_bookmark_id:null,title:document.title||location.href,url:location.href,description:null,summary:x.summary||null,folder_path:'',category_name:x.category,tags_json:x.tags,ai_confidence:x.confidence,classification_status:x.confidence?'confirmed':'pending',deleted_at:null}});
  toast('已收藏 → '+x.category);
}
async function search(q){
  const rows=await rest('bookmarks',{query:{select:'id,title,url,summary,tags_json,category_name,updated_at',deleted_at:'is.null',order:'updated_at.desc'}});const ks=q.toLowerCase().trim().split(/\s+/).filter(Boolean);if(!ks.length)return rows.slice(0,50);
  return rows.map(x=>{const t=`${x.title||''} ${x.url||''} ${x.summary||''} ${(x.tags_json||[]).join(' ')} ${x.category_name||''}`.toLowerCase();return {...x,_s:ks.reduce((n,k)=>n+(t.includes(k)?1:0),0)}}).filter(x=>x._s).sort((a,b)=>b._s-a._s).slice(0,100);
}
function esc(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function toast(t){let e=document.getElementById('sb-toast');if(!e){e=document.createElement('div');e.id='sb-toast';e.style='position:fixed;z-index:2147483647;right:16px;bottom:76px;background:#111827;color:#fff;padding:12px 16px;border-radius:10px;font:14px system-ui;box-shadow:0 8px 30px #0005';document.documentElement.appendChild(e)}e.textContent=t;e.style.display='block';clearTimeout(e._t);e._t=setTimeout(()=>e.style.display='none',3000)}
const btnStyle='padding:11px 14px;border:0;border-radius:10px;font-weight:700;background:#111827;color:#fff';
const inputStyle='width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid #d1d5db;border-radius:10px;margin:6px 0 12px;font-size:14px';
async function tab(name){
  const c=document.getElementById('sb-c');if(!c)return;
  if(name==='main'){const s=await session();c.innerHTML=`<div style="padding:12px;background:#f9fafb;border-radius:12px;margin-bottom:12px"><b>${esc(document.title||location.href)}</b><div style="font-size:12px;color:#6b7280;word-break:break-all">${esc(location.href)}</div></div><button id="sb-ai-save" style="${btnStyle};width:100%;margin-bottom:8px">🤖 AI分析并收藏</button><button id="sb-save" style="${btnStyle};width:100%;background:#eef2ff;color:#3730a3">直接收藏</button><div style="font-size:12px;color:#6b7280;margin-top:10px">${s?'已登录：'+esc(s.user?.email||''):'尚未登录'}</div>`;document.getElementById('sb-ai-save').onclick=()=>save(true).catch(e=>toast(e.message));document.getElementById('sb-save').onclick=()=>save(false).catch(e=>toast(e.message));}
  if(name==='account'){const s=await session();if(s){c.innerHTML=`<div>当前账号：<b>${esc(s.user?.email||'')}</b></div><button id="sb-out" style="${btnStyle};margin-top:12px;background:#fee2e2;color:#b91c1c">退出登录</button>`;document.getElementById('sb-out').onclick=()=>{GM_deleteValue('sb_session');tab('account')}}else{c.innerHTML=`<input id="sb-email" style="${inputStyle}" placeholder="邮箱"><input id="sb-pass" type="password" style="${inputStyle}" placeholder="密码"><button id="sb-login" style="${btnStyle}">登录</button> <button id="sb-reg" style="${btnStyle};background:#eef2ff;color:#3730a3">注册</button><div id="sb-msg" style="font-size:12px;color:#6b7280;margin-top:10px"></div>`;document.getElementById('sb-login').onclick=async()=>{const m=document.getElementById('sb-msg');try{m.textContent='登录中…';await login(document.getElementById('sb-email').value.trim(),document.getElementById('sb-pass').value);tab('account')}catch(e){m.textContent='登录失败：'+e.message}};document.getElementById('sb-reg').onclick=async()=>{const m=document.getElementById('sb-msg');try{const d=await register(document.getElementById('sb-email').value.trim(),document.getElementById('sb-pass').value);m.textContent=d?.access_token?'注册成功':'注册成功，请先去邮箱确认'}catch(e){m.textContent='注册失败：'+e.message}}}}
  if(name==='ai'){c.innerHTML=`<input id="sb-base" style="${inputStyle}" value="${esc(GM_getValue('sb_ai_base','https://api.openai.com/v1'))}" placeholder="API地址"><input id="sb-key" type="password" style="${inputStyle}" value="${esc(GM_getValue('sb_ai_key',''))}" placeholder="API Key"><input id="sb-model" style="${inputStyle}" value="${esc(GM_getValue('sb_ai_model',''))}" placeholder="模型名"><button id="sb-ai-set" style="${btnStyle}">保存AI设置</button><div style="font-size:12px;color:#6b7280;margin-top:10px">API Key只保存在当前浏览器脚本里。</div>`;document.getElementById('sb-ai-set').onclick=()=>{GM_setValue('sb_ai_base',document.getElementById('sb-base').value.trim());GM_setValue('sb_ai_key',document.getElementById('sb-key').value.trim());GM_setValue('sb_ai_model',document.getElementById('sb-model').value.trim());toast('AI设置已保存')}}
  if(name==='search'){c.innerHTML=`<input id="sb-q" style="${inputStyle}" placeholder="例如：OpenWrt 温度教程"><button id="sb-go" style="${btnStyle}">搜索云端收藏</button><div id="sb-r" style="margin-top:12px"></div>`;document.getElementById('sb-go').onclick=async()=>{const r=document.getElementById('sb-r');r.textContent='搜索中…';try{const rows=await search(document.getElementById('sb-q').value);r.innerHTML=rows.length?rows.map(x=>`<div style="padding:10px 0;border-bottom:1px solid #eee"><a href="${esc(x.url)}" target="_blank" style="font-weight:700;color:#111827;text-decoration:none">${esc(x.title||x.url)}</a><div style="font-size:12px;color:#6366f1">${esc(x.category_name||'')}</div><div style="font-size:12px;color:#6b7280">${esc(x.summary||'')}</div></div>`).join(''):'没有找到'}catch(e){r.textContent='搜索失败：'+e.message}}}
}
function close(){document.getElementById('sb-mask')?.remove();document.getElementById('sb-panel')?.remove()}
function open(which='main'){close();const mask=document.createElement('div');mask.id='sb-mask';mask.style='position:fixed;inset:0;background:#0005;z-index:2147483646';mask.onclick=close;document.documentElement.appendChild(mask);const p=document.createElement('div');p.id='sb-panel';p.style='position:fixed;right:12px;top:12px;bottom:12px;width:min(420px,calc(100vw - 24px));background:#fff;color:#111827;z-index:2147483647;border-radius:18px;box-shadow:0 20px 70px #0005;overflow:auto;font-family:system-ui';p.innerHTML=`<div style="padding:18px"><div style="display:flex;justify-content:space-between;align-items:center"><div><b style="font-size:22px">智能收藏</b><div style="font-size:12px;color:#6b7280">浏览器脚本版</div></div><button id="sb-close" style="${btnStyle};background:#f3f4f6;color:#111827">关闭</button></div><div style="display:flex;gap:8px;flex-wrap:wrap;margin:16px 0"><button data-t="main">收藏</button><button data-t="search">搜索</button><button data-t="account">账号</button><button data-t="ai">AI设置</button></div><div id="sb-c"></div></div>`;document.documentElement.appendChild(p);document.getElementById('sb-close').onclick=close;p.querySelectorAll('[data-t]').forEach(b=>{b.style=btnStyle+';background:#eef2ff;color:#3730a3';b.onclick=()=>tab(b.dataset.t)});tab(which)}
const flo=document.createElement('button');flo.textContent='★';flo.title='智能收藏';flo.style='position:fixed;right:16px;bottom:16px;z-index:2147483645;width:48px;height:48px;border:0;border-radius:50%;background:#111827;color:#fff;font-size:22px;box-shadow:0 8px 24px #0004';flo.onclick=()=>open();document.documentElement.appendChild(flo);
GM_registerMenuCommand('打开智能收藏',()=>open());GM_registerMenuCommand('AI分析并收藏当前页',()=>save(true).catch(e=>toast(e.message)));GM_registerMenuCommand('搜索云端收藏',()=>open('search'));GM_registerMenuCommand('账号登录',()=>open('account'));GM_registerMenuCommand('AI设置',()=>open('ai'));
})();
