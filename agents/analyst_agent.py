from agents.base_agent import BaseAgent

class FinancialAnalystAgent(BaseAgent):
    """
    Agent responsible for analyzing price trends and recent news headlines.
    Outputs a structural assessment of market conditions.
    """
    def analyze(self, prices: list, headlines: list = None, indicators: dict = None) -> dict:
        if not prices or len(prices) < 2:
            return self.fallback()
            
        start_price = prices[0]
        end_price = prices[-1]
        price_change = ((end_price - start_price) / start_price) * 100
        
        data_summary = f"""
        Starting Price: {start_price:.2f}
        Current/Ending Price: {end_price:.2f}
        Total Change in Window: {price_change:.2f}%
        Recent Price Sequence: {', '.join([f"{p:.2f}" for p in prices])}
        """
        
        if headlines:
            data_summary += f"\nRecent News Headlines for Context:\n"
            for i, hl in enumerate(headlines, 1):
                data_summary += f"{i}. {hl}\n"
                
        if indicators:
            data_summary += f"\nTechnical Indicators:\n"
            data_summary += f"RSI: {indicators.get('rsi', 'N/A')}\n"
            data_summary += f"Moving Average: {indicators.get('ma', 'N/A')}\n"
                
        system_prompt = """
        You are a Financial Analyst Agent operating within a FinRobot architecture.
        Your job is to analyze the provided raw price data and news headlines to determine the current trend, key support/resistance levels, and momentum.
        
        You MUST respond ONLY with a valid JSON object matching this schema exactly:
        {
            "trend_analysis": "Detailed explanation of the current trend (e.g. Bullish, Bearish, Neutral, Reversing).",
            "support_resistance": "Identified key price levels acting as support or resistance based on the sequence.",
            "momentum_analysis": "Analysis of the price momentum and potential continuation or reversal."
        }
        Do not include any Markdown formatting or extra text.
        """
        
        user_prompt = f"Analyze the following stock data:\n{data_summary}"
        
        return self.execute(system_prompt, user_prompt, max_tokens=500)
        
    def fallback(self) -> dict:
        return {
            "trend_analysis": "Unable to analyze trend due to lack of data or error.",
            "support_resistance": "Unknown levels.",
            "momentum_analysis": "Unknown momentum."
        }
