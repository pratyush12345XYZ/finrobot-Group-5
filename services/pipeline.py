import os
import json
import re
import traceback
from dotenv import load_dotenv

load_dotenv()

# We import the official FinRobot class
from finrobot.agents.workflow import FinRobot
import autogen

def run_finrobot_pipeline(prices: list, interval: str, headlines: list = None, indicators: dict = None) -> dict:
    """
    Executes the multi-agent FinRobot pipeline natively using AI4Finance-Foundation/FinRobot tools.
    """
    if not prices or len(prices) < 2:
        return {
            "prediction": "UNKNOWN",
            "confidence": 0,
            "explanation": "Not enough data to make a prediction."
        }
        
    print(f"\n--- Starting Official FinRobot Pipeline [Interval: {interval}] ---")
    
    start_price = prices[0]
    end_price = prices[-1]
    price_change = ((end_price - start_price) / start_price) * 100
    
    # Context Builder
    data_summary = f"Time Horizon: {interval}\nStart Price: {start_price:.2f}\nEnd Price: {end_price:.2f}\nChange: {price_change:.2f}%\nRecent Prices: {prices}\n"
    if indicators:
        data_summary += f"RSI: {indicators.get('rsi', 'N/A')}\nMA: {indicators.get('ma', 'N/A')}\n"
    if headlines:
        data_summary += f"News Headlines: {headlines}\n"

    # Define standard autogen LLM Config expected by FinRobot
    llm_config = {
        "config_list": [
            {
                "model": os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile"),
                "api_key": os.environ.get("GROQ_API_KEY"),
                "base_url": os.environ.get("GROQ_API_BASE", "https://api.groq.com/openai/v1"),
                "price": [0, 0]
            }
        ],
        "cache_seed": None, # Disable caching for live data
        "temperature": 0.2
    }

    # 1. Analyst Agent
    analyst_agent = FinRobot(
        "Financial_Analyst",
        system_message="You are a Financial Analyst. Review the provided numerical and qualitative data. Present a concise summary detailing momentum, trend, and support/resistance levels. Reply exactly and strictly to the prompt.",
        llm_config=llm_config
    )
    
    # 2. Risk Manager Agent
    risk_agent = FinRobot(
        "Statistician",
        system_message="You are a Risk Manager. Read the data context and the Analyst's report. Output a risk assessment and specify Volatility as High, Medium, or Low.",
        llm_config=llm_config
    )
    
    # 3. Trader/Decision Agent
    has_closing_prediction = (interval == "intraday_today")
    schema_definition = """{
      "prediction": "UP" or "DOWN",
      "confidence": float between 50.0 and 99.9,
      "explanation": "A single string formatted with EXACTLY 4 distinct bullet points separated by newlines (\\n). Bullet 1 MUST detail the current market trend. Bullet 2 MUST detail key price support/resistance levels. Bullet 3 MUST detail momentum analysis. Bullet 4 MUST strictly begin with the exact text: 'As an ai i would recomend you to....'" """
      
    if has_closing_prediction:
        schema_definition += ',\n      "closing_price_prediction": 1234.56, \n      "next_30m_price_prediction": 1234.56\n    }'
    else:
        schema_definition += "\n    }"
        
    decision_agent = FinRobot(
        "Expert_Investor",
        system_message=f"You are a Trading Decision Agent forming the final node in a FinRobot pipeline. Synthesize the Analyst and Risk Manager statements to output a FINAL decision. YOU MUST OUTPUT PURE JSON matching exactly this schema without markdown wrappers:\n{schema_definition}",
        llm_config=llm_config
    )

    # Initialize standard User Proxy to sequentially drive the conversation
    user = autogen.UserProxyAgent(
        "User", 
        human_input_mode="NEVER", 
        max_consecutive_auto_reply=0,
        code_execution_config=False
    )
    
    try:
        # Step 1
        print("1/3 Running FinRobot Financial Analyst...")
        user.initiate_chat(analyst_agent, message=f"Analyze this market data:\n{data_summary}", silent=True)
        analyst_msg = user.last_message(analyst_agent)["content"]
        
        # Step 2
        print("2/3 Running FinRobot Risk Manager...")
        user.initiate_chat(risk_agent, message=f"Context:\n{data_summary}\n\nAnalyst Report:\n{analyst_msg}\n\nPlease assess the risk.", silent=True)
        risk_msg = user.last_message(risk_agent)["content"]
        
        # Step 3
        print("3/3 Running FinRobot Expert Investor...")
        user.initiate_chat(decision_agent, message=f"Analyst Analysis:\n{analyst_msg}\n\nRisk Assessor:\n{risk_msg}\n\nProvide the final structured JSON decision.", silent=True)
        decision_msg = user.last_message(decision_agent)["content"]
        
        print("--- FinRobot Pipeline Complete ---\n")
        
        # Attempt to clean the output to parse JSON
        json_match = re.search(r'\{[\s\S]*\}', decision_msg)
        if json_match:
            decision_msg = json_match.group(0)
            
        result_json = json.loads(decision_msg, strict=False)
        
        # Ensure fallback mechanism for missing fields
        if 'prediction' not in result_json:
            result_json['prediction'] = 'UP' if end_price > start_price else 'DOWN'
        if 'confidence' not in result_json:
            result_json['confidence'] = 60.0
        if 'explanation' not in result_json:
            result_json['explanation'] = "Analysis completed, but explanation generation failed."
        if has_closing_prediction:
            if 'closing_price_prediction' not in result_json:
                result_json['closing_price_prediction'] = round(end_price, 2)
            if 'next_30m_price_prediction' not in result_json:
                result_json['next_30m_price_prediction'] = round(end_price, 2)
                
        return result_json
        
    except Exception as e:
        traceback.print_exc()
        direction = "UP" if end_price > start_price else "DOWN"
        fallback = {
            "prediction": direction,
            "confidence": 55.0,
            "explanation": f"FinRobot Pipeline Error: Using fallback naive calculation. The general trend is {direction.lower()}."
        }
        if has_closing_prediction:
            fallback['closing_price_prediction'] = round(end_price, 2)
            fallback['next_30m_price_prediction'] = round(end_price, 2)
        return fallback
