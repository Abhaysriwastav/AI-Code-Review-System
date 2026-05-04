import httpx
import json
from typing import Any, Dict, List, Optional
import os

class OllamaClient:
    def __init__(self, base_url: str = None, model: str = "mistral"):
        self.base_url = base_url or os.getenv("OLLAMA_URL", "http://localhost:11434")
        self.model = model

    async def generate(self, prompt: str, system_prompt: str = None) -> str:
        url = f"{self.base_url}/api/generate"
        payload = {
            "model": self.model,
            "prompt": prompt,
            "stream": False,
        }
        if system_prompt:
            payload["system"] = system_prompt

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()
            return response.json().get("response", "")

    async def generate_structured(self, prompt: str, schema: Any, system_prompt: str = None) -> Any:
        # Mistral/Ollama supports JSON mode or we can use structured prompting
        # For simplicity and reliability, we'll use a strong system prompt for JSON output
        full_system_prompt = (system_prompt or "") + f"\n\nYou MUST return a valid JSON object matching this schema: {schema.schema_json()}"
        
        response_text = await self.generate(prompt, system_prompt=full_system_prompt)
        
        # Clean up possible markdown code blocks
        if "```json" in response_text:
            response_text = response_text.split("```json")[1].split("```")[0].strip()
        elif "```" in response_text:
            response_text = response_text.split("```")[1].split("```")[0].strip()
            
        try:
            data = json.loads(response_text)
            return schema(**data)
        except Exception as e:
            print(f"Error parsing JSON: {e}")
            print(f"Raw response: {response_text}")
            raise e
