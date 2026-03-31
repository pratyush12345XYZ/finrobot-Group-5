from utils.llm_client import FinRobotAgent

class BaseAgent:
    """
    Base class for FinRobot specialized agents.
    Provides common execution flow and error handling.
    """
    def __init__(self):
        self.llm = FinRobotAgent()
        
    def execute(self, system_prompt: str, user_prompt: str, max_tokens: int = 400) -> dict:
        """
        Calls the LLM with the defined prompts.
        Falls back to default if the call fails.
        """
        result = self.llm.generate_prediction(system_prompt, user_prompt, max_tokens=max_tokens)
        if not result:
            return self.fallback()
        return result
        
    def fallback(self) -> dict:
        """
        Must be implemented by subclasses to provide a graceful degradation.
        """
        return {}
