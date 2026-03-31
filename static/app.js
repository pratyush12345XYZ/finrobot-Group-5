// DOM Elements
const elements = {
    companySelect: document.getElementById('company-select'),
    modeSelect: document.getElementById('mode-select'),
    analyzeBtn: document.getElementById('analyze-btn'),
    loadingOverlay: document.getElementById('loading-overlay'),
    loadingText: document.getElementById('loading-text'),
    chartTitle: document.getElementById('chart-title'),
    chartIndicator: document.getElementById('chart-indicator'),
    aiPrediction: document.getElementById('ai-prediction'),
    aiConfidence: document.getElementById('ai-confidence'),
    confidenceBar: document.getElementById('confidence-bar'),
    aiExplanation: document.getElementById('ai-explanation'),
    nextPriceCard: document.getElementById('next-price-card'),
    aiNextPrice: document.getElementById('ai-next-price'),
    closingPriceCard: document.getElementById('closing-price-card'),
    aiClosingPrice: document.getElementById('ai-closing-price'),
    // Rule Engine
    engineDecision: document.getElementById('engine-decision'),
    engineScore: document.getElementById('engine-score'),
    engineConfidence: document.getElementById('engine-confidence'),
    // Technicals
    techRsi: document.getElementById('tech-rsi'),
    techMa: document.getElementById('tech-ma'),
    techVolatility: document.getElementById('tech-volatility'),
    techTrend: document.getElementById('tech-trend'),
};

let chartInstance = null;

// Initialize app
async function init() {
    try {
        showLoading("Connecting to AI Core...");
        const response = await fetch('/api/companies');
        if (!response.ok) throw new Error('Failed to fetch companies');
        
        const data = await response.json();
        populateCompanyDropdown(data);
        hideLoading();
    } catch (error) {
        console.error("Initialization error:", error);
        elements.loadingText.textContent = "Error loading initialization data. Please refresh.";
    }
}

function populateCompanyDropdown(data) {
    const select = elements.companySelect;
    select.innerHTML = '<option value="" disabled selected>Select an asset</option>';
    
    const globalGroup = document.createElement('optgroup');
    globalGroup.label = "Top 10 Indian Companies";
    data.global.forEach(c => {
        const option = document.createElement('option');
        option.value = c.symbol;
        option.textContent = `${c.name} (${c.symbol})`;
        globalGroup.appendChild(option);
    });
    
    const niftyGroup = document.createElement('optgroup');
    niftyGroup.label = "NIFTY 50 List";
    data.nifty50.forEach(c => {
        const option = document.createElement('option');
        option.value = c.symbol;
        option.textContent = `${c.name} (${c.symbol})`;
        niftyGroup.appendChild(option);
    });
    
    select.appendChild(globalGroup);
    select.appendChild(niftyGroup);
    select.disabled = false;
}

// Event Listeners
elements.analyzeBtn.addEventListener('click', analyzeStock);

async function analyzeStock() {
    const symbol = elements.companySelect.value;
    const mode = elements.modeSelect.value;
    
    if (!symbol) {
        alert("Please select an asset first.");
        return;
    }
    
    showLoading("Running FinRobot Analysis...");
    
    try {
        elements.chartIndicator.classList.remove('active');
        
        const endpoint = mode === 'daily' ? '/api/predict/daily' : '/api/predict/intraday';
        const payload = { symbol };
        
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.detail || "API Error");
        }
        
        const data = await response.json();
        
        updateUI(data, mode);
        elements.chartIndicator.classList.add('active');
    } catch (error) {
        console.error("Analysis error:", error);
        alert(`Analysis Failed: ${error.message}`);
    } finally {
        hideLoading();
    }
}

function updateUI(data, mode) {
    const select = elements.companySelect;
    const companyName = select.options[select.selectedIndex].text;
    
    let modeText = 'Daily Closing (Last 10 Days)';
    if (mode === 'intraday') {
        const dateStr = data.today_date || new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
        modeText = `Intraday (30m) · ${dateStr}`;
    }
    
    elements.chartTitle.textContent = `${companyName} - ${modeText}`;
    
    const labels = mode === 'daily' ? data.dates : data.times;

    // Determine trend using AI prediction (primary) with price fallback
    const prediction = data.ai_insight ? data.ai_insight.prediction : null;
    let isUpTrend;
    if (prediction === 'UP') {
        isUpTrend = true;
    } else if (prediction === 'DOWN') {
        isUpTrend = false;
    } else {
        // Fallback: compare last price vs first price
        isUpTrend = data.prices.length > 1 ? data.prices[data.prices.length - 1] >= data.prices[0] : true;
    }

    renderChart(labels, data.prices, isUpTrend);
    
    updateInsights(data.ai_insight);

    // Update Rule Engine & Technicals
    if (data.rule_engine) updateRuleEngine(data.rule_engine);
    if (data.technicals) updateTechnicals(data.technicals);

    // Update status dot color to match trend
    const dot = elements.chartIndicator;
    dot.classList.remove('active', 'down-active');
    dot.style.backgroundColor = '';
    dot.style.boxShadow = '';
    if (isUpTrend) {
        dot.classList.add('active');
    } else {
        dot.style.backgroundColor = '#ef4444';
        dot.style.boxShadow = '0 0 8px rgba(239, 68, 68, 0.4)';
    }
}

function renderChart(labels, dataPrices, isUpTrend) {
    const ctx = document.getElementById('marketChart').getContext('2d');
    
    if (chartInstance) {
        chartInstance.destroy();
    }
    
    const lineColor = isUpTrend ? '#10b981' : '#ef4444';
    const bgColor = isUpTrend ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)';
    const glowColor = isUpTrend ? 'rgba(16, 185, 129, 0.6)' : 'rgba(239, 68, 68, 0.6)';
    
    // Determine Y axis range
    const minVal = Math.min(...dataPrices);
    const maxVal = Math.max(...dataPrices);
    const padding = (maxVal - minVal) * 0.15;

    // Find index of the current (last) price for highlight
    const lastIndex = dataPrices.length - 1;

    // Create point radius array: larger for the last point
    const pointRadii = dataPrices.map((_, i) => i === lastIndex ? 7 : 4);
    const pointBorderWidths = dataPrices.map((_, i) => i === lastIndex ? 3 : 2);

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Price',
                data: dataPrices,
                borderColor: lineColor,
                backgroundColor: bgColor,
                borderWidth: 2.5,
                pointBackgroundColor: dataPrices.map((_, i) => i === lastIndex ? lineColor : '#060913'),
                pointBorderColor: lineColor,
                pointBorderWidth: pointBorderWidths,
                pointRadius: pointRadii,
                pointHoverRadius: 7,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 800,
                easing: 'easeInOutQuart'
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(16, 23, 41, 0.9)',
                    titleColor: '#f3f4f6',
                    bodyColor: lineColor,
                    borderColor: lineColor + '33',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: false,
                    callbacks: {
                        label: function(context) {
                            return '₹' + context.parsed.y.toFixed(2);
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { 
                        color: '#9ca3af',
                        maxRotation: 45,
                        font: { family: "'Outfit', sans-serif", size: 11 }
                    }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { 
                        color: '#9ca3af',
                        font: { family: "'Outfit', sans-serif", size: 11 },
                        callback: function(value) {
                            return '₹' + value.toLocaleString();
                        }
                    },
                    min: minVal - padding,
                    max: maxVal + padding
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
        }
    });
}

function updateInsights(insight) {
    // Prediction
    const predEl = elements.aiPrediction;
    predEl.textContent = insight.prediction;
    predEl.className = 'insight-value';
    if (insight.prediction === 'UP') {
        predEl.classList.add('up');
    } else if (insight.prediction === 'DOWN') {
        predEl.classList.add('down');
    }
    
    // Confidence
    animateValue(elements.aiConfidence, 0, insight.confidence, 1000, "%");
    elements.confidenceBar.style.width = `${insight.confidence}%`;
    
    // Explanation typing effect
    typeWriter(elements.aiExplanation, insight.explanation, 20);
    
    // Closing Price Prediction & Next 30m Target (Only if Intraday Today)
    if (insight.closing_price_prediction) {
        elements.closingPriceCard.style.display = 'flex';
        elements.aiClosingPrice.textContent = '₹' + insight.closing_price_prediction.toFixed(2);
        
        elements.nextPriceCard.style.display = 'flex';
        elements.aiNextPrice.textContent = '₹' + insight.next_30m_price_prediction.toFixed(2);
        
        elements.aiClosingPrice.className = 'insight-value';
        elements.aiNextPrice.className = 'insight-value';
        
        if (insight.prediction === 'UP') {
            elements.aiClosingPrice.classList.add('up');
            elements.aiNextPrice.classList.add('up');
        } else if (insight.prediction === 'DOWN') {
            elements.aiClosingPrice.classList.add('down');
            elements.aiNextPrice.classList.add('down');
        }
    } else {
        elements.closingPriceCard.style.display = 'none';
        elements.nextPriceCard.style.display = 'none';
    }
}

// Helpers
function showLoading(text) {
    elements.loadingText.textContent = text;
    elements.loadingOverlay.classList.add('active');
}

function hideLoading() {
    elements.loadingOverlay.classList.remove('active');
}

function animateValue(obj, start, end, duration, suffix = "") {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.innerHTML = (progress * (end - start) + start).toFixed(1) + suffix;
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

let typeWriterTimeout = null;

function typeWriter(element, text, speed) {
    if (typeWriterTimeout) clearTimeout(typeWriterTimeout);
    element.innerHTML = '';
    let i = 0;
    function type() {
        if (i < text.length) {
            element.innerHTML += text.charAt(i);
            i++;
            typeWriterTimeout = setTimeout(type, speed);
        }
    }
    type();
}

function updateRuleEngine(engine) {
    const el = elements.engineDecision;
    el.textContent = engine.decision;
    el.className = 'insight-value'; // reset
    el.classList.add(engine.decision.toLowerCase()); // buy, sell, or hold

    elements.engineScore.textContent = engine.score;
    elements.engineConfidence.textContent = engine.confidence + '%';
}

function updateTechnicals(tech) {
    elements.techRsi.textContent = tech.rsi;
    elements.techMa.textContent = '₹' + tech.ma.toLocaleString();
    elements.techVolatility.textContent = tech.volatility.toFixed(2) + '%';

    const trendEl = elements.techTrend;
    trendEl.textContent = tech.trend.toUpperCase();
    trendEl.style.color = tech.trend === 'up' ? '#10b981' : tech.trend === 'down' ? '#ef4444' : '#f59e0b';
}

// Start
document.addEventListener('DOMContentLoaded', init);
