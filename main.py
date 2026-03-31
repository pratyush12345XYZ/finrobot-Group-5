from fastapi import FastAPI, HTTPException
from indicators import calculate_rsi, moving_average, calculate_volatility, determine_trend, rule_engine
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import yfinance as yf
from services.pipeline import run_finrobot_pipeline
import os
import pandas as pd
import traceback
import requests

app = FastAPI()

DEFAULT_COMPANIES = [
    {"symbol": "RELIANCE.NS", "name": "Reliance Industries"},
    {"symbol": "TCS.NS", "name": "Tata Consultancy Services"},
    {"symbol": "HDFCBANK.NS", "name": "HDFC Bank"},
    {"symbol": "ICICIBANK.NS", "name": "ICICI Bank"},
    {"symbol": "INFY.NS", "name": "Infosys"},
    {"symbol": "HINDUNILVR.NS", "name": "Hindustan Unilever"},
    {"symbol": "ITC.NS", "name": "ITC"},
    {"symbol": "SBIN.NS", "name": "State Bank of India"},
    {"symbol": "BHARTIARTL.NS", "name": "Bharti Airtel"},
    {"symbol": "BAJFINANCE.NS", "name": "Bajaj Finance"},
]

NIFTY_50_FALLBACK = [
    {"symbol": "ADANIENT.NS", "name": "Adani Enterprises"},
    {"symbol": "ADANIPORTS.NS", "name": "Adani Ports"},
    {"symbol": "APOLLOHOSP.NS", "name": "Apollo Hospitals"},
    {"symbol": "ASIANPAINT.NS", "name": "Asian Paints"},
    {"symbol": "AXISBANK.NS", "name": "Axis Bank"},
    {"symbol": "BAJAJ-AUTO.NS", "name": "Bajaj Auto"},
    {"symbol": "BAJFINANCE.NS", "name": "Bajaj Finance"},
    {"symbol": "BAJAJFINSV.NS", "name": "Bajaj Finserv"},
    {"symbol": "BPCL.NS", "name": "Bharat Petroleum"},
    {"symbol": "BHARTIARTL.NS", "name": "Bharti Airtel"},
    {"symbol": "BRITANNIA.NS", "name": "Britannia Industries"},
    {"symbol": "CIPLA.NS", "name": "Cipla"},
    {"symbol": "COALINDIA.NS", "name": "Coal India"},
    {"symbol": "DIVISLAB.NS", "name": "Divi's Laboratories"},
    {"symbol": "DRREDDY.NS", "name": "Dr. Reddy's Laboratories"},
    {"symbol": "EICHERMOT.NS", "name": "Eicher Motors"},
    {"symbol": "GRASIM.NS", "name": "Grasim Industries"},
    {"symbol": "HCLTECH.NS", "name": "HCL Technologies"},
    {"symbol": "HDFCBANK.NS", "name": "HDFC Bank"},
    {"symbol": "HDFCLIFE.NS", "name": "HDFC Life"},
    {"symbol": "HEROMOTOCO.NS", "name": "Hero MotoCorp"},
    {"symbol": "HINDALCO.NS", "name": "Hindalco Industries"},
    {"symbol": "HINDUNILVR.NS", "name": "Hindustan Unilever"},
    {"symbol": "ICICIBANK.NS", "name": "ICICI Bank"},
    {"symbol": "ITC.NS", "name": "ITC Limited"},
    {"symbol": "INDUSINDBK.NS", "name": "IndusInd Bank"},
    {"symbol": "INFY.NS", "name": "Infosys"},
    {"symbol": "JSWSTEEL.NS", "name": "JSW Steel"},
    {"symbol": "KOTAKBANK.NS", "name": "Kotak Mahindra Bank"},
    {"symbol": "LT.NS", "name": "Larsen & Toubro"},
    {"symbol": "LTIM.NS", "name": "LTIMindtree"},
    {"symbol": "M&M.NS", "name": "Mahindra & Mahindra"},
    {"symbol": "MARUTI.NS", "name": "Maruti Suzuki"},
    {"symbol": "NTPC.NS", "name": "NTPC"},
    {"symbol": "NESTLEIND.NS", "name": "Nestle India"},
    {"symbol": "ONGC.NS", "name": "ONGC"},
    {"symbol": "POWERGRID.NS", "name": "Power Grid Corporation"},
    {"symbol": "RELIANCE.NS", "name": "Reliance Industries"},
    {"symbol": "SBILIFE.NS", "name": "SBI Life Insurance"},
    {"symbol": "SBIN.NS", "name": "State Bank of India"},
    {"symbol": "SUNPHARMA.NS", "name": "Sun Pharma"},
    {"symbol": "TCS.NS", "name": "Tata Consultancy Services"},
    {"symbol": "TATACONSUM.NS", "name": "Tata Consumer Products"},
    {"symbol": "TATAMOTORS.NS", "name": "Tata Motors"},
    {"symbol": "TATASTEEL.NS", "name": "Tata Steel"},
    {"symbol": "TECHM.NS", "name": "Tech Mahindra"},
    {"symbol": "TITAN.NS", "name": "Titan Company"},
    {"symbol": "ULTRACEMCO.NS", "name": "UltraTech Cement"},
    {"symbol": "UPL.NS", "name": "UPL"},
    {"symbol": "WIPRO.NS", "name": "Wipro"}
]

NEWS_API_KEY = "3378abff54944530a21836a131f8ad57"

def get_news_headlines(query: str, limit: int = 3) -> list:
    try:
        search_term = query.split('.')[0]
        url = f"https://newsapi.org/v2/everything?q={search_term}&sortBy=publishedAt&apiKey={NEWS_API_KEY}"
        response = requests.get(url, timeout=5)
        data = response.json()
        return [a["title"] for a in data.get("articles", [])[:limit]]
    except:
        return []

@app.get("/api/companies")
async def get_companies():
    return {"global": DEFAULT_COMPANIES, "nifty50": NIFTY_50_FALLBACK}

class PredictionRequest(BaseModel):
    symbol: str

# ================= DAILY =================
@app.post("/api/predict/daily")
async def predict_daily(req: PredictionRequest):
    try:
        ticker = yf.Ticker(req.symbol)
        hist = ticker.history(period="30d")  # fetch more for RSI calculation

        if hist.empty:
            raise HTTPException(status_code=400, detail="No data")

        # Calculate indicators on full data first
        df_full = hist.copy()
        rsi_window = min(14, len(df_full) - 1) if len(df_full) > 1 else 1
        df_full['RSI'] = calculate_rsi(df_full['Close'], window=rsi_window)
        ma_window = min(10, len(df_full))
        df_full['MA'] = moving_average(df_full['Close'], window=ma_window)

        # Now trim to last 10 for display
        df = df_full.tail(10).copy()

        prices = df['Close'].tolist()
        dates = [d.strftime("%Y-%m-%d") for d in df.index]

        rsi_val = float(df['RSI'].iloc[-1]) if not pd.isna(df['RSI'].iloc[-1]) else 50.0
        ma_val = float(df['MA'].iloc[-1]) if not pd.isna(df['MA'].iloc[-1]) else prices[-1]
        vol_val = calculate_volatility(df['Close'])
        price_change = ((prices[-1] - prices[0]) / prices[0]) * 100 if prices[0] != 0 else 0.0
        trend_val = determine_trend(prices, ma_val)

        technical_data = {
            "rsi": rsi_val,
            "ma": ma_val
        }

        # ✅ DETERMINISTIC RULE ENGINE
        engine_result = rule_engine(price_change, rsi_val, trend_val, vol_val)

        headlines = get_news_headlines(req.symbol)

        ai_result = run_finrobot_pipeline(
            prices,
            "daily",
            headlines=headlines,
            indicators=technical_data
        )

        return {
            "symbol": req.symbol,
            "prices": prices,
            "dates": dates,
            "ai_insight": ai_result,
            "rule_engine": engine_result,
            "technicals": {
                "rsi": round(rsi_val, 2),
                "ma": round(ma_val, 2),
                "volatility": round(vol_val, 2),
                "price_change_pct": round(price_change, 2),
                "trend": trend_val
            }
        }

    except Exception:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Error")

# ================= INTRADAY =================
@app.post("/api/predict/intraday")
async def predict_intraday(req: PredictionRequest):
    try:
        ticker = yf.Ticker(req.symbol)
        # Fetch recent intraday data at 30m intervals
        hist = ticker.history(period="5d", interval="30m")

        if hist.empty:
            raise HTTPException(status_code=400, detail="No intraday data available. Market may be closed.")

        # Convert index to IST for proper time display
        if hist.index.tz is not None:
            hist.index = hist.index.tz_convert('Asia/Kolkata')
        
        # Get the most recent trading date (today or last trading day)
        unique_dates = sorted(list(set(hist.index.date)))
        target_date = unique_dates[-1]  # always latest available date

        # Format the date for display
        today_date_str = target_date.strftime("%d %B %Y")  # e.g. "31 March 2026"

        # Filter data for that date only
        day_data = hist[hist.index.date == target_date]

        if len(day_data) < 2:
            raise HTTPException(status_code=400, detail="Not enough intraday data yet. Market may have just opened.")

        # Calculate indicators on full 5d data for RSI/MA accuracy, then filter
        df_full = hist.copy()
        rsi_window = min(14, len(df_full) - 1) if len(df_full) > 1 else 1
        df_full['RSI'] = calculate_rsi(df_full['Close'], window=rsi_window)
        ma_window = min(10, len(df_full))
        df_full['MA'] = moving_average(df_full['Close'], window=ma_window)

        df = df_full[df_full.index.date == target_date].copy()

        prices = df['Close'].tolist()
        times = [d.strftime("%H:%M") for d in df.index]

        rsi_val = float(df['RSI'].iloc[-1]) if not pd.isna(df['RSI'].iloc[-1]) else 50.0
        ma_val = float(df['MA'].iloc[-1]) if not pd.isna(df['MA'].iloc[-1]) else prices[-1]
        vol_val = calculate_volatility(df['Close'])
        price_change = ((prices[-1] - prices[0]) / prices[0]) * 100 if prices[0] != 0 else 0.0
        trend_val = determine_trend(prices, ma_val)

        technical_data = {
            "rsi": rsi_val,
            "ma": ma_val
        }

        # ✅ DETERMINISTIC RULE ENGINE
        engine_result = rule_engine(price_change, rsi_val, trend_val, vol_val)

        headlines = get_news_headlines(req.symbol)

        ai_result = run_finrobot_pipeline(
            prices,
            "intraday_today",
            headlines=headlines,
            indicators=technical_data
        )

        return {
            "symbol": req.symbol,
            "prices": prices,
            "times": times,
            "today_date": today_date_str,
            "ai_insight": ai_result,
            "rule_engine": engine_result,
            "technicals": {
                "rsi": round(rsi_val, 2),
                "ma": round(ma_val, 2),
                "volatility": round(vol_val, 2),
                "price_change_pct": round(price_change, 2),
                "trend": trend_val
            }
        }

    except Exception:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Error")

# ================= STATIC =================
os.makedirs("static", exist_ok=True)
app.mount("/", StaticFiles(directory="static", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", reload=True)