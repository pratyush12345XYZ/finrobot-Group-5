import os
import json
from openai import OpenAI
import traceback

class FinRobotAgent:
    def __init__(self):
        # We use the standard OpenAI python client, pointing it to Groq's API base URL.
        self.client = OpenAI(
            api_key=os.environ.get("GROQ_API_KEY"),
            base_url=os.environ.get("GROQ_API_BASE", "https://api.groq.com/openai/v1")
        )
        self.model_name = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")
        
    def generate_prediction(self, system_prompt: str, user_prompt: str, max_tokens: int = 400) -> dict:
        """
        Executes the FinRobot language model analysis with the given prompts.
        """
        try:
            response = self.client.chat.completions.create(
                model=self.model_name,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.2, # Low temperature for more analytical/consistent outputs
                max_tokens=max_tokens
            )
            
            result_text = response.choices[0].message.content
            return json.loads(result_text)
        except Exception as e:
            print(f"LLM Error in FinRobot: {e}")
            traceback.print_exc()
            return None
