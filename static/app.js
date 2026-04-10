// ─── DOM Elements ──────────────────────────────────────────────────────────
const elements = {
    companySelect:    document.getElementById('company-select'),
    modeSelect:       document.getElementById('mode-select'),
    analyzeBtn:       document.getElementById('analyze-btn'),
    loadingOverlay:   document.getElementById('loading-overlay'),
    loadingText:      document.getElementById('loading-text'),
    chartTitle:       document.getElementById('chart-title'),
    chartIndicator:   document.getElementById('chart-indicator'),
    predAnalysisBtn:  document.getElementById('pred-analysis-btn'),
    aiPrediction:     document.getElementById('ai-prediction'),
    aiConfidence:     document.getElementById('ai-confidence'),
    confidenceBar:    document.getElementById('confidence-bar'),
    engineConfidenceMain: document.getElementById('engine-confidence-main'),
    engineConfidenceBar:  document.getElementById('engine-confidence-bar'),
    aiExplanation:    document.getElementById('ai-explanation'),
    nextPriceCard:    document.getElementById('next-price-card'),
    aiNextPrice:      document.getElementById('ai-next-price'),
    closingPriceCard: document.getElementById('closing-price-card'),
    aiClosingPrice:   document.getElementById('ai-closing-price'),
    engineDecision:   document.getElementById('engine-decision'),
    engineScore:      document.getElementById('engine-score'),
    engineConfidence: document.getElementById('engine-confidence'),
    techRsi:          document.getElementById('tech-rsi'),
    techMa:           document.getElementById('tech-ma'),
    techVolatility:   document.getElementById('tech-volatility'),
    techTrend:        document.getElementById('tech-trend'),
    methodsToggleBtn: document.getElementById('methods-toggle-btn'),
    methodsSection:   document.getElementById('methods-section'),
    settingsBtn:      document.getElementById('settings-btn'),
    aboutModal:       document.getElementById('about-modal'),
    aboutModalClose:  document.getElementById('about-modal-close'),
    // Modal
    predModal:        document.getElementById('pred-modal'),
    predModalClose:   document.getElementById('pred-modal-close'),
    predModalSub:     document.getElementById('pred-modal-subtitle'),
    modalTimeButtons: document.getElementById('modal-time-buttons'),
    modalMetrics:     document.getElementById('modal-metrics'),
    mmInterval:       document.getElementById('mm-interval'),
    mmActual:         document.getElementById('mm-actual'),
    mmPredicted:      document.getElementById('mm-predicted'),
    mmError:          document.getElementById('mm-error'),
    mmR2:             document.getElementById('mm-r2'),
};

let chartInstance     = null;
let modalChartInst    = null;
let lastIntradayData  = null; // cached for modal

// ─── Init ──────────────────────────────────────────────────────────────────
async function init() {
    try {
        showLoading("Connecting to AI Core...");
        const res = await fetch('/api/companies');
        if (!res.ok) throw new Error('Failed to fetch companies');
        populateCompanyDropdown(await res.json());
        hideLoading();
    } catch (e) {
        elements.loadingText.textContent = "Error loading. Please refresh.";
    }
}

function populateCompanyDropdown(data) {
    const s = elements.companySelect;
    s.innerHTML = '<option value="" disabled selected>Select an asset</option>';
    const g1 = document.createElement('optgroup'); g1.label = "Top 10 Indian Companies";
    data.global.forEach(c => { const o = document.createElement('option'); o.value = c.symbol; o.textContent = `${c.name} (${c.symbol})`; g1.appendChild(o); });
    const g2 = document.createElement('optgroup'); g2.label = "NIFTY 50 List";
    data.nifty50.forEach(c => { const o = document.createElement('option'); o.value = c.symbol; o.textContent = `${c.name} (${c.symbol})`; g2.appendChild(o); });
    s.appendChild(g1); s.appendChild(g2); s.disabled = false;
}

// ─── Analyze ──────────────────────────────────────────────────────────────
elements.analyzeBtn.addEventListener('click', analyzeStock);
elements.predAnalysisBtn.addEventListener('click', openPredictionModal);
elements.predModalClose.addEventListener('click', closePredictionModal);
elements.predModal.addEventListener('click', e => { if (e.target === elements.predModal) closePredictionModal(); });

// About Modal
elements.settingsBtn.addEventListener('click', () => { elements.aboutModal.style.display = 'flex'; });
elements.aboutModalClose.addEventListener('click', () => { elements.aboutModal.style.display = 'none'; });
elements.aboutModal.addEventListener('click', e => { if (e.target === elements.aboutModal) elements.aboutModal.style.display = 'none'; });

elements.methodsToggleBtn.addEventListener('click', () => {
    const isHidden = elements.methodsSection.style.display === 'none';
    elements.methodsSection.style.display = isHidden ? 'flex' : 'none';
    elements.methodsToggleBtn.querySelector('span').textContent = isHidden ? 'Methods ▲' : 'Methods ▼';
});

async function analyzeStock() {
    const symbol = elements.companySelect.value;
    const mode   = elements.modeSelect.value;
    if (!symbol) { alert("Please select an asset first."); return; }

    showLoading("Running FinRobot Analysis...");
    elements.predAnalysisBtn.style.display = 'none';
    lastIntradayData = null;

    try {
        elements.chartIndicator.classList.remove('active');
        const endpoint = mode === 'daily' ? '/api/predict/daily' : '/api/predict/intraday';
        const res = await fetch(endpoint, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({symbol}) });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || "API Error"); }
        const data = await res.json();
        updateUI(data, mode);
    } catch (e) {
        alert(`Analysis Failed: ${e.message}`);
    } finally { hideLoading(); }
}

// ─── Main UI Update ────────────────────────────────────────────────────────
function updateUI(data, mode) {
    const sel = elements.companySelect;
    const name = sel.options[sel.selectedIndex].text;
    let modeText = 'Daily Closing (Last 10 Days)';
    if (mode === 'intraday') {
        modeText = `Intraday (15m) · ${data.today_date || ''}`;
        lastIntradayData = data;
        elements.predAnalysisBtn.style.display = 'flex';
    }
    elements.chartTitle.textContent = `${name} - ${modeText}`;

    const prediction = data.ai_insight?.prediction;
    const pricesArr  = mode === 'daily'
        ? (data.prices       || [])
        : (data.actual_prices || []);

    if (pricesArr.length === 0) {
        alert("No price data returned. Market may be closed or data unavailable.");
        return;
    }

    const isUp = prediction === 'UP' ? true
               : prediction === 'DOWN' ? false
               : pricesArr[pricesArr.length - 1] >= pricesArr[0];

    if (mode === 'daily') renderDailyChart(data.dates || [], pricesArr, isUp);
    else                   renderIntradayActualOnly(data, isUp);

    updateInsights(data.ai_insight);
    if (data.rule_engine) updateRuleEngine(data.rule_engine);
    if (data.technicals)  updateTechnicals(data.technicals);

    const dot = elements.chartIndicator;
    dot.className = 'status-dot';
    dot.style.cssText = '';
    if (isUp) { dot.classList.add('active'); }
    else { dot.style.backgroundColor='#ef4444'; dot.style.boxShadow='0 0 8px rgba(239,68,68,0.4)'; }
}

// ─── Daily Chart ──────────────────────────────────────────────────────────
function renderDailyChart(labels, prices, isUp) {
    destroyMain();
    const ctx   = document.getElementById('marketChart').getContext('2d');
    const color = isUp ? '#10b981' : '#ef4444';
    const bg    = isUp ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)';
    const last  = prices.length - 1;
    const mn    = Math.min(...prices), mx = Math.max(...prices), pad = (mx-mn)*0.15;

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets: [{
            label: 'Price', data: prices, borderColor: color, backgroundColor: bg,
            borderWidth: 2.5, tension: 0.4, fill: true,
            pointRadius: prices.map((_,i) => i===last ? 7 : 4),
            pointBackgroundColor: prices.map((_,i) => i===last ? color : '#060913'),
            pointBorderColor: color, pointHoverRadius: 7
        }]},
        options: chartOpts(color, mn-pad, mx+pad, false)
    });
}

// ─── Intraday Actual-Only Chart ────────────────────────────────────────────
function renderIntradayActualOnly(data, isUp) {
    destroyMain();
    const ctx      = document.getElementById('marketChart').getContext('2d');
    const allTimes = data.all_market_times;
    const lookup   = {};
    (data.actual_times||[]).forEach((t,i) => lookup[t] = data.actual_prices[i]);

    const actualData = allTimes.map(t => lookup[t] !== undefined ? lookup[t] : null);
    const vals   = actualData.filter(v => v !== null);
    const mn     = Math.min(...vals), mx = Math.max(...vals), pad = (mx-mn)*0.15;
    const color  = isUp ? '#10b981' : '#ef4444';
    const bg     = isUp ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)';
    const lastIdx= actualData.reduce((l,v,i) => v!==null?i:l, -1);

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: { labels: allTimes, datasets: [{
            label: 'Actual Price', data: actualData,
            borderColor: color, backgroundColor: bg,
            borderWidth: 2.5, tension: 0.35, fill: true, spanGaps: false,
            pointRadius: actualData.map((v,i) => v===null ? 0 : i===lastIdx ? 7 : 4),
            pointBackgroundColor: actualData.map((v,i) => v===null ? 'transparent' : i===lastIdx ? color : '#060913'),
            pointBorderColor: actualData.map(v => v===null ? 'transparent' : color),
            pointHoverRadius: 7
        }]},
        options: chartOpts(color, mn-pad, mx+pad, false)
    });
}

// ─── Modal Open/Close ─────────────────────────────────────────────────────
function openPredictionModal() {
    if (!lastIntradayData) return;
    const data = lastIntradayData;
    const sel = elements.companySelect;
    const companyName = sel.options[sel.selectedIndex].text;
    elements.predModalSub.textContent = `${companyName} · ${data.today_date} · Actual vs Predicted · 15-min intervals`;
    elements.predModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Render modal chart (both datasets)
    renderModalChart(data);

    // Build time buttons (completed only)
    elements.modalTimeButtons.innerHTML = '';
    elements.modalMetrics.style.display = 'none';
    const completed = (data.prediction_chain||[]).filter(c => !c.is_future && c.actual_price_at_target !== null);
    completed.forEach(item => {
        const btn = document.createElement('button');
        btn.className = 'time-btn';
        btn.innerHTML = `<span class="btn-time">${item.target_time}</span><span class="btn-err ${item.error<=2?'good':'bad'}">±₹${item.error.toFixed(2)}</span>`;
        btn.addEventListener('click', () => showModalMetrics(item, btn));
        elements.modalTimeButtons.appendChild(btn);
    });
}

function closePredictionModal() {
    elements.predModal.style.display = 'none';
    document.body.style.overflow = '';
    if (modalChartInst) { modalChartInst.destroy(); modalChartInst = null; }
}

// ─── Modal chart (actual + predicted) ─────────────────────────────────────
function renderModalChart(data) {
    if (modalChartInst) { modalChartInst.destroy(); modalChartInst = null; }
    const ctx      = document.getElementById('predictionModalChart').getContext('2d');
    const allTimes = data.all_market_times;
    const aLookup  = {}, pLookup = {}, mLookup = {};
    (data.actual_times||[]).forEach((t,i) => aLookup[t] = data.actual_prices[i]);
    (data.prediction_chain||[]).forEach(item => {
        pLookup[item.target_time] = item.predicted_price;
        mLookup[item.target_time] = item;
    });

    const actualData    = allTimes.map(t => aLookup[t] !== undefined ? aLookup[t] : null);
    const predictedData = allTimes.map(t => pLookup[t] !== undefined ? pLookup[t] : null);
    const allVals = [...actualData, ...predictedData].filter(v => v !== null);
    const mn = Math.min(...allVals), mx = Math.max(...allVals), pad = (mx-mn)*0.18;
    const lastAct = actualData.reduce((l,v,i) => v!==null?i:l, -1);

    modalChartInst = new Chart(ctx, {
        type: 'line',
        data: { labels: allTimes, datasets: [
            {
                label: 'Actual Price', data: actualData,
                borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.08)',
                borderWidth: 2.5, tension: 0.35, fill: true, spanGaps: false,
                pointRadius: actualData.map((v,i) => v===null?0:i===lastAct?8:5),
                pointBackgroundColor: actualData.map((v,i) => v===null?'transparent':i===lastAct?'#10b981':'#060913'),
                pointBorderColor: actualData.map(v => v===null?'transparent':'#10b981'),
                pointHoverRadius: 8
            },
            {
                label: 'Predicted Price', data: predictedData,
                borderColor: '#8b5cf6', backgroundColor: 'transparent',
                borderWidth: 2, borderDash: [6,4], tension: 0.35, fill: false, spanGaps: false,
                pointRadius: predictedData.map(v => v===null?0:5),
                pointBackgroundColor: predictedData.map(v => v===null?'transparent':'#8b5cf6'),
                pointBorderColor: predictedData.map(v => v===null?'transparent':'#fff'),
                pointBorderWidth: 1.5, pointHoverRadius: 8
            }
        ]},
        options: chartOpts('#10b981', mn-pad, mx+pad, true, mLookup, allTimes)
    });
}

function showModalMetrics(item, clickedBtn) {
    document.querySelectorAll('#modal-time-buttons .time-btn').forEach(b => b.classList.remove('active'));
    clickedBtn.classList.add('active');
    elements.mmInterval.textContent   = `${item.from_time} → ${item.target_time}`;
    elements.mmActual.textContent     = `₹${item.actual_price_at_target.toFixed(2)}`;
    elements.mmPredicted.textContent  = `₹${item.predicted_price.toFixed(2)}`;
    elements.mmError.textContent      = `₹${item.error.toFixed(2)}`;
    elements.mmR2.textContent         = item.r2_score !== null ? item.r2_score.toFixed(4) : 'N/A';
    elements.mmError.style.color      = item.error <= 2 ? 'var(--up-color)' : item.error <= 4 ? '#f59e0b' : 'var(--down-color)';
    const r2 = item.r2_score;
    elements.mmR2.style.color = r2 === null ? 'var(--text-muted)' : r2 >= 0.9 ? 'var(--up-color)' : r2 >= 0.7 ? '#f59e0b' : 'var(--down-color)';
    elements.modalMetrics.style.display = 'grid';
}

// ─── Chart Options Builder ────────────────────────────────────────────────
function chartOpts(lineColor, yMin, yMax, isIntraday=false, metricLookup={}, allTimes=[]) {
    return {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 700, easing: 'easeInOutQuart' },
        plugins: {
            legend: { display: false },
            tooltip: {
                mode: 'index', intersect: false,
                backgroundColor: 'rgba(8,12,28,0.97)',
                titleColor: '#f3f4f6', bodyColor: '#d1d5db',
                borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1,
                padding: 14, displayColors: true,
                callbacks: {
                    label: ctx => ctx.parsed.y == null ? null : `${ctx.dataset.label}: ₹${ctx.parsed.y.toFixed(2)}`,
                    afterBody: contexts => {
                        if (!isIntraday) return [];
                        const t = contexts[0]?.label;
                        const m = t && metricLookup[t];
                        if (!m) return [];
                        const lines = ['─────────────────'];
                        if (!m.is_future && m.actual_price_at_target !== null) {
                            lines.push(`Actual:    ₹${m.actual_price_at_target.toFixed(2)}`);
                            lines.push(`Predicted: ₹${m.predicted_price.toFixed(2)}`);
                            lines.push(`Error:     ₹${m.error.toFixed(2)}`);
                            lines.push(`R²:        ${m.r2_score !== null ? m.r2_score.toFixed(4) : 'N/A'}`);
                        } else if (m.is_future) {
                            lines.push(`Predicted: ₹${m.predicted_price.toFixed(2)}`);
                            lines.push('(Future — not yet traded)');
                        }
                        return lines;
                    }
                }
            }
        },
        scales: {
            x: { grid: {color:'rgba(255,255,255,0.04)'}, ticks: {color:'#9ca3af', maxRotation:45, font:{family:"'Outfit',sans-serif",size:11}, maxTicksLimit:14} },
            y: { grid: {color:'rgba(255,255,255,0.04)'}, ticks: {color:'#9ca3af', font:{family:"'Outfit',sans-serif",size:11}, callback: v=>'₹'+v.toLocaleString('en-IN')}, min:yMin, max:yMax }
        },
        interaction: { mode:'index', axis:'x', intersect:false }
    };
}

function destroyMain() { if (chartInstance) { chartInstance.destroy(); chartInstance = null; } }

// ─── Insights ─────────────────────────────────────────────────────────────
function updateInsights(insight) {
    if (!insight) return;
    const p = elements.aiPrediction;
    p.textContent = insight.prediction; p.className = 'insight-value';
    if (insight.prediction==='UP') p.classList.add('up');
    else if (insight.prediction==='DOWN') p.classList.add('down');
    animateValue(elements.aiConfidence, 0, insight.confidence, 1000, '%');
    elements.confidenceBar.style.width = `${insight.confidence}%`;
    typeWriter(elements.aiExplanation, insight.explanation, 18);
    if (insight.closing_price_prediction) {
        elements.closingPriceCard.style.display = 'flex';
        elements.aiClosingPrice.textContent = '₹' + insight.closing_price_prediction.toFixed(2);
        elements.nextPriceCard.style.display = 'flex';
        elements.aiNextPrice.textContent = '₹' + (insight.next_30m_price_prediction||insight.closing_price_prediction).toFixed(2);
        const cls = insight.prediction==='UP'?'up':insight.prediction==='DOWN'?'down':'';
        elements.aiClosingPrice.className = 'insight-value'+(cls?' '+cls:'');
        elements.aiNextPrice.className    = 'insight-value'+(cls?' '+cls:'');
    } else {
        elements.closingPriceCard.style.display = 'none';
        elements.nextPriceCard.style.display    = 'none';
    }
}
function updateRuleEngine(e) {
    elements.engineDecision.textContent = e.decision;
    elements.engineDecision.className = 'insight-value';
    elements.engineDecision.classList.add(e.decision.toLowerCase());
    elements.engineScore.textContent = e.score;
    elements.engineConfidence.textContent = e.confidence+'%';
    if (elements.engineConfidenceMain) {
        animateValue(elements.engineConfidenceMain, 0, e.confidence, 1000, '%');
        elements.engineConfidenceBar.style.width = `${e.confidence}%`;
    }
}
function updateTechnicals(t) {
    elements.techRsi.textContent = t.rsi;
    elements.techMa.textContent = '₹'+t.ma.toLocaleString('en-IN');
    elements.techVolatility.textContent = t.volatility.toFixed(2)+'%';
    elements.techTrend.textContent = t.trend.toUpperCase();
    elements.techTrend.style.color = t.trend==='up'?'#10b981':t.trend==='down'?'#ef4444':'#f59e0b';
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function showLoading(t) { elements.loadingText.textContent=t; elements.loadingOverlay.classList.add('active'); }
function hideLoading()  { elements.loadingOverlay.classList.remove('active'); }
function animateValue(el, s, e, dur, suf='') {
    let t0=null;
    const step=ts=>{ if(!t0)t0=ts; const p=Math.min((ts-t0)/dur,1); el.innerHTML=(p*(e-s)+s).toFixed(1)+suf; if(p<1)requestAnimationFrame(step); };
    requestAnimationFrame(step);
}
let twTimer=null;
function typeWriter(el, text, speed) {
    if(twTimer)clearTimeout(twTimer); el.innerHTML=''; let i=0;
    function t(){ if(i<text.length){ el.innerHTML+=text.charAt(i++); twTimer=setTimeout(t,speed); } }
    t();
}
document.addEventListener('DOMContentLoaded', init);
