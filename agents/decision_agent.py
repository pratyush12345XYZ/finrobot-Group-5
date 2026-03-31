from agents.base_agent import BaseAgent

class TradingDecisionAgent(BaseAgent):
    """
    Final agent in the pipeline that synthesizes the analyst report and 
    risk manager evaluation to make a strict Trading Decision (BUY/SELL/HOLD or UP/DOWN).
    """
    def decide(self, interval: str, prices: list, analyst_output: dict, risk_output: dict) -> dict:
        if not prices:
            return self.fallback(prices)
            
        has_closing_prediction = (interval == "intraday_today")
        end_price = prices[-1]
        
        data_summary = f"""
        Interval Horizon: {interval}
        Current Price: {end_price:.2f}
        
        Analyst Report:
        Trend: {analyst_output.get('trend_analysis', 'N/A')}
        Support/Resistance: {analyst_output.get('support_resistance', 'N/A')}
        Momentum: {analyst_output.get('momentum_analysis', 'N/A')}
        
        Risk Manager Report:
        Volatility Level: {risk_output.get('volatility_level', 'N/A')}
        Risk Score: {risk_output.get('risk_score', 'N/A')}/10
        Risk Factors: {', '.join(risk_output.get('risk_factors', []))}
        Assessment: {risk_output.get('risk_assessment', 'N/A')}
        """
        
        schema_definition = """{
      "prediction": "UP" or "DOWN",
      "confidence": float between 50.0 and 99.9,
      "explanation": "A single string formatted with EXACTLY 4 distinct bullet points separated by newlines (\\n). Bullet 1 MUST detail the current market trend. Bullet 2 MUST detail key price support/resistance levels. Bullet 3 MUST detail momentum analysis. Bullet 4 MUST strictly begin with the exact text: 'As an ai i would recomend you to....'" """
        
        if has_closing_prediction:
            schema_definition += ',\n      "closing_price_prediction": 1234.56, # Float representing the predicted final closing price for today\n      "next_30m_price_prediction": 1234.56 # Float representing the predicted price in exactly 30 minutes\n    }'
        else:
            schema_definition += "\n    }"
            
        system_prompt = f"""
        You are a Trading Decision Agent, the final component of a FinRobot multi-agent pipeline.
        Your job is to synthesize the Analyst's report and Risk Manager's evaluation into a final, actionable decision.
        
        You MUST respond ONLY with a valid JSON object matching this schema exactly:
        {schema_definition}
        """
        
        if interval == "intraday_today":
            system_prompt += "\nSPECIAL CONTEXT: This is TODAY's intraday data. Your 'prediction' must specifically forecast the price movement for the *next 30 minutes*. You must ALSO provide your 'next_30m_price_prediction' and 'closing_price_prediction'."
        elif interval == "intraday_yesterday":
            system_prompt += "\nSPECIAL CONTEXT: This is YESTERDAY's intraday data. Your prediction must specifically forecast the opening trend for the *next trading session*."

        user_prompt = f"Synthesize and make a decision based on the following pipeline outputs:\n{data_summary}"
        
        result_json = self.execute(system_prompt, user_prompt, max_tokens=600)
        
        # Ensure fallback mechanism is properly applied against invalid responses
        if not result_json:
            return self.fallback(prices)
            
        # Ensure required fields exist in output
        if 'prediction' not in result_json:
            result_json['prediction'] = 'UP' if prices[-1] > prices[0] else 'DOWN'
            
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
        
    def fallback(self, prices: list = None) -> dict:
        direction = "UP"
        if prices and len(prices) > 1:
            direction = "UP" if prices[-1] > prices[0] else "DOWN"
            
        return {
            "prediction": direction,
            "confidence": 55.0,
            "explanation": f"API Error in Decision Agent: Using fallback naive calculation. The general trend is {direction.lower()}."
        }
