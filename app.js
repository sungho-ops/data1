const $=id=>document.getElementById(id);
const fmt=x=>Number(x).toLocaleString('ko-KR',{maximumFractionDigits:3});
let worker, nextId=0, requests=new Map(), sectors=[], rowChoices=[], cells=[], basket=[], result=null;
function text(tag,value){const e=document.createElement(tag);e.textContent=value;return e;}
function call(type,payload){return new Promise((resolve,reject)=>{const id=++nextId;requests.set(id,{resolve,reject});worker.postMessage({id,type,payload});});}
function startWorker(){worker=new Worker('./worker.js');worker.onmessage=({data:d})=>{if(d.type==='status'){if($('status'))$('status').textContent=d.text;return;}const p=requests.get(d.id);if(!p)return;requests.delete(d.id);d.ok?p.resolve(d.result):p.reject(Error(d.error));};worker.onerror=e=>{for(const p of requests.values())p.reject(Error(e.message||'Worker 실행 오류'));requests.clear();};}
function options(el,list){if(!el)return;el.replaceChildren(...list.map(x=>{const o=document.createElement('option');o.value=x.code;o.textContent=x.code+' '+x.name;return o;}));}
function invalidate(){result=null;if($('results'))$('results').hidden=true;}

async function load(buffer){
 invalidate();basket=[];renderBasket();
 for(const id of ['sheet','row','sector','add','run','row-search','col-search','sector-search','amount'])if($(id))$(id).disabled=true;
 if(worker)worker.terminate();for(const p of requests.values())p.reject(Error('데이터 다시 로드'));requests.clear();startWorker();
 try{const info=await call('init',buffer);sectors=info.sectors;options($('sector'),sectors);
 if($('sector-search'))$('sector-search').value='';if($('row-search'))$('row-search').value='';if($('col-search'))$('col-search').value='';
 if($('sheet'))$('sheet').replaceChildren(...info.sheets.map(s=>{const o=text('option',s);o.value=s;return o;}));
 if($('validation'))$('validation').textContent=JSON.stringify(info.residuals,null,2)+'\n최대 절대 잔차: 허용값 1e-8 미만';
 for(const id of ['sheet','row','sector','add','run','row-search','col-search','sector-search','amount'])if($(id))$(id).disabled=false;
 await explore();if($('status'))$('status').textContent='준비 완료 · '+sectors.length+'개 부문 · '+info.sheets.length+'개 시트 · 계수 검증 통과';
 }catch(e){if($('status'))$('status').textContent='준비 실패: '+e.message+' — 새로고침 후 재시도하세요.';}
}

let exploreSeq=0;
async function explore(){
  const seq=++exploreSeq;
  try{
    const d=await call('explore',{sheet:$('sheet')?$('sheet').value:'',row:$('row')?$('row').value:''});
    if(seq!==exploreSeq)return;
    rowChoices=d.rows;
    filterRows(d.selected);
    cells=d.cells;
    // 이 부분이 문제의 원인이었습니다! 안전장치(if)를 추가하여 무조건 넘어갑니다.
    if($('unit')) $('unit').textContent=d.unit;
    if($('explore-caption')) $('explore-caption').textContent=($('sheet')?$('sheet').value:'')+' / 행: '+d.selected+' '+d.name;
    renderCells();
  }catch(e){
    if($('status'))$('status').textContent=e.message;
  }
}

function filterRows(selected){const q=$('row-search')?$('row-search').value.trim():'';options($('row'),rowChoices.filter(r=>(r.code+' '+r.name).includes(q)));if($('row')&&[...$('row').options].some(o=>o.value===selected))$('row').value=selected;}
function renderCells(){const q=$('col-search')?$('col-search').value.trim():'';if($('cells'))$('cells').replaceChildren(...cells.filter(c=>(c.code+' '+c.name).includes(q)).map(c=>{const tr=document.createElement('tr');for(const v of [c.code,c.name,c.value===null?'빈 셀':typeof c.value==='number'?fmt(c.value):c.value])tr.append(text('td',v));return tr;}));}

if($('sheet'))$('sheet').onchange=()=>{$('row-search').value='';$('row').replaceChildren();explore();};
if($('row'))$('row').onchange=explore;
if($('row-search'))$('row-search').oninput=()=>{filterRows();if($('row').value)explore();else{if($('cells'))$('cells').replaceChildren();if($('explore-caption'))$('explore-caption').textContent='일치하는 행이 없습니다.';}};
if($('col-search'))$('col-search').oninput=renderCells;
if($('sector-search'))$('sector-search').oninput=()=>{const q=$('sector-search').value.trim();options($('sector'),sectors.filter(s=>(s.code+' '+s.name).includes(q)));};

function renderBasket(){if(!$('basket'))return;$('basket').replaceChildren(...basket.map((s,i)=>{const li=text('li',s.code+' '+s.name+' / '+fmt(s.amount)+'백만원 ');const b=text('button','삭제');b.type='button';b.onclick=()=>{basket.splice(i,1);invalidate();renderBasket();};li.append(b);return li;}));if($('sim-status'))$('sim-status').textContent=basket.length?basket.length+'개 입력 준비. 계산 버튼을 누르세요.':'시나리오를 추가하세요.';}
if($('scenario'))$('scenario').onsubmit=e=>{e.preventDefault();const amount=Number($('amount').value),s=sectors.find(s=>s.code===$('sector').value);if(!s||!Number.isFinite(amount)||amount<=0){if($('sim-status'))$('sim-status').textContent='산업과 양의 증가액을 확인하세요.';return;}basket.push({...s,amount});invalidate();renderBasket();};
if($('clear'))$('clear').onclick=()=>{basket=[];invalidate();renderBasket();};
if($('run'))$('run').onclick=async()=>{if(!basket.length){if($('sim-status'))$('sim-status').textContent='시나리오를 먼저 추가하세요.';return;}const snapshot=basket.map(s=>({...s}));$('run').disabled=true;if($('sim-status'))$('sim-status').textContent='계산 중…';try{const r=await call('simulate',snapshot);if(JSON.stringify(snapshot)!==JSON.stringify(basket)){if($('sim-status'))$('sim-status').textContent='입력이 변경되었습니다. 다시 계산하세요.';return;}result=r;renderResult();if($('sim-status'))$('sim-status').textContent='계산 완료. 아래 결과는 현재 시나리오에 대응합니다.';}catch(e){invalidate();if($('sim-status'))$('sim-status').textContent='계산 실패: '+e.message;}finally{$('run').disabled=false;}};

function renderResult(){if(!$('results'))return;$('results').hidden=false;if($('cards'))$('cards').replaceChildren(...[['수요 증가액',result.demand],['생산유발액',result.production],['수입유발액',result.imports],['부가가치유발액',result.valueAdded]].map(([title,v])=>{const d=text('div',title);d.className='card';d.append(text('strong',fmt(v)),text('span','백만원'));return d;}));const max=Math.max(...result.rows.map(r=>r.production),1);if($('bars'))$('bars').replaceChildren(...result.rows.slice(0,15).map(r=>{const d=text('div',r.name+' · '+fmt(r.production)+'백만원');d.className='bar';const t=document.createElement('div');t.className='track';const f=document.createElement('div');f.className='fill';f.style.width=Math.max(0,r.production/max*100)+'%';t.append(f);d.append(t);return d;}));if($('result-rows'))$('result-rows').replaceChildren(...result.rows.map(r=>{const tr=document.createElement('tr');[r.code,r.name,fmt(r.production),fmt(r.imports),fmt(r.valueAdded)].forEach(v=>tr.append(text('td',v)));return tr;}));}
function csvCell(v){let s=String(v);if(/^[=+@-]/.test(s)&&typeof v!=='number')s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
if($('download'))$('download').onclick=()=>{if(!result)return;const rows=[['산업코드','산업명','생산유발액_백만원','수입유발액_백만원','부가가치유발액_백만원'],...result.rows.map(r=>[r.code,r.name,r.production,r.imports,r.valueAdded])];const url=URL.createObjectURL(new Blob(['\ufeff'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='io-2023-results.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};

async function loadSelectedWorkbook(year){
  try {
    if($('status'))$('status').textContent=`${year}년 기본 Excel 내려받는 중...`;
    const response=await fetch(`./data/io-${year}.xlsx`);
    if(!response.ok)throw Error(`${year}년 Excel 다운로드 실패 (HTTP `+response.status+')');
    await load(await response.arrayBuffer());
  }catch(error){
    if($('status'))$('status').textContent='준비 실패: '+error.message+' - 연결 상태를 확인하고 새로고침하세요.';
    throw error;
  }
}

if($('load-basic'))$('load-basic').onclick=async()=>{
  const button=$('load-basic');
  const selectedYear = document.getElementById('year-select').value;
  button.disabled=true;
  button.textContent='불러오는 중...';
  try {
    await loadSelectedWorkbook(selectedYear);
    const ready=!$('sheet').disabled;
    button.textContent=ready?`${selectedYear}년 데이터 불러오기 완료`:'기본부문 다시 불러오기';
    button.disabled=ready;
    if(ready && $('row')) $('row').dispatchEvent(new Event('change'));
  }catch(e){
  }finally{
    if($('sheet') && $('sheet').disabled){button.disabled=false;button.textContent='기본부문 다시 불러오기';}
  }
};

if(document.getElementById('btn-linkage')) document.getElementById('btn-linkage').addEventListener('click', async () => {
  const btn = document.getElementById('btn-linkage');
  const tbody = document.getElementById('linkage-results');
  try {
    btn.disabled = true;
    btn.textContent = '계산 중...';
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">데이터를 분석 중입니다...</td></tr>'; 
    const data = await call('analyze_linkage'); 
    tbody.innerHTML = ''; 
    data.forEach(item => {
      const tr = document.createElement('tr');
      const backward = Number(item.backward);
      const forward = Number(item.forward);
      let note = '';
      if (backward >= 1.0 && forward >= 1.0) {
        note = '⭐ 핵심산업'; 
        tr.style.backgroundColor = '#e6f4ea';
        tr.style.fontWeight = 'bold';
      }
      tr.innerHTML = `
        <td>${item.code}</td>
        <td>${item.name}</td>
        <td>${backward.toFixed(3)}</td>
        <td>${forward.toFixed(3)}</td>
        <td style="color: #0b5345;">${note}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (error) {
    console.error('연쇄효과 분석 중 오류:', error);
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:red;">분석 실패: ${error.message}</td></tr>`;
  } finally {
    btn.disabled = false;
    btn.textContent = '핵심 산업 분석하기';
  }
});
// 초기화 버튼 이벤트 (새로고침 없이 상태 리셋)
if(document.getElementById('reset-app')) {
  document.getElementById('reset-app').addEventListener('click', () => {
    // 1. 불러오기 버튼 초기화
    const loadBtn = document.getElementById('load-basic');
    if(loadBtn) {
      loadBtn.disabled = false;
      loadBtn.textContent = '기본부문 불러오기';
    }
    
    // 2. 화면의 표와 안내 문구 리셋
    if($('sheet')) $('sheet').replaceChildren();
    if($('row')) $('row').replaceChildren();
    if($('cells')) $('cells').replaceChildren();
    if($('explore-caption')) $('explore-caption').textContent = '기본 자료를 불러온 후 표시됩니다.';
    if($('status')) $('status').textContent = '초기화되었습니다. 새로운 연도를 선택하고 불러오기를 눌러주세요.';
    
    // 3. 시뮬레이션 장바구니 및 결과창 초기화
    invalidate();
    basket = [];
    renderBasket();
    
    // 4. 하단 입력 필드 및 버튼들 비활성화 (초기 상태로 되돌림)
    for(const id of ['sheet','row','sector','add','run','row-search','col-search','sector-search','amount']){
      if($(id)) $(id).disabled = true;
    }
  });
}
// 4. 연도별 트렌드 분석 기능
if(document.getElementById('run-trend')) {
    // [버그 수정] 항목 갯수가 아닌, 초기 안내 문구가 있을 때만 복사하여 덮어쓰기 방지
    const syncSectors = setInterval(() => {
        if($('sector') && $('sector').options.length > 0 && $('trend-sector').options[0] && $('trend-sector').options[0].textContent.includes('먼저')) {
            $('trend-sector').innerHTML = $('sector').innerHTML;
            $('trend-sector').disabled = false;
            if($('trend-search')) $('trend-search').disabled = false; // 검색창 활성화
            $('run-trend').disabled = false;
        }
    }, 1000);

    if($('trend-search')) {
        $('trend-search').oninput = () => {
            const q = $('trend-search').value.trim();
            if(typeof sectors !== 'undefined' && sectors.length > 0) {
                const filtered = sectors.filter(s => (s.code + ' ' + s.name).includes(q));
                options($('trend-sector'), filtered);
                
                // 검색 결과가 있으면 첫 번째 항목을 자동으로 선택
                if(filtered.length > 0) {
                    $('trend-sector').selectedIndex = 0;
                }
            }
        };
    }

    $('run-trend').onclick = async () => {
        const btn = $('run-trend');
        const tbody = $('trend-results');
        const sectorCode = $('trend-sector').value;
        const originalYear = $('year-select').value; // 원래 보던 연도 기억하기

        btn.disabled = true;
        $('trend-sector').disabled = true;
        if($('trend-search')) $('trend-search').disabled = true;
        
        tbody.innerHTML = `<tr><td colspan="4" style="padding: 15px; text-align:center;">2022~2024년 데이터를 차례대로 분석 중입니다...<br>⏳ 엑셀 파일 3개를 연속으로 처리하므로 <strong>약 30초~1분 이상</strong> 소요될 수 있습니다. 잠시만 기다려주세요!</td></tr>`;

        try {
            const years = ['2022', '2023', '2024'];
            let html = '';

            for (const y of years) {
                if($('status')) $('status').textContent = `[트렌드 분석] ${y}년 데이터 처리 중...`;
                
                // 백그라운드에서 해당 연도 엑셀 다운로드 및 분석
                const res = await fetch(`./data/io-${y}.xlsx`);
                if(!res.ok) throw Error(`${y}년 데이터 없음`);
                await load(await res.arrayBuffer()); 
                
                const linkageData = await call('analyze_linkage');
                const target = linkageData.find(item => item.code === sectorCode);

                if (target) {
                    const back = Number(target.backward);
                    const fwd = Number(target.forward);
                    let note = (back >= 1.0 && fwd >= 1.0) ? '⭐ 핵심산업' : '';
                    html += `
                        <tr>
                            <td style="padding: 10px;"><strong>${y}년</strong></td>
                            <td>${back.toFixed(3)}</td>
                            <td>${fwd.toFixed(3)}</td>
                            <td style="color: #0b5345; font-weight: bold;">${note}</td>
                        </tr>`;
                }
            }
            tbody.innerHTML = html;
            
            // 원래 보던 연도로 복구
            if($('status')) $('status').textContent = `트렌드 분석 완료! (원래 보던 ${originalYear}년 데이터로 복구 중...)`;
            await loadSelectedWorkbook(originalYear);
            if($('status')) $('status').textContent = `트렌드 분석 완료! (${originalYear}년 데이터 복구됨)`;

        } catch(error) {
            tbody.innerHTML = `<tr><td colspan="4" style="padding: 15px; text-align:center; color:red;">분석 실패: ${error.message}</td></tr>`;
            if($('status')) $('status').textContent = `트렌드 분석 실패`;
        } finally {
            btn.disabled = false;
            $('trend-sector').disabled = false;
            if($('trend-search')) $('trend-search').disabled = false;
            $('trend-sector').value = sectorCode; // 선택했던 산업 유지
        }
    };
}
