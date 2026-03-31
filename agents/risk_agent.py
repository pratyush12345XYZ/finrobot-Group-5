from agents.base_agent import BaseAgent

class RiskManagerAgent(BaseAgent):
    """
    Agent responsible for analyzing market volatility, finding risk factors, 
    and outputting a standardized risk score based on the Analyst's report.
    """
    def evaluate(self, prices: list, analyst_output: dict) -> dict:
        if not prices or not analyst_output:
            return self.fallback()
            
        start_price = prices[0]
        end_price = prices[-1]
        price_change = ((end_price - start_price) / start_price) * 100
        
        min_price = min(prices)
        max_price = max(prices)
        volatility_spread = ((max_price - min_price) / min_price) * 100
        
        data_summary = f"""
        Price Summary:
        Starting Price: {start_price:.2f}
        Current/Ending Price: {end_price:.2f}
        Price Change: {price_change:.2f}%
        Volatility Spread (High to Low): {volatility_spread:.2f}%
        
        Analyst Findings:
        Trend: {analyst_output.get('trend_analysis', 'N/A')}
        Support/Resistance: {analyst_output.get('support_resistance', 'N/A')}
        Momentum: {analyst_output.get('momentum_analysis', 'N/A')}
        """
        
        system_prompt = """
        You are a Risk Manager Agent in a FinRobot architecture.
        Your job is to evaluate the market conditions provided by the Financial Analyst and assess the risk involved in short-term trading.
        
        You MUST respond ONLY with a valid JSON object matching this schema exactly:
        {
            "volatility_level": "High/Medium/Low",
            "risk_factors": ["string array of 1-3 distinct risk factors identifying market uncertainty"],
            "risk_score": 1, // Integer between 1 (Very Low Risk) to 10 (Very High Risk)
            "risk_assessment": "Brief summary of the primary risks to be aware of."
        }
        Do not include any Markdown formatting or extra text.
        """
        
        user_prompt = f"Evaluate the risk for the following scenario:\n{data_summary}"
        
        return self.execute(system_prompt, user_prompt, max_tokens=400)
        
    def fallback(self) -> dict:
        return {
            "volatility_level": "Unknown",
            "risk_factors": ["System error prevented proper risk evaluation"],
            "risk_score": 5,
            "risk_assessment": "Failed to assess risk."
        }
